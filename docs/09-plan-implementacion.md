# 09 — Plan de Implementación Paso a Paso

> El orden de arranque recomendado (primero la caja offline, luego la nube) está en la [guía 00](00-guia-inicio-desarrollo.md). Si hay diferencias con las fases de abajo, la guía 00 manda; este documento sigue siendo la referencia de alcance por fase y de la estructura del repositorio.

## 1. Estructura del repositorio (monorepo)

```text
tienditaonline/
├── apps/
│   ├── pos/                     # FRONT 1 — Tauri 2: caja offline + reportes de sucursal (online)
│   │   ├── src-tauri/
│   │   │   ├── domain/          # ventas, turnos, impuestos, NumberingStrategy, FiscalDocumentStrategy
│   │   │   ├── storage/         # SQLCipher, migraciones, repositorios
│   │   │   ├── sync/            # outbox, push, pull, heartbeat, circuit breaker
│   │   │   ├── api_client/      # cliente bff-pos (reportes, sin caché)
│   │   │   ├── devices/         # ESC/POS, cajón, balanza
│   │   │   └── security/        # keystore, licencia, PIN
│   │   └── src/                 # UI: modules/{sales,cash,customers,reports}
│   ├── management/              # FRONT 2 — Expo universal (web + iOS + Android): administración + reportes, siempre online
│   └── platform-console/        # Consola interna super admin: tiendas, usuarios, planes, cobros, licencias locales
├── services/                    # Microservicios NestJS (uno por carpeta, despliegue independiente)
│   ├── tenant-service/
│   ├── identity-service/
│   ├── device-service/
│   ├── catalog-service/
│   ├── sync-service/
│   ├── sales-service/
│   ├── cash-service/
│   ├── inventory-service/
│   ├── customer-service/
│   ├── reporting-service/
│   ├── audit-service/
│   ├── notification-service/
│   ├── bff-pos/                 # reportes para la caja
│   ├── bff-app/                 # administración + reportes para la App de Gestión
│   ├── bff-platform/            # consola del super admin
│   └── einvoicing-service/      # FUTURO: solo esqueleto + README, no se despliega
├── packages/
│   ├── contracts/               # Zod: eventos, DTOs, OpenAPI, JSON Schema
│   ├── service-kit/             # base común: outbox relay, inbox, RLS, OTel, health, circuit breaker, Kafka
│   ├── tax-engine/              # Motor de impuestos (TS) + golden tests compartidos con Rust
│   ├── ui-reports/              # Componentes de gráficas/tablas compartidos entre ambos fronts
│   ├── admin-ui/                # Pantallas de administración (RN Web) con DataProvider remoto (bff-app) o local (Edición Local)
│   └── config/                  # eslint, tsconfig
├── db/
│   ├── cloud/<servicio>/        # migraciones por servicio
│   └── local/                   # migraciones SQLite
├── infra/
│   ├── terraform/               # VPC, EKS, Aurora, MSK, Redis, S3, KMS, Cloudflare
│   ├── helm/                    # chart base + values por servicio
│   ├── argocd/                  # apps GitOps por entorno
│   └── local/                   # docker-compose / Tilt
├── tools/
│   └── terminal-simulator/      # simulador de N cajas offline/online (carga y E2E)
└── docs/
```

Herramientas: pnpm workspaces + Turborepo (builds afectados por cambio), Cargo workspace para Rust, Changesets para versionado. `packages/service-kit` evita que cada microservicio reimplemente outbox, inbox, RLS, trazas y breakers.

## 2. Fases

### Fase 0 — Fundaciones de plataforma
1. Validar con un contador el texto del comprobante interno y la declaración de "no obligado a facturar" del onboarding.
2. Seleccionar pasarela de suscripciones (Wompi / PayU / Mercado Pago).
3. Monorepo, CI por servicio (lint, test, SAST, secret scanning), convenciones de commits, ADRs.
4. Terraform de `dev` y `staging`: VPC, **EKS**, Aurora, **MSK/Redpanda + Schema Registry**, Redis, S3, KMS, Secrets Manager, Cloudflare. Linkerd, ArgoCD, KEDA.
5. `packages/service-kit`: outbox relay, inbox, RLS por transacción, OpenTelemetry, health checks, circuit breaker, cliente Kafka. **Plantilla de microservicio** (generador) que lo incluye todo.
6. `packages/contracts` con el sobre de eventos y primeros esquemas.
7. Observabilidad (Tempo, Loki, Prometheus, Grafana, Sentry) y entorno local con Tilt.

**Entregable:** un microservicio "hola mundo" generado desde la plantilla, desplegado por ArgoCD en staging, publicando y consumiendo un evento con traza distribuida completa.

### Fase 1 — Servicios núcleo + App de Gestión (administración básica)
1. `tenant-service`, `identity-service` (con Keycloak/Cognito + MFA), `device-service`, `catalog-service` con sus BD, RLS y pruebas de aislamiento.
2. Saga de creación de tienda desde la consola (tenant → dueño → sucursal → `CAJA-01` → activación), roles y permisos sembrados, planes y entitlements.
3. `bff-app` con endpoints de administración (sucursales, cajas y enrolamiento, usuarios/roles/PIN, catálogo, precios, importación Excel).
4. **App de Gestión Expo** (web + iOS + Android): activación de cuenta, login OIDC/MFA, detector de conectividad ("Sin conexión"), pantallas de administración con escáner de cámara para códigos.
5. **Consola del super admin** (`platform-console` + `bff-platform`): crear tiendas y usuarios, planes.

**Entregable:** creas una tienda desde la consola; el dueño activa su cuenta en el celular o el navegador, carga su catálogo, crea cajeros y obtiene el QR para enrolar su primera caja.

### Fase 2 — App Instalable: caja offline (MVP)
1. Proyecto Tauri, núcleo Rust, SQLCipher, migraciones locales, keystore.
2. Enrolamiento por código/QR + licencia firmada + bootstrap de catálogo.
3. Login por PIN offline (Argon2id) y permisos locales.
4. Turnos: apertura, movimientos, cierre con arqueo ciego, reporte del turno (Z).
5. Venta: escáner, búsqueda, carrito, descuentos, artículo genérico, pago efectivo/mixto, cambio.
6. Motor de impuestos con golden tests idénticos en TS y Rust.
7. Consecutivo interno por caja + `NumberingStrategy`/`FiscalDocumentStrategy` (implementaciones `Internal`/`NoFiscal`) + comprobante ESC/POS (58 y 80 mm) + cajón.
8. Outbox y escritura atómica; pruebas de corte de energía.

**Entregable:** una caja vende todo el día sin internet e imprime comprobantes.

### Fase 3 — Sincronización y servicios de dominio
1. `sync-service`: push con idempotencia, orden por `terminal_seq`, event store, outbox → `pos.events`.
2. Consumidores con inbox: `sales-service`, `cash-service`, `inventory-service`, `customer-service`, `audit-service`.
3. Modelo de bajada (`downstream_changes`) alimentado por eventos de catálogo/usuarios/clientes/stock; pull por `xid8`; bootstrap desde S3.
4. Heartbeat en `device-service`.
5. Sync engine cliente con circuit breaker, backoff + jitter, `Retry-After`.
6. Retry topics + DLT + cuarentena y su resolución en la App de Gestión.
7. Simulador de cajas: duplicados, huecos, reconexión masiva, caída de un consumidor.

**Entregable:** 3 cajas offline venden el mismo producto; al reconectar, stock, ventas, turnos y cartera cuadran exactamente aunque un servicio haya estado caído.

### Fase 4 — Reportes en ambos frontends
1. `reporting-service` (modelos de lectura) + rutas `/v1/app/reports/*` en `bff-app` + `bff-pos` (`/v1/pos-reports/*`).
2. Módulo Reportes de la App Instalable (sucursal, solo online).
3. Reportes en la **App de Gestión**: dashboard en vivo (SSE), ventas, productos, turnos, cartera, inventario, estado de cajas, auditoría, exportaciones.
4. `notification-service` + notificaciones push.
5. `packages/ui-reports` compartido por ambos fronts.

**Entregable:** el dueño ve desde el celular y el navegador lo que vende cada caja con < 60 s de atraso.

### Fase 5 — Funcionalidad comercial completa (lanzamiento piloto)
1. Devoluciones, anulaciones, cambios, reimpresiones con aprobación de supervisor.
2. Clientes y fiados (modos SOFT/ALLOCATED), abonos, estado de cuenta, recordatorios por WhatsApp.
3. Inventario en la App de Gestión: recepciones, ajustes, conteos con cámara, artículos genéricos por crear.
4. Administración completa en la App de Gestión (promociones, cupos, conciliación, step-up MFA, control optimista).
5. Suscripciones: facturas, cobro automático y manual, job de mora (avisos D−5…D+60), estados `RESTRICTED`/`SUSPENDED`, prórrogas, licencia de caja con fecha pagada, pantalla de morosidad en la consola.
6. Actualizaciones automáticas firmadas (Instalable) y OTA (App de Gestión).
7. Pentest externo, pruebas de carga, chaos testing, simulacro de DR.
8. **Piloto con 5–10 tiendas de barrio reales** durante al menos 4 semanas.

**Entregable:** lanzamiento comercial de planes Esencial y Crecimiento.

### Fase 6 — Escala y plan Corporativo
1. Multi-sucursal, traslados entre bodegas, pedidos a proveedores.
2. Analítica avanzada con ClickHouse alimentado desde Kafka.
3. Integración de datáfonos y pagos QR (Nequi, Daviplata, Bre-B) con confirmación automática.
4. Exportaciones contables (Siigo, World Office, Alegra).
5. Shards dedicados para tenants grandes.

### Fase 6b — Edición Local (pago único)
Puede adelantarse si hay demanda, porque reutiliza la caja (Fase 2) y las pantallas de administración (`packages/admin-ui`).
1. Build `local` de Tauri sin módulos de red; esquema [db/local/002_local_edition.sql](../db/local/002_local_edition.sql).
2. Proveedor de datos local para `packages/admin-ui` (productos, inventario, usuarios, fiados, reportes SQL).
3. Contraseña de administrador, código de recuperación y restablecimiento firmado.
4. Licencia perpetua: serial, activación en línea única (huella tolerante + llave del equipo en TPM/DPAPI), desactivación, `updates_until`, prueba de 15 días registrada en línea; endpoints `/v1/local-activation/*` en `device-service`.
5. Datos y equipo: respaldo `.tdbak` cifrado y verificado (automático + manual + recordatorio), asistente de solicitud de cambio de equipo, restauración con resumen y respaldo previo.
6. Módulo de licencias locales en la consola (generar, transferir, renovar, restablecer).
7. Exportación para migrar a la nube.

### Fase 7 (FUTURA) — Módulo de facturación electrónica DIAN
Se activa cuando haya demanda de tenants obligados a facturar. Diseño completo en [06 §1](06-cumplimiento-colombia.md).
1. Validar con contador y proveedor tecnológico: documento POS, contingencia, cálculo de CUDE offline, tope UVT, prefijos por caja.
2. Desplegar `einvoicing-service` (esquema ya definido) consumiendo `sales.events`; adapter del proveedor tecnológico con circuit breaker.
3. Asignación de bloques de numeración DIAN por caja (stream `numbering` en el pull).
4. Implementaciones `DianBlockNumbering` y `DianPosFiscalDocument` en la caja (CUDE + QR + plantilla `receipt.dian_pos.v1`).
5. Notas crédito/ajuste, contingencia, almacenamiento WORM, reportes de estado DIAN.
6. Activación por feature flag `einvoicing` y `fiscal_mode` por tenant; set de pruebas de habilitación.

No requiere modificar `sync-service`, `sales-service` ni los demás consumidores: es un consumidor nuevo + estrategias nuevas en la caja.

## 3. Definición de terminado (DoD) por historia

- [ ] Pruebas unitarias del dominio (≥ 80 % en módulos de ventas, impuestos, sync, caja).
- [ ] Prueba de aislamiento de tenant para cada endpoint nuevo.
- [ ] Idempotencia probada para cada evento/comando nuevo (inbox en consumidores).
- [ ] Evento nuevo registrado en Schema Registry con compatibilidad hacia atrás.
- [ ] El servicio no lee BD ajenas; datos externos solo por eventos o API del dueño.
- [ ] Comportamiento offline definido y probado (si toca la caja).
- [ ] Permisos y auditoría definidos.
- [ ] Métricas, logs y trazas añadidos; alertas si aplica.
- [ ] Migración de BD compatible hacia atrás.
- [ ] Contratos (`packages/contracts`) actualizados y prueba de contrato verde.
- [ ] Revisión de seguridad (checklist OWASP) en el PR.

## 4. Equipo mínimo sugerido

| Rol | Cantidad |
|---|---|
| Tech lead / arquitecto | 1 |
| Backend (Node/TS, microservicios + Kafka) | 3 |
| Rust + Tauri (App Instalable) | 2 |
| Frontend React / Expo (UI Instalable + App de Gestión) | 2 |
| DevOps / SRE (EKS, Kafka, observabilidad) | 1–2 |
| QA (automatización + pruebas en tienda) | 1 |
| Producto + soporte con conocimiento de retail colombiano | 1 |
| Asesor contable/tributario | Externo |

## 5. Riesgos principales y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Complejidad operativa de microservicios con equipo pequeño | Alto | `service-kit` + plantilla de servicio, GitOps, observabilidad desde el día 1, servicios gestionados (MSK, Aurora) |
| Consistencia eventual confunde al usuario ("vendí y no aparece") | Medio | Indicador de frescura en reportes, SLO de < 60 s, lag monitoreado |
| Costo fijo de infraestructura antes de tener clientes | Medio | BDs de servicio en un mismo clúster, MSK Serverless, nodos Graviton/Spot |
| Tenant obligado a facturar usa el sistema sin módulo DIAN | Medio | Declaración en onboarding, leyenda en comprobante, términos del servicio, lista de espera del módulo |
| Hardware heterogéneo en tiendas (impresoras genéricas, PCs antiguos) | Medio | Lista de hardware certificado, drivers ESC/POS genéricos, Tauri liviano |
| Pérdida de datos local antes de sincronizar | Alto | WAL + FULL sync, snapshots cifrados, alertas de outbox antiguo |
| Fraude interno en caja | Medio | Arqueo ciego, auditoría, aprobaciones, reportes de anomalías |
| Reconexiones masivas | Medio | Jitter, Retry-After, Kafka, autoescalado, pruebas de carga |
| Crecimiento de datos | Medio | Particionamiento, archivo a S3, ClickHouse |

## 6. Checklist de salida a producción

- [ ] Texto del comprobante interno y declaración de no obligado revisados por contador/abogado.
- [ ] Términos y condiciones, política de tratamiento de datos, DPA con tenants.
- [ ] Pentest sin hallazgos críticos/altos abiertos.
- [ ] Prueba de carga con 2× la capacidad objetivo.
- [ ] Restauración PITR y simulacro de DR documentados.
- [ ] Runbooks: lag de Kafka alto, mensajes en DLT, caída de un microservicio, caída de BD, caja con outbox antiguo, rotación de llaves, revocación de caja, incidente de datos.
- [ ] Monitoreo y guardias (on-call) definidos.
- [ ] Mesa de ayuda y base de conocimiento para tenderos (videos cortos, WhatsApp de soporte).
