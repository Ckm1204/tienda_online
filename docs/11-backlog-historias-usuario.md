# 11 — Product Backlog Completo de Historias de Usuario (Formato Gherkin)

Este documento contiene el **backlog integral** de **TienditaOnline** (SaaS POS Offline-First + Edición Local para Colombia). Está diseñado para que, al completar todas las historias aquí listadas, el producto quede **100 % funcional y listo para operar con público real**.

---

## Convenciones y Estándares del Backlog

1. **Estructura jerárquica:** `Épica (EP-XX)` → `Feature (FT-XX.Y)` → `Historia de Usuario (HU-XXX)`.
2. **Formato de cada Historia de Usuario:**
   - **ID y Título corto** con casilla de seguimiento `- [ ]`.
   - **Metadatos:** `[Hito]` · `[Prioridad: P0 Crítica | P1 Alta | P2 Media | P3 Futura]` · `[Puntos: 1, 2, 3, 5, 8]` · `[Componente/Servicio]` · `[Caso de Uso: UC-XXX / EXX]`.
   - **Narrativa:** *Como* `<rol>`, *quiero* `<acción/objetivo>`, *para* `<beneficio de negocio>`.
   - **Criterios de Aceptación en Gherkin:** bloques `Escenario:` con `Dado` (*Given*), `Cuando` (*When*), `Entonces` (*Then*) y `Y` (*And*), cubriendo flujo feliz, alternativos y errores.
3. **Definición de Terminado (DoD) global aplicable a toda HU:**
   - Código tipado estricto (TypeScript `strict` / Rust sin `unwrap()` en rutas operativas).
   - Pruebas unitarias y de integración automatizadas de los escenarios Gherkin.
   - Si expone o consume datos multi-tenant: prueba automática de aislamiento RLS (`tenant_a` no lee/escribe `tenant_b`).
   - Si procesa eventos o comandos de escritura: prueba de idempotencia (enviar 2 veces produce 1 solo efecto).
   - Trazas OpenTelemetry, logs estructurados sin PII y auditoría si es acción crítica.

## Resumen General de Épicas

| Épica | Nombre | Hito Principal | Alcance |
|---|---|---|---|
| **EP-01** | Cimientos de Ingeniería, Monorepo, Contratos y Service-Kit | Hito 1 | Monorepo, CI/CD, Docker local, contratos Zod/Rust, `service-kit`, motor de impuestos |
| **EP-02** | App Instalable — Base Local, Seguridad de Dispositivo y Autenticación | Hito 2 / 3 | Tauri, SQLCipher, DPAPI/TPM, enrolamiento, licencia, PIN offline Argon2id, reloj |
| **EP-03** | App Instalable — Ventas, Carrito, Precios y Medios de Pago (Offline) | Hito 2 | Escaneo, pesaje, descuentos, espera, cobro atómico, pagos mixtos, devoluciones |
| **EP-04** | App Instalable — Periféricos de Mostrador e Impresión ESC/POS | Hito 2 | Impresora 58/80mm, comprobante interno, reimpresión, cajón monedero, balanza |
| **EP-05** | App Instalable — Control de Turnos, Efectivo y Arqueo Ciego | Hito 2 | Apertura, entradas/salidas, safe drop, arqueo ciego COP, descuadres, reporte Z |
| **EP-06** | App Instalable — Clientes y Cartera de Fiados en Caja (Offline) | Hito 2 | Alta rápida con Habeas Data, venta fiada, modos de cupo, abonos, saldo local |
| **EP-07** | Motor de Sincronización Offline-First (`sync-service` + Cliente Rust) | Hito 4 | Outbox local, push idempotente, orden `terminal_seq`, pull `xid8`, bootstrap, heartbeat |
| **EP-08** | Microservicios Core en Nube (`tenant`, `identity`, `device`, `catalog`) | Hito 3 | Tenants, planes, entitlements, OIDC/MFA, roles, cajas, catálogo, precios, importación |
| **EP-09** | Microservicios Operativos (`sales`, `cash`, `inventory`, `customer`, `audit`) | Hito 4 / 5 | Ventas, turnos, kardex por deltas, proveedores/compras, cartera, auditoría SHA-256 |
| **EP-10** | App de Gestión Web + Móvil (Expo, Siempre Online) y `bff-app` | Hito 3 / 5 | Activación, login MFA, guardia online, catálogo, cámara, inventario, clientes, pagos |
| **EP-11** | Reportería CQRS, Dashboard en Vivo y Notificaciones Multicanal | Hito 4 / 5 | `reporting-service`, SSE, reportes en ambos fronts, Excel/PDF, push/WhatsApp/email |
| **EP-12** | Consola Super Admin, Facturación SaaS, Avisos de Mora y Bloqueos | Hito 3 / 6 | `platform-console`, creación de tiendas, cobros, dunning D-5..D+60, prórrogas, bloqueo |
| **EP-13** | Edición Local (Pago Único, Activación Online Única y Respaldos `.tdbak`) | Hito L | Build `local`, admin con clave, activación TPM/huella, respaldo, traslado de PC, restore |
| **EP-14** | Infraestructura Productiva, Seguridad OWASP, Observabilidad, DR y Piloto | Hito 7 | Terraform, WAF, mTLS, alertas, chaos/load testing, updater firmado, piloto y legal |
| **EP-15** | Módulo Futuro — Facturación Electrónica y POS Electrónico DIAN | Fase 7 | `einvoicing-service`, bloques DIAN, CUDE/QR, UBL 2.1, proveedor tecnológico, WORM |

---

# ÉPICA 01: Cimientos de Ingeniería, Monorepo, Contratos y Service-Kit

## Feature 01.1: Monorepo, Configuración Base y Pipeline CI/CD

### - [ ] HU-001: Inicialización del monorepo con pnpm workspaces, Turborepo y Cargo workspace
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[repo]` · `[UC: Base]`
- **Como** desarrollador de la plataforma, **quiero** un monorepo configurado con `pnpm`, `Turborepo` y `Cargo workspace`, **para** compilar, probar y compartir código entre los microservicios, la App de Gestión y la App Instalable.
```gherkin
Escenario: Compilación y ejecución de tareas incrementales con caché
  Dado un clon limpio del repositorio en Windows o Linux
  Cuando ejecuto "pnpm install" y luego "pnpm build" y "pnpm test"
  Entonces todos los paquetes de "packages/*", "services/*" y "apps/*" compilan sin errores
  Y una segunda ejecución de "pnpm build" sin cambios termina desde la caché de Turborepo en menos de 3 segundos
```

### - [ ] HU-002: Reglas estrictas de linting, formato y tipado en TypeScript y Rust
- **Meta:** `[Hito 1]` · `[P0]` · `[2 pts]` · `[packages/config]` · `[UC: Base]`
- **Como** tech lead, **quiero** reglas compartidas de ESLint, Prettier, `tsconfig` estricto y `clippy`/`rustfmt`, **para** impedir errores comunes como uso de `any`, `float` para dinero, SQL concatenado o `unwrap()` en producción.
```gherkin
Escenario: Rechazo de código que incumple reglas de seguridad o calidad
  Dado un archivo TypeScript con tipo "any" o una consulta SQL concatenada con template literals
  Cuando ejecuto "pnpm lint" o intento hacer commit con Husky
  Entonces el linter falla indicando la línea exacta y bloquea el commit

Escenario: Rechazo de unwrap() en módulos de dominio Rust
  Dado un archivo en "apps/pos/src-tauri/domain" que contiene ".unwrap()"
  Cuando ejecuto "cargo clippy -- -D warnings"
  Entonces la compilación falla por la regla "clippy::unwrap_used"
```

### - [ ] HU-003: Pipeline de Integración Continua en GitHub Actions con SAST y escaneo de secretos
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[ci]` · `[UC: Seguridad]`
- **Como** equipo de ingeniería, **quiero** que cada Pull Request ejecute lint, pruebas unitarias, pruebas de contrato, Semgrep (SAST), `npm audit`, `cargo audit` y Gitleaks, **para** evitar que lleguen vulnerabilidades o secretos a la rama `main`.
```gherkin
Escenario: PR válido pasa todas las verificaciones
  Dado un Pull Request hacia la rama "main" sin secretos ni vulnerabilidades críticas
  Cuando se dispara el workflow de GitHub Actions
  Entonces los jobs de lint, test-ts, test-rust, contract-check, semgrep y gitleaks finalizan en verde
  Y se habilita el botón de merge

Escenario: Bloqueo por credencial accidental en el código
  Dado un commit que incluye una llave privada o token de API en texto plano
  Cuando corre el job de "gitleaks"
  Entonces el pipeline falla inmediatamente y reporta el archivo comprometido
```

### - [ ] HU-004: Entorno de desarrollo local con Docker Compose e inicialización de 12 bases de datos
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[infra/local]` · `[UC: Base]`
- **Como** desarrollador, **quiero** levantar PostgreSQL 16, Redis 7, Redpanda, Keycloak, MinIO y Mailpit con un solo comando y crear las 12 bases de datos por servicio, **para** desarrollar y correr pruebas de integración en mi máquina.
```gherkin
Escenario: Arranque limpio de infraestructura local
  Dado que Docker Desktop está activo
  Cuando ejecuto "pnpm dev:infra"
  Entonces todos los contenedores pasan a estado "healthy"
  Y en PostgreSQL existen las bases "tenant_db", "identity_db", "device_db", "catalog_db", "sync_db", "sales_db", "cash_db", "inventory_db", "customer_db", "reporting_db", "audit_db" y "notification_db"
```

### - [ ] HU-005: Ejecutor de migraciones SQL por servicio y verificación de esquemas en CI
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[db/cloud]` · `[UC: Base]`
- **Como** desarrollador, **quiero** un comando `pnpm db:migrate` que aplique `000_common.sql` y las migraciones de cada microservicio en su base correspondiente, **para** validar todos los scripts SQL desde el primer día.
```gherkin
Escenario: Aplicación idempotente de todas las migraciones en nube y local
  Dado un contenedor PostgreSQL 16 recién iniciado y una base SQLite vacía
  Cuando ejecuto "pnpm db:migrate" dos veces seguidas
  Entonces la primera ejecución crea todas las tablas, funciones, triggers y políticas RLS sin errores
  Y la segunda ejecución detecta las migraciones ya aplicadas y termina con código 0 sin alterar datos
```

---

## Feature 01.2: Contratos Compartidos (`packages/contracts`) y Generación de Tipos

### - [ ] HU-006: Esquema Zod del sobre de evento (`EventEnvelope`) con hash canónico y HLC
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[packages/contracts]` · `[UC: Sync]`
- **Como** arquitecto, **quiero** definir el sobre estándar de eventos (`EventEnvelope`) con `event_id` (UUIDv7), `terminal_seq`, `hlc`, `schema_version` y `payload_hash` (SHA-256 canónico), **para** garantizar un contrato único entre la caja y la nube.
```gherkin
Escenario: Validación exitosa y cálculo determinístico de payload_hash
  Dado un evento "sale.completed" con sus propiedades en distinto orden de llaves JSON
  Cuando serializo canónicamente el payload y valido el sobre con "EventEnvelope.parse"
  Entonces el "payload_hash" calculado es idéntico en TypeScript y en Rust
  Y el sobre pasa la validación sin errores

Escenario: Rechazo de evento sin secuencia o con UUID inválido
  Dado un sobre con "terminal_seq" igual a 0 o un "event_id" que no es UUID
  Cuando se valida con "EventEnvelope.safeParse"
  Entonces devuelve error detallando el campo inválido
```

### - [ ] HU-007: Esquemas Zod de todos los eventos de subida del POS (v1)
- **Meta:** `[Hito 1]` · `[P0]` · `[5 pts]` · `[packages/contracts]` · `[UC-C01..V20, UC-K01..K03]`
- **Como** desarrollador, **quiero** los esquemas Zod versionados de `cash.session.opened`, `cash.session.closed`, `cash.session.reopened`, `cash.movement.recorded`, `sale.completed`, `sale.voided`, `sale.returned`, `credit.payment.received`, `customer.created`, `customer.updated` y `audit.recorded`, **para** validar cada evento en la caja antes de guardarlo y en la nube antes de aceptarlo.
```gherkin
Escenario: Validación de evento sale.completed con pagos mixtos e impuestos por línea
  Dado un payload de "sale.completed" con montos en centavos enteros y cantidades en milésimas
  Cuando se valida contra "SaleCompletedV1"
  Entonces la validación es exitosa
  Y si la suma de "payments" (menos cambio) no coincide con "totals.total_cents" ni es venta a crédito, la validación falla
```

### - [ ] HU-008: Generación automática de JSON Schema y structs Rust desde `packages/contracts`
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[packages/contracts, apps/pos]` · `[UC: Sync]`
- **Como** desarrollador Rust, **quiero** que `pnpm contracts:codegen` genere los JSON Schemas y los structs Rust con `Serialize`/`Deserialize` a partir de los esquemas Zod, **para** evitar desincronización entre el cliente POS y los microservicios.
```gherkin
Escenario: Detección en CI de cambio en contrato sin regenerar tipos Rust
  Dado que se agrega un campo nuevo en un esquema Zod de "packages/contracts"
  Cuando corre el pipeline de CI sin haber ejecutado "pnpm contracts:codegen"
  Entonces el job falla indicando que los artefactos generados están desactualizados
```

### - [ ] HU-009: Verificador de compatibilidad hacia atrás (`BACKWARD`) de esquemas de eventos
- **Meta:** `[Hito 1]` · `[P1]` · `[2 pts]` · `[packages/contracts]` · `[UC-E24]`
- **Como** equipo de plataforma, **quiero** que el CI bloquee cambios incompatibles dentro de una misma `schema_version` (como eliminar un campo o hacerlo obligatorio sin valor por defecto), **para** que cajas con la versión N-1 sigan sincronizando sin fallar.
```gherkin
Escenario: Bloqueo al agregar un campo obligatorio en una versión existente
  Dado el esquema "SaleCompletedV1" ya publicado en la rama principal
  Cuando un PR agrega un campo requerido sin incrementar a "SaleCompletedV2"
  Entonces el verificador de compatibilidad falla el build exigiendo crear una nueva versión del esquema
```

---

## Feature 01.3: `packages/service-kit` y Plantilla de Microservicio

### - [ ] HU-010: Middleware y helper de base de datos con Row-Level Security (`SET LOCAL app.tenant_id`)
- **Meta:** `[Hito 1]` · `[P0]` · `[5 pts]` · `[packages/service-kit]` · `[UC: Seguridad RLS]`
- **Como** arquitecto de seguridad, **quiero** que toda transacción de base de datos en cualquier microservicio ejecute automáticamente `SET LOCAL app.tenant_id = '<uuid>'` usando un rol `NOBYPASSRLS`, **para** que PostgreSQL impida fugas de datos entre tiendas incluso si falta un `WHERE` en el código.
```gherkin
Escenario: Aislamiento automático entre dos tiendas en la misma tabla
  Dado que existen productos de "tenant_A" y de "tenant_B" en "catalog_db"
  Cuando una petición autenticada con el JWT de "tenant_A" ejecuta "SELECT * FROM products" sin cláusula WHERE
  Entonces la base de datos retorna únicamente las filas de "tenant_A"

Escenario: Fallo seguro cuando no hay contexto de tenant
  Dado un repositorio que intenta consultar una tabla protegida por RLS sin haber establecido "app.tenant_id"
  Cuando se ejecuta la consulta
  Entonces retorna 0 filas o lanza un error de contexto faltante y nunca devuelve datos de ningún tenant
```

### - [ ] HU-011: Implementación de Transactional Outbox y Relay hacia Kafka en `service-kit`
- **Meta:** `[Hito 1]` · `[P0]` · `[5 pts]` · `[packages/service-kit]` · `[UC: Resiliencia]`
- **Como** desarrollador backend, **quiero** un helper `outbox.enqueue(tx, event)` y un proceso `OutboxRelay` que publique a Kafka con `acks=all` y marque `published_at`, **para** garantizar que ningún cambio de base de datos se quede sin publicar su evento.
```gherkin
Escenario: Publicación garantizada tras caída temporal de Kafka
  Dado que el broker de Kafka está caído cuando un servicio guarda un cambio en su base de datos
  Cuando la transacción local hace COMMIT
  Entonces el registro queda en la tabla "outbox" con "published_at = NULL"
  Y en cuanto Kafka vuelve a estar disponible, el "OutboxRelay" publica el mensaje y actualiza "published_at"
```

### - [ ] HU-012: Implementación de Idempotent Consumer (`inbox.once`) con reintentos y Dead Letter Topic
- **Meta:** `[Hito 1]` · `[P0]` · `[5 pts]` · `[packages/service-kit]` · `[UC-E03, UC-E31]`
- **Como** desarrollador backend, **quiero** un consumidor base que registre `(event_id, consumer)` en la tabla `inbox` dentro de la misma transacción del efecto de negocio y envíe fallos repetidos a `<topic>.retry` y `<topic>.dlt`, **para** procesar cada evento exactamente una vez aunque Kafka lo entregue duplicado.
```gherkin
Escenario: Entrega duplicada de un mismo evento desde Kafka
  Dado que el evento "0192a8d4-..." ya fue procesado por "inventory-service"
  Cuando Kafka vuelve a entregar el mismo mensaje por un rebalanceo
  Entonces "inbox.once" detecta el "event_id" existente, hace commit del offset y no vuelve a descontar stock

Escenario: Envío a DLT tras agotar reintentos
  Dado un mensaje que provoca un error transitorio persistente
  Cuando falla 3 veces en el tópico de reintentos con backoff exponencial
  Entonces el mensaje se publica en "<topic>.dlt" con el detalle del error y el consumidor continúa con el siguiente mensaje
```

### - [ ] HU-013: Envoltorio de Circuit Breaker (`opossum`), timeouts y formato de error RFC 9457
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[packages/service-kit]` · `[UC: Resiliencia]`
- **Como** ingeniero SRE, **quiero** que toda llamada HTTP/gRPC saliente de un servicio o BFF use un circuit breaker con timeout obligatorio y que todos los errores HTTP respondan en formato Problem Details (RFC 9457) sin exponer trazas internas, **para** evitar fallos en cascada y fugas de información.
```gherkin
Escenario: Apertura del circuito ante fallos repetidos de un servicio destino
  Dado que "reporting-service" responde con timeout en 5 llamadas consecutivas desde "bff-app"
  Cuando llega una sexta solicitud al BFF
  Entonces el circuit breaker está en estado ABIERTO y falla en menos de 5 ms sin llamar al servicio caído
  Y devuelve un JSON RFC 9457 con "status: 503", "code: SERVICE_UNAVAILABLE" y "trace_id"
```

### - [ ] HU-014: Instrumentación OpenTelemetry (trazas, métricas RED y logs JSON sin PII) y endpoints `/health`
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[packages/service-kit]` · `[UC: Observabilidad]`
- **Como** SRE, **quiero** que cada microservicio propague `traceparent` por HTTP y por cabeceras de Kafka, exponga `/health/live` y `/health/ready` y redacte campos sensibles en logs, **para** seguir una venta desde la caja hasta todos los servicios consumidores.
```gherkin
Escenario: Traza distribuida completa a través de HTTP y Kafka
  Dado un lote enviado a "POST /v1/sync/push" con "X-Request-Id"
  Cuando el evento pasa por "sync-service", Kafka y "sales-service"
  Entonces todos los spans comparten el mismo "trace_id" en Tempo/Grafana
  Y ningún log contiene contraseñas, PINs, tokens ni números de tarjeta
```

### - [ ] HU-015: Generador de microservicio (`pnpm gen:service`) y prueba de humo extremo a extremo
- **Meta:** `[Hito 1]` · `[P1]` · `[2 pts]` · `[tools]` · `[UC: Base]`
- **Como** desarrollador, **quiero** un comando que genere el esqueleto completo de un microservicio NestJS conectado a `service-kit`, **para** crear los servicios del sistema con estructura idéntica en minutos.
```gherkin
Escenario: Creación de servicio nuevo listo para compilar y probar
  Cuando ejecuto "pnpm gen:service ejemplo-service"
  Entonces se crea "services/ejemplo-service" con Dockerfile, configuración Drizzle, RLS, outbox, inbox, health y test de integración que pasa en verde
```

---

## Feature 01.4: Motor de Impuestos Determinístico Compartido (`packages/tax-engine` + Rust)

### - [ ] HU-016: Cálculo de IVA (19%, 5%), Exento (0%), Excluido e INC (8%) con precios con impuesto incluido
- **Meta:** `[Hito 2]` · `[P0]` · `[5 pts]` · `[packages/tax-engine, apps/pos]` · `[UC-V01]`
- **Como** dueño de tienda en Colombia, **quiero** que el sistema calcule hacia atrás la base gravable y el impuesto a partir del precio de venta con impuesto incluido (`base = round(precio / (1 + tarifa))`), **para** que los precios exhibidos al público sean exactos y la discriminación de impuestos cuadre al centavo.
```gherkin
Escenario: Producto con IVA 19% incluido en el precio
  Dado un producto con precio unitario de $2.500 (250.000 centavos) e impuesto "IVA19" (1900 puntos básicos)
  Cuando se calcula una línea de cantidad 3 unidades sin descuento
  Entonces el total de la línea es $7.500,00
  Y la suma de "base + impuesto" es exactamente igual al total de la línea sin diferencia de centavos
```

### - [ ] HU-017: Cálculo de impuestos de valor fijo por unidad (impuesto a las bolsas plásticas)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[packages/tax-engine, apps/pos]` · `[UC-V19]`
- **Como** cajero, **quiero** que al agregar bolsas plásticas se sume el impuesto fijo por unidad configurado para el año vigente, **para** cumplir con el cobro de bolsas sin cálculos manuales.
```gherkin
Escenario: Venta con 2 bolsas plásticas
  Dado que el impuesto "BOLSA" es de tipo "FIXED_PER_UNIT" con valor de $66 por unidad
  Cuando se agregan 2 bolsas a la venta
  Entonces el detalle de impuestos registra 2 unidades con $132 de impuesto fijo
```

### - [ ] HU-018: Suite de 200+ Golden Tests compartidos entre TypeScript y Rust para el motor de impuestos y redondeo COP
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[packages/tax-engine, apps/pos]` · `[UC: Impuestos]`
- **Como** arquitecto, **quiero** un archivo JSON con más de 200 casos de prueba (cantidades fraccionarias por peso, descuentos por línea y globales, múltiples impuestos, redondeo de efectivo a $50 COP) ejecutado tanto en Vitest como en `cargo test`, **para** garantizar que la caja y la nube jamás difieran ni en 1 centavo.
```gherkin
Escenario: Ejecución de la suite compartida en ambos lenguajes
  Dado el archivo "packages/tax-engine/golden-cases.json" con 200 casos de venta
  Cuando corro "pnpm test" en TypeScript y "cargo test" en Rust
  Entonces ambos motores producen exactamente los mismos valores de "subtotal_cents", "discount_cents", "tax_cents", "rounding_cents" y "total_cents" en los 200 casos
```

---

# ÉPICA 02: App Instalable (Tauri) — Base Local, Seguridad de Dispositivo y Autenticación

## Feature 02.1: Shell Tauri, Almacenamiento Cifrado SQLCipher y Respaldos Locales

### - [ ] HU-019: Aplicación Tauri 2 con flags de compilación `cloud` y `local` y modo pantalla completa
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC: Base POS]`
- **Como** tendero con un PC de gama baja, **quiero** una aplicación instalable liviana que arranque en menos de 3 segundos y pueda compilarse en modo `cloud` o `local`, **para** operar la caja con fluidez y sin consumir toda la memoria del equipo.
```gherkin
Escenario: Arranque rápido y separación de builds por feature flag
  Dado el proyecto "apps/pos"
  Cuando compilo con "--features local --no-default-features"
  Entonces el binario resultante no incluye el módulo de sincronización HTTP
  Y al abrirse en Windows consume menos de 180 MB de RAM en reposo
```

### - [ ] HU-020: Base de datos SQLite cifrada con SQLCipher, llave en DPAPI/Keystore y modo WAL + FULL sync
- **Meta:** `[Hito 2]` · `[P0]` · `[5 pts]` · `[apps/pos/storage]` · `[UC-E02, UC-E13]`
- **Como** responsable de seguridad, **quiero** que la base local se cifre con SQLCipher (AES-256) usando una clave guardada en Windows DPAPI / Android Keystore y opere con `journal_mode=WAL` y `synchronous=FULL`, **para** que nadie pueda abrir el archivo si roban el PC y no se corrompa si se va la luz.
```gherkin
Escenario: Intento de abrir el archivo de base de datos con un cliente externo
  Dado el archivo "pos.db" generado por la aplicación en disco
  Cuando un usuario intenta abrirlo con "sqlite3" estándar sin la clave del keystore
  Entonces recibe el error "file is not a database" y no puede leer ninguna tabla

Escenario: Verificación de integridad automática al iniciar tras apagón
  Dado que la aplicación se cerró abruptamente por un corte de energía
  Cuando vuelve a iniciar
  Entonces ejecuta "PRAGMA integrity_check", recupera el journal WAL y abre sin pérdida de ventas confirmadas
```

### - [ ] HU-021: Purga automática de eventos enviados antiguos y alerta de poco espacio en disco
- **Meta:** `[Hito 2]` · `[P1]` · `[2 pts]` · `[apps/pos/storage]` · `[UC-E14]`
- **Como** operador de tienda, **quiero** que la caja elimine eventos `SENT` con más de 30 días y ventas sincronizadas de turnos cerrados con más de 90 días, y me avise si queda menos de 1 GB libre en disco, **para** que el computador nunca se llene ni deje de vender.
```gherkin
Escenario: Purga segura que respeta eventos pendientes
  Dado que en "outbox" hay 500 eventos "SENT" de hace 40 días y 10 eventos "PENDING" de hace 45 días
  Cuando corre la tarea de mantenimiento diario
  Entonces se eliminan únicamente los 500 eventos "SENT"
  Y los 10 eventos "PENDING" o "REJECTED" permanecen intactos
```

### - [ ] HU-022: Protección en el instalador/desinstalador para no borrar datos pendientes de sincronizar
- **Meta:** `[Hito 2]` · `[P1]` · `[2 pts]` · `[apps/pos]` · `[UC-E15]`
- **Como** dueño de tienda, **quiero** que al reinstalar o actualizar la aplicación se conserve la base de datos local y que al desinstalar me advierta si hay ventas sin subir a la nube, **para** no perder ventas por un error técnico en el computador.
```gherkin
Escenario: Reinstalación sobre una instalación existente con ventas pendientes
  Dado un PC que tiene 25 eventos "PENDING" en "outbox"
  Cuando se ejecuta el instalador de una nueva versión encima
  Entonces la base de datos y la clave del keystore se conservan y los 25 eventos siguen listos para sincronizar
```

---

## Feature 02.2: Enrolamiento de Caja SaaS, Licencia Firmada y Ventana de Gracia Offline

### - [ ] HU-023: Generación de par de llaves Ed25519 del dispositivo en el keystore del sistema operativo
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/pos/security]` · `[UC-O02]`
- **Como** sistema de seguridad, **quiero** que al iniciar el enrolamiento la caja genere un par de llaves Ed25519 cuya llave privada quede protegida en el keystore/TPM del equipo, **para** firmar cada lote de sincronización e impedir que una caja clonada suplante a otra.
```gherkin
Escenario: Firma de lote con la llave del dispositivo
  Dado un dispositivo enrolado con su llave privada almacenada en el keystore
  Cuando el motor de sincronización prepara un lote "POST /v1/sync/push"
  Entonces genera la cabecera "X-Device-Signature" válida verificable con la llave pública registrada en "device-service"
```

### - [ ] HU-024: Pantalla y flujo de enrolamiento de caja mediante código de un solo uso o lectura de QR
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[apps/pos]` · `[UC-O02]`
- **Como** administrador, **quiero** ingresar el código de 8 caracteres (o escanear el QR generado en la App de Gestión) en la App Instalable recién instalada, **para** enlazar la caja a mi tienda y descargar automáticamente el catálogo, los usuarios y la configuración inicial.
```gherkin
Escenario: Enrolamiento exitoso y descarga inicial (bootstrap)
  Dado un código de enrolamiento vigente "K7Q2-9XMA" para "CAJA-01"
  Cuando lo ingreso en la pantalla de enrolamiento con conexión a internet
  Entonces la app llama a "POST /v1/devices/enroll", guarda "tenant_id", "branch_id", "terminal_id", "receipt_prefix = C01" y el "license_token"
  Y descarga y aplica el paquete de bootstrap quedando lista en la pantalla de login por PIN

Escenario: Código expirado o ya utilizado
  Dado un código de enrolamiento que venció hace 5 minutos o ya fue usado en otro PC
  Cuando intento enrolar la caja
  Entonces muestra el mensaje "Código inválido o vencido; genera uno nuevo desde la App de Gestión"
```

### - [ ] HU-025: Verificación local de licencia firmada Ed25519, avisos de gracia offline y modo solo lectura
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[apps/pos/security]` · `[UC-E11, UC-E12]`
- **Como** plataforma SaaS, **quiero** que la caja valide localmente la firma Ed25519 y la fecha `exp` de su licencia (con soporte de rotación de llave por `kid`), avise desde el 50 % de la ventana de gracia y pase a solo lectura al vencer o si `status = SUSPENDED`, **para** permitir operar sin internet durante días pero bloquear el no pago.
```gherkin
Escenario: Operación normal sin internet dentro de la ventana de gracia
  Dado que la caja perdió internet hace 4 días y su licencia vence en 6 días
  Cuando el cajero inicia turno y registra ventas
  Entonces la caja opera sin interrupciones y muestra al dueño un aviso discreto "4 días sin conexión — quedan 6 días de operación offline"

Escenario: Bloqueo de apertura de nuevo turno cuando la licencia expiró o la tienda está suspendida
  Dado que "license_expires_at" es menor a la hora actual o el estado de la licencia es "SUSPENDED"
  Cuando se intenta abrir un turno nuevo o registrar una venta sin turno
  Entonces el sistema impide vender y muestra "Caja en modo solo lectura: conéctate a internet o ponte al día en tu suscripción"
  Y permite cerrar un turno que estuviera abierto, reimprimir comprobantes y enviar el outbox pendiente
```

### - [ ] HU-026: Ejecución de revocación remota de caja (equipo robado o reemplazado)
- **Meta:** `[Hito 3]` · `[P1]` · `[3 pts]` · `[apps/pos/security]` · `[UC-O03, UC-E13]`
- **Como** dueño de tienda, **quiero** que si revoco una caja desde la App de Gestión, al primer contacto con la nube la caja intente subir sus eventos pendientes, se bloquee y destruya la clave local de SQLCipher, **para** proteger la información si se robaron el computador.
```gherkin
Escenario: Caja revocada recibe señal en el heartbeat
  Dado que el administrador marcó la terminal como "REVOKED"
  Cuando la caja envía su heartbeat y recibe "flags.revoked = true"
  Entonces intenta un último push de los eventos pendientes en el outbox
  Y elimina la clave de SQLCipher del keystore del sistema operativo y muestra "Esta caja fue desvinculada de la tienda"
```

---

## Feature 02.3: Login Offline por PIN, Bloqueo Progresivo y Cambio Rápido de Cajero

### - [ ] HU-027: Pantalla de inicio de sesión en caja con selección de usuario y verificación local de PIN Argon2id
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/security]` · `[UC-O06]`
- **Como** cajero, **quiero** seleccionar mi nombre y digitar mi PIN numérico de 4 a 6 dígitos sin necesitar internet, **para** entrar a vender en menos de 2 segundos.
```gherkin
Escenario: Login exitoso sin conexión a internet
  Dado que el usuario "Carlos" está activo en la tabla local "users" con su "pin_hash" Argon2id
  Cuando selecciona "Carlos" e ingresa su PIN correcto
  Entonces inicia sesión en el núcleo Rust con sus permisos cargados en memoria
```

### - [ ] HU-028: Bloqueo progresivo por intentos fallidos de PIN y registro en auditoría
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/security]` · `[UC-O06]`
- **Como** dueño de tienda, **quiero** que tras 5 intentos fallidos de PIN se bloquee ese usuario por 5 minutos (y tras 10 intentos quede bloqueado hasta que un supervisor o el dueño lo desbloquee) registrando cada fallo en auditoría, **para** impedir que adivinen el PIN de otro empleado.
```gherkin
Escenario: Bloqueo temporal al quinto intento fallido
  Dado un usuario con 4 intentos fallidos seguidos
  Cuando ingresa un quinto PIN incorrecto
  Entonces "locked_until" se fija a 5 minutos en el futuro, se inserta un evento "audit.recorded" con "action = auth.pin.failed_lock"
  Y cualquier intento durante esos 5 minutos es rechazado aunque digite el PIN correcto
```

### - [ ] HU-029: Bloqueo rápido de pantalla y cambio de operador en caja
- **Meta:** `[Hito 2]` · `[P1]` · `[2 pts]` · `[apps/pos]` · `[UC-O07]`
- **Como** cajero, **quiero** bloquear la pantalla con una tecla (`F12` o botón "Bloquear") cuando me levanto del mostrador, **para** que nadie registre ventas ni abra el cajón con mi usuario.
```gherkin
Escenario: Bloqueo y desbloqueo conservando el carrito en curso
  Dado que el cajero tiene 3 productos escaneados en el carrito actual
  Cuando presiona "F12"
  Entonces la pantalla se cubre con el selector de PIN
  Y al volver a digitar su PIN, recupera exactamente el carrito donde iba
```

---

## Feature 02.4: Autorizaciones en Caja, Auditoría Encadenada y Protección de Reloj

### - [ ] HU-030: Modal de aprobación en caja con PIN de supervisor o dueño y regla `approved_by != requested_by`
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/security]` · `[UC-V08, UC-V13, UC-V18]`
- **Como** dueño de tienda, **quiero** que cuando un cajero intente una acción restringida (anular, devolver, descuento mayor al tope, vender genérico, abrir cajón, exceder cupo de fiado) aparezca un cuadro pidiendo el PIN de un supervisor o del dueño, **para** autorizar en el mostrador sin cerrar la sesión del cajero.
```gherkin
Escenario: Supervisor autoriza una anulación solicitada por el cajero
  Dado que el cajero "Carlos" (sin permiso "sale.void") solicita anular una venta
  Cuando aparece el modal de autorización y la supervisora "Luisa" (con permiso "sale.void") digita su PIN
  Entonces el núcleo verifica que "Luisa != Carlos" y que "Luisa" tiene el permiso
  Y ejecuta la acción registrando "requested_by = Carlos" y "approved_by = Luisa"

Escenario: Autoaprobación permitida únicamente para el Dueño en el plan Tendero
  Dado una tienda en plan "TENDERO" donde el usuario que atiende la caja es el "OWNER"
  Cuando realiza una anulación con su propio PIN
  Entonces la operación se permite y queda marcada en auditoría como "self_approved = true"
```

### - [ ] HU-031: Bitácora de auditoría local con cadena de hash SHA-256 (`prev_hash` → `hash`)
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/storage]` · `[UC-R04]`
- **Como** auditor, **quiero** que cada acción sensible en la caja se guarde en `local_audit` encadenando el hash SHA-256 del registro anterior y se encone como evento `audit.recorded`, **para** detectar cualquier intento de borrar o alterar registros locales.
```gherkin
Escenario: Encadenamiento criptográfico de eventos de auditoría
  Dado que el último registro en "local_audit" tiene "hash = H1"
  Cuando el cajero elimina un producto ya escaneado del carrito
  Entonces se inserta un nuevo registro con "prev_hash = H1" y "hash = SHA256(H1 || datos_canonicos)"
  Y en la misma transacción se encola el evento "audit.recorded" en "outbox"
```

### - [ ] HU-032: Reloj Lógico Híbrido (HLC) y bloqueo por retroceso del reloj del sistema operativo
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/security]` · `[UC-E10]`
- **Como** plataforma, **quiero** que la caja mantenga `max_seen_local_time` y un HLC en cada evento, y si el reloj de Windows/Android retrocede más de 5 minutos bloquee el cobro hasta que un supervisor o dueño confirme la hora, **para** evitar que alteren fechas de ventas o alarguen la licencia offline cambiando la fecha del PC.
```gherkin
Escenario: Detección de atraso intencional del reloj del computador
  Dado que "max_seen_local_time" en "device_state" es "2026-10-31 14:00:00"
  Cuando alguien cambia la hora del PC a "2026-10-25 14:00:00" e intenta cobrar
  Entonces el cobro es bloqueado con el mensaje "Se detectó un cambio hacia atrás en el reloj del equipo"
  Y se registra un evento de auditoría "clock.rollback_detected"
```

---

# ÉPICA 03: App Instalable — Ventas, Carrito, Precios y Medios de Pago (Offline)

## Feature 03.1: Escaneo, Búsqueda Instantánea y Gestión del Carrito

### - [ ] HU-033: Lectura de código de barras por teclado HID con validación EAN/UPC y anti-rebote
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC-V01, UC-E20]`
- **Como** cajero, **quiero** que al pasar un producto por el lector de código de barras se agregue al carrito en menos de 50 ms sin importar en qué campo esté el cursor, acumulando la cantidad si lo escaneo varias veces, **para** cobrar rápido en horas pico.
```gherkin
Escenario: Escaneo consecutivo del mismo producto
  Dado que el código "7702004003509" corresponde a "Gaseosa 400ml" a $2.500
  Cuando el lector envía "7702004003509" + Enter dos veces seguidas
  Entonces el carrito tiene 1 línea de "Gaseosa 400ml" con cantidad 2 y total $5.000

Escenario: Rechazo de lectura corrupta con dígito de control EAN-13 inválido
  Dado una ráfaga del lector de 13 dígitos cuyo dígito verificador EAN-13 no coincide y no existe en la tabla local
  Cuando termina la ráfaga
  Entonces suena una alerta de error y no se agrega basura al carrito
```

### - [ ] HU-034: Búsqueda instantánea de productos por nombre, SKU o categoría con atajos de teclado
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC-V01]`
- **Como** cajero, **quiero** buscar productos escribiendo parte del nombre (ej. `arroz diana 500`) o tocando botones grandes de acceso rápido para productos sin código (pan, huevos, cilantro), **para** vender sin detener la fila.
```gherkin
Escenario: Búsqueda por fragmentos de texto en menos de 30 ms sobre 50.000 productos
  Dado un catálogo local con 50.000 productos
  Cuando presiono "F2" y escribo "leche entera"
  Entonces la lista muestra las coincidencias en menos de 30 ms con su precio vigente y existencia estimada
  Y al presionar Enter se agrega al carrito
```

### - [ ] HU-035: Modificación de cantidad, eliminación auditada de ítem escaneado y vaciado de carrito
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-V12]`
- **Como** dueño de tienda, **quiero** que el cajero pueda cambiar la cantidad o quitar un producto del carrito, pero que toda eliminación de un ítem ya escaneado quede registrada en auditoría, **para** detectar el fraude clásico de "escanear, cobrarle al cliente y borrar antes de cerrar la venta".
```gherkin
Escenario: Eliminación de un ítem ya escaneado genera registro de auditoría
  Dado que el carrito tiene "Aceite 1L" por $12.000
  Cuando el cajero elimina esa línea del carrito
  Entonces la línea desaparece del carrito y se recalcula el total
  Y se registra en "local_audit" y "outbox" la acción "cart.item.remove_after_scan" con producto, precio y cajero
```

---

## Feature 03.2: Pesaje, Códigos de Empaque (`pack_qty`) y Artículo Genérico

### - [ ] HU-036: Venta de productos por peso (entrada manual, balanza serial o código EAN-13 de balanza)
- **Meta:** `[Hito 2]` · `[P0]` · `[5 pts]` · `[apps/pos]` · `[UC-V05]`
- **Como** cajero de fruver o carnicería en tienda de barrio, **quiero** vender productos marcados con `is_weighted = true` leyendo el peso desde la balanza, desde una etiqueta EAN-13 con prefijo `20–29` (que trae peso o precio embebido) o digitando los gramos, **para** cobrar exacto al gramo.
```gherkin
Escenario: Escaneo de etiqueta EAN-13 generada por balanza con peso embebido
  Dado el producto "Queso Campesino" con SKU "01045", "is_weighted = true" y precio $24.000/kg
  Cuando escaneo el código de balanza "2001045003759" (375 gramos)
  Entonces se agrega al carrito 0,375 kg de "Queso Campesino" por un total de $9.000
```

### - [ ] HU-037: Reconocimiento de códigos de barra de empaque o paca (`pack_qty`)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-V06]`
- **Como** cajero, **quiero** que al escanear el código de barras de una paca o caja (ej. `pack_qty = 12`) se agreguen las 12 unidades al carrito y se descuenten 12 unidades del inventario, **para** no tener que digitar la multiplicación manualmente.
```gherkin
Escenario: Escaneo de código de barra de six-pack
  Dado un registro en "product_barcodes" con "pack_qty_milli = 6000" asociado a "Cerveza Lata"
  Cuando escaneo ese código de barras
  Entonces la línea del carrito registra 6 unidades y el movimiento local de inventario descuenta 6 unidades
```

### - [ ] HU-038: Venta de "Artículo genérico" para productos aún no creados en el catálogo
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC-V07, UC-I10]`
- **Como** cajero, **quiero** poder vender un producto nuevo cuyo código aún no existe usando la opción "Artículo genérico" con descripción, precio manual y aprobación de supervisor/dueño, **para** no perder la venta y que luego aparezca en la App de Gestión en la lista de productos por crear.
```gherkin
Escenario: Producto no encontrado vendido como artículo genérico con aprobación
  Dado que escaneo un código que no existe en "product_barcodes"
  Cuando elijo "Vender como artículo genérico", escribo "Ponqué Ramo nuevo" por $3.200 y el supervisor aprueba con su PIN
  Entonces la línea se agrega al carrito usando el producto de sistema "GENERIC_ITEM"
  Y el evento "sale.completed" marca la línea para que "catalog-service" la registre en "generic_item_sales"
```

---

## Feature 03.3: Descuentos, Cambio de Precio, Redondeo COP, Bolsas y Carritos en Espera

### - [ ] HU-039: Descuento por línea o global con tope para cajero y aprobación para descuentos mayores
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC-V08]`
- **Como** dueño de tienda, **quiero** definir un porcentaje máximo de descuento que el cajero puede aplicar solo (ej. 5 %) y exigir PIN de supervisor/dueño por encima de ese tope, **para** dar flexibilidad comercial sin regalar el margen.
```gherkin
Escenario: Descuento dentro del tope permitido al cajero
  Dado que el tope de descuento sin aprobación es 5 %
  Cuando el cajero aplica 5 % de descuento a una línea de $10.000
  Entonces el descuento de $500 se aplica inmediatamente sin pedir PIN

Escenario: Descuento superior al tope exige aprobación y queda auditado
  Dado que el cajero intenta aplicar 15 % de descuento
  Cuando el sistema solicita autorización y el supervisor ingresa su PIN
  Entonces se aplica el descuento y se registra en auditoría con "requested_by" y "approved_by"
```

### - [ ] HU-040: Sobrescritura de precio unitario en caja con autorización y auditoría
- **Meta:** `[Hito 2]` · `[P1]` · `[2 pts]` · `[apps/pos]` · `[UC-V10]`
- **Como** supervisor, **quiero** autorizar con mi PIN un cambio puntual del precio de un producto en el carrito (ej. producto próximo a vencer), **para** resolver situaciones en mostrador dejando rastro en auditoría.
```gherkin
Escenario: Cambio de precio en una venta específica sin alterar el catálogo
  Dado un producto cuyo precio en catálogo es $5.000
  Cuando el supervisor autoriza venderlo en esta cuenta a $3.500
  Entonces la línea de venta guarda "unit_price_cents = 350000", el catálogo local sigue en $5.000 y se audita "sale.price.override"
```

### - [ ] HU-041: Atajo de bolsas plásticas y redondeo de efectivo a múltiplos de $50 COP
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-V19]`
- **Como** cajero, **quiero** un botón rápido `+ Bolsa` en la pantalla de cobro y que cuando el pago sea en efectivo el total se redondee al múltiplo de $50 COP configurado registrando la diferencia en `rounding_cents`, **para** poder entregar vueltas con las monedas que circulan en Colombia.
```gherkin
Escenario: Redondeo de pago en efectivo y cálculo de vueltas
  Dado una venta cuyo total exacto con impuestos es $4.832 y el paso de redondeo en efectivo es $50 a favor del cliente
  Cuando el cajero selecciona pago en "Efectivo" y recibe un billete de $5.000
  Entonces "rounding_cents" es -3200 (-$32), el valor a cobrar en efectivo es $4.800 y el cambio a devolver es $200
```

### - [ ] HU-042: Suspender (parquear) y recuperar carritos en espera sin consumir consecutivo
- **Meta:** `[Hito 2]` · `[P1]` · `[3 pts]` · `[apps/pos]` · `[UC-V11]`
- **Como** cajero, **quiero** poner en espera la compra de un cliente que olvidó algo en el pasillo (`F6 Suspender`) y seguir atendiendo al siguiente de la fila, **para** no frenar la caja ni consumir números de comprobante antes de cobrar.
```gherkin
Escenario: Suspender una venta en curso y recuperarla minutos después
  Dado un carrito con 6 productos por $28.500
  Cuando presiono "Suspender venta" con la nota "Señor camisa azul"
  Entonces el carrito se guarda en "parked_carts", la pantalla queda limpia y no se ha consumido ningún "receipt_number"
  Y al abrir "Ventas en espera" y elegir "Señor camisa azul", los 6 productos vuelven al carrito activo
```

---

## Feature 03.4: Cobro Atómico (`CompleteSale`), Pagos Mixtos e Idempotencia de Clic

### - [ ] HU-043: Escritura atómica de la venta en SQLite (venta + líneas + pagos + stock + fiado + outbox + consecutivo)
- **Meta:** `[Hito 2]` · `[P0]` · `[8 pts]` · `[apps/pos/domain]` · `[UC-V01, UC-E02, UC-E29, UC-E30]`
- **Como** dueño de tienda, **quiero** que al presionar "Cobrar" toda la operación ocurra en una única transacción SQLite y sea idempotente por `cart_id`, **para** que un doble clic o un apagón jamás produzca una venta a medias, un salto en el consecutivo ni un doble cobro.
```gherkin
Escenario: Cobro exitoso escribe todas las tablas locales en una sola transacción
  Dado un turno abierto y un carrito válido con "cart_id = C1" y 2 productos
  Cuando ejecuto el comando "CompleteSale"
  Entonces en una sola transacción SQLite se incrementa "next_receipt_number" (ej. "C01-000042") y "next_terminal_seq"
  Y se insertan las filas en "sales", "sale_lines", "sale_payments", "local_stock_movements", "local_audit" y "outbox"
  Y solo después del COMMIT se envía la orden a la impresora y al cajón monedero

Escenario: Doble clic en el botón Cobrar no duplica la venta
  Dado que el cajero hace doble clic rápido sobre "Cobrar" para el mismo "cart_id = C1"
  Cuando llegan las dos invocaciones al núcleo Rust
  Entonces la segunda invocación detecta que "cart_id = C1" ya fue procesado y devuelve la misma venta "C01-000042"

Escenario: Rechazo de venta con total cero o negativo
  Dado un carrito cuyo total es $0 o menor
  Cuando se intenta ejecutar "CompleteSale" (sin ser un cambio de producto autorizado)
  Entonces el comando es rechazado con error "INVALID_SALE_TOTAL"
```

### - [ ] HU-044: Cobro con medios de pago múltiples (efectivo, datáfono, Nequi, Daviplata, Bre-B, transferencia, fiado)
- **Meta:** `[Hito 2]` · `[P0]` · `[5 pts]` · `[apps/pos]` · `[UC-V02, UC-V20]`
- **Como** cajero, **quiero** dividir una misma cuenta entre varios medios de pago (ej. $10.000 en efectivo + $15.000 por Nequi) registrando la referencia de los pagos digitales para conciliación posterior, **para** adaptarme a cómo pagan los clientes en tiendas de barrio.
```gherkin
Escenario: Pago mixto entre efectivo y Nequi
  Dado una venta por $25.000
  Cuando el cajero registra $10.000 en "CASH" (recibe billete de $20.000) y $15.000 en "NEQUI" con referencia "M48192"
  Entonces se guardan dos filas en "sale_payments":
    | method | amount_cents | tendered_cents | change_cents | reference |
    | CASH   | 1000000      | 2000000        | 1000000      | NULL      |
    | NEQUI  | 1500000      | NULL           | NULL         | M48192    |
  Y el pago en Nequi queda marcado en el evento con "reconciliation = PENDING"
```

---

## Feature 03.5: Anulaciones, Devoluciones Parciales/Totales y Cambios de Producto

### - [ ] HU-045: Anulación completa de una venta del turno actual con aprobación de supervisor
- **Meta:** `[Hito 5]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC-V13]`
- **Como** supervisor, **quiero** anular un comprobante emitido por error en el turno actual indicando el motivo obligatorio y mi PIN, **para** revertir el cobro, reponer el inventario y descontar el efectivo o saldo de fiado sin borrar el comprobante original.
```gherkin
Escenario: Anulación de venta en efectivo repone stock y ajusta el esperado de caja
  Dado la venta "C01-000042" por $8.000 en efectivo con 2 unidades de "Leche 1L"
  Cuando el supervisor aprueba la anulación con motivo "Cliente se arrepintió antes de pagar"
  Entonces la venta pasa a estado "VOIDED", se inserta en "sale_returns" con "kind = VOID"
  Y se inserta un movimiento local de inventario "+2" para "Leche 1L" y se encola el evento "sale.voided"
```

### - [ ] HU-046: Devolución parcial o total de productos (misma caja u otra caja de la sucursal)
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[apps/pos]` · `[UC-V14, UC-E23]`
- **Como** supervisor, **quiero** buscar un comprobante por su número (`C01-000042` local o consultando `/v1/pos-reports/receipts/lookup` si fue en otra caja) y devolver una o varias líneas en efectivo o abonando a la deuda del cliente, **para** atender reclamos o garantías controlando que no se devuelva más de lo comprado.
```gherkin
Escenario: Devolución parcial impide devolver más unidades de las vendidas
  Dado una venta que tenía 3 unidades de "Atún Lata" y 1 unidad ya fue devuelta ayer
  Cuando el supervisor intenta registrar una devolución de 3 unidades adicionales sobre la misma venta
  Entonces el sistema lo rechaza indicando que solo quedan 2 unidades disponibles para devolver

Escenario: Devolución offline de venta realizada en otra caja aún no sincronizada
  Dado que no hay internet y la venta "C02-000105" se hizo en la Caja 2
  Cuando el supervisor selecciona "Devolución con referencia manual", digita "C02-000105", productos, motivo y su PIN
  Entonces se registra la devolución localmente y el evento "sale.returned" se enlaza en la nube cuando llegue la venta de C02
```

### - [ ] HU-047: Cambio mano a mano de producto con cobro o devolución de la diferencia
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[apps/pos]` · `[UC-V15, UC-E30]`
- **Como** cajero con autorización de supervisor, **quiero** hacer un cambio de producto en un solo flujo (entra el producto devuelto y sale el producto nuevo), **para** cobrar únicamente la diferencia (o $0 si valen igual).
```gherkin
Escenario: Cambio por un producto de igual valor ($0 a pagar)
  Dado que el cliente devuelve 1 "Gaseosa Manzana" de $2.500 y lleva 1 "Gaseosa Colombiana" de $2.500
  Cuando el supervisor autoriza el cambio
  Entonces entra +1 al stock de Manzana, sale -1 del stock de Colombiana y la diferencia a cobrar es $0
```

---

# ÉPICA 04: App Instalable — Periféricos de Mostrador e Impresión ESC/POS

## Feature 04.1: Impresora Térmica ESC/POS, Comprobante Interno y Cajón Monedero

### - [ ] HU-048: Driver de impresión ESC/POS para impresoras térmicas de 58 mm y 80 mm (USB, Red y Spooler RAW de Windows)
- **Meta:** `[Hito 2]` · `[P0]` · `[5 pts]` · `[apps/pos/devices]` · `[UC-V01]`
- **Como** tendero que tiene una impresora térmica genérica en su mostrador, **quiero** configurar la impresora por USB directo, IP de red o por nombre de impresora de Windows en modo RAW, probar la impresión y elegir ancho de 58 mm (32 columnas) u 80 mm (48 columnas), **para** que funcione con las impresoras económicas del mercado colombiano.
```gherkin
Escenario: Prueba de impresión y corte de papel en impresora de 58 mm
  Dado que selecciono la impresora térmica en Configuración de Caja con ancho 58 mm y codificación CP850/CP858 (ñ y tildes)
  Cuando presiono "Imprimir página de prueba"
  Entonces se imprime un tiquete legible con caracteres en español ("¡Gracias por su compra! — Cigarrería y Tienda Doña María") y ejecuta el comando de corte
```

### - [ ] HU-049: Plantilla del comprobante de venta interno (`receipt.internal.v1`) y de abono/cierre
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/devices]` · `[UC-V01, Doc 06 §0]`
- **Como** cliente de la tienda, **quiero** recibir un comprobante claro con el nombre del negocio, dirección, fecha/hora, caja y cajero, consecutivo `C01-000042`, detalle de productos, descuentos, impuestos discriminados (si aplica), total, medios de pago, vueltas, saldo de fiado (si aplica) y la leyenda no fiscal configurada, **para** verificar mi compra.
```gherkin
Escenario: Impresión de comprobante de venta a crédito mostrando el nuevo saldo del cliente
  Dado que "Doña Marta" tenía un saldo anterior de $15.000 y hace una compra fiada de $8.500
  Cuando se confirma la venta
  Entonces el comprobante impreso muestra los productos, el total de $8.500, "Saldo anterior: $15.000 / Nuevo saldo: $23.500" y la leyenda "Documento no válido como factura electrónica"
```

### - [ ] HU-050: Cola local de impresión tolerante a fallos (sin papel / impresora apagada) y reimpresión con marca "COPIA"
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/devices]` · `[UC-V16, UC-E19]`
- **Como** cajero, **quiero** que si la impresora se queda sin papel o está desconectada al momento de cobrar, la venta quede guardada y me ofrezca "Reintentar impresión" al poner papel, y que cualquier reimpresión posterior lleve el encabezado `"*** COPIA ***"` y quede auditada, **para** no perder la venta ni permitir que entreguen copias como si fueran ventas nuevas.
```gherkin
Escenario: Falla de impresora después del COMMIT de la venta
  Dado que la venta "C01-000043" ya hizo COMMIT en SQLite pero la impresora devuelve error de papel agotado
  Cuando el cajero coloca el rollo nuevo y presiona "Reintentar impresión"
  Entonces se imprime el comprobante original de "C01-000043" sin duplicar la venta

Escenario: Reimpresión de comprobante desde el historial del turno
  Dado una venta ya impresa anteriormente
  Cuando el cajero solicita "Reimprimir comprobante"
  Entonces el tiquete impreso incluye visiblemente "*** COPIA DE COMPROBANTE ***" y se registra "receipt.reprint" en auditoría
```

### - [ ] HU-051: Apertura automática del cajón monedero por pulso RJ11 al cobrar en efectivo y apertura manual con supervisor
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/devices]` · `[UC-V18]`
- **Como** dueño de tienda, **quiero** que el cajón monedero solo se abra automáticamente cuando la venta o el abono incluya efectivo, y que abrirlo sin venta (`F9 Abrir cajón`) exija PIN de supervisor/dueño y un motivo obligatorio, **para** controlar cada vez que se abre la gaveta del dinero.
```gherkin
Escenario: Venta pagada 100% por Nequi no abre el cajón monedero
  Dado una venta cuyo único medio de pago es "NEQUI"
  Cuando se confirma el cobro
  Entonces se imprime el comprobante pero NO se envía el comando ESC/POS de pulso al cajón

Escenario: Apertura manual sin venta exige motivo y queda auditada
  Dado que el cajero presiona "Abrir cajón" para cambiar un billete
  Cuando ingresa el motivo "Cambio de billete de $50.000" y el supervisor digita su PIN
  Entonces se envía el pulso de apertura y se registra "drawer.open.manual" en auditoría
```

### - [ ] HU-052: Integración con balanza electrónica por puerto serial (RS-232 / USB-Serial)
- **Meta:** `[Hito 2]` · `[P2]` · `[3 pts]` · `[apps/pos/devices]` · `[UC-V05]`
- **Como** cajero, **quiero** que al seleccionar un producto por peso la caja lea automáticamente el peso estable enviado por la balanza conectada al puerto COM, **para** evitar errores de digitación y fraudes en el peso.
```gherkin
Escenario: Lectura de peso estable desde el puerto COM configurado
  Dado una balanza conectada en "COM3" con 0,640 kg sobre el plato
  Cuando selecciono "Tomate Chonto" (producto por peso)
  Entonces la caja lee "640 g" del puerto serial y calcula el precio de la línea automáticamente
```

---

# ÉPICA 05: App Instalable — Control de Turnos, Efectivo y Arqueo Ciego

## Feature 05.1: Apertura de Turno, Movimientos de Caja y Retiros Parciales

### - [ ] HU-053: Apertura obligatoria de turno declarando base inicial en efectivo (y detección de turno anterior olvidado)
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/cash]` · `[UC-C01, UC-E21]`
- **Como** cajero, **quiero** abrir mi turno al empezar la jornada declarando el dinero base que recibo en el cajón (con conteo por denominación opcional), y que no se permita registrar ninguna venta si no hay un turno `OPEN`, **para** separar la responsabilidad de cada operador.
```gherkin
Escenario: Apertura de turno normal
  Dado que no hay ningún turno con estado "OPEN" en la caja
  Cuando el cajero declara una base inicial de $100.000 y confirma
  Entonces se crea la fila en "cash_sessions" con "status = OPEN" y "opening_float_cents = 10000000"
  Y se encola el evento "cash.session.opened"

Escenario: Turno anterior abierto de hace más de 16 horas exige cierre antes de continuar
  Dado que quedó abierto un turno del día anterior
  Cuando un cajero abre la aplicación
  Entonces el sistema muestra el aviso de turno pendiente de cierre y exige cerrarlo (o hacer cierre forzado con PIN de supervisor) antes de abrir uno nuevo
```

### - [ ] HU-054: Registro de entradas y salidas de efectivo (gastos menores, pago en efectivo a preventista)
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/cash]` · `[UC-C02, UC-C03]`
- **Como** cajero, **quiero** registrar cuando entra dinero extra (ej. sencillo traído por el dueño) o cuando sale efectivo de la caja para un gasto o pago a un proveedor, con motivo obligatorio y aprobación de supervisor si supera el tope configurado, **para** que al final del día el arqueo cuadre.
```gherkin
Escenario: Pago en efectivo a proveedor desde la caja con aprobación
  Dado que el tope de salida sin aprobación es $20.000 y llega el preventista de panadería a cobrar $85.000
  Cuando el cajero registra una salida "SUPPLIER_PAYMENT" por $85.000 con motivo "Panadería El Trigo - remisión 412" y el supervisor aprueba con su PIN
  Entonces se guarda en "cash_movements", se imprime tirilla de soporte para firmar y se descuenta de "expected_cash" del turno
```

### - [ ] HU-055: Alerta de exceso de efectivo en gaveta y retiro parcial a caja fuerte (*Safe Drop*)
- **Meta:** `[Hito 2]` · `[P1]` · `[2 pts]` · `[apps/pos/cash]` · `[UC-C04]`
- **Como** dueño de tienda, **quiero** que cuando el efectivo acumulado en el cajón supere un monto configurable (ej. $500.000) la caja sugiera hacer un retiro parcial (*safe drop*) autorizado por supervisor, **para** reducir el riesgo en caso de robo en el mostrador.
```gherkin
Escenario: Retiro parcial a caja fuerte descuenta del efectivo esperado en gaveta
  Dado que el efectivo en gaveta alcanza $550.000 y el tope de alerta es $500.000
  Cuando el supervisor registra un "SAFE_DROP" de $400.000
  Entonces se imprime el comprobante de retiro por duplicado, se encola "cash.movement.recorded" y el efectivo esperado en gaveta baja a $150.000
```

---

## Feature 05.2: Arqueo Ciego por Denominación COP, Cálculo de Descuadres y Reporte Z

### - [ ] HU-056: Cierre de turno con arqueo ciego (conteo por denominación de billetes y monedas COP sin mostrar el esperado)
- **Meta:** `[Hito 2]` · `[P0]` · `[5 pts]` · `[apps/pos/cash]` · `[UC-C05]`
- **Como** dueño de tienda, **quiero** que al cerrar el turno el cajero digite cuántos billetes ($100.000, $50.000, $20.000, $10.000, $5.000, $2.000) y monedas ($1.000, $500, $200, $100, $50) contó físicamente en la gaveta, además de los totales de datáfono y billeteras, **sin que la pantalla muestre en ningún momento cuánto debería haber**, **para** evitar que el cajero acomode el conteo o se quede con un sobrante.
```gherkin
Escenario: El cajero sin permiso "cash.session.view_expected" realiza el arqueo a ciegas
  Dado un turno activo donde el efectivo teórico esperado es $342.500
  Cuando el cajero abre la pantalla "Cerrar turno y arqueo"
  Entonces la interfaz muestra únicamente las casillas de conteo por denominación y NO muestra el valor $342.500
  Y al confirmar un conteo físico de $340.000, el turno pasa a "CLOSED", calcula "difference_cents = -250000" (-$2.500 faltante) y encola "cash.session.closed"
```

### - [ ] HU-057: Fórmula exacta de efectivo esperado e impresión del Reporte Z de cierre de turno
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/cash]` · `[UC-C05, UC-C09, UC-R00]`
- **Como** administrador, **quiero** que el sistema calcule `expected_cash = base + ventas_efectivo - cambio + entradas - salidas - retiros - devoluciones_efectivo + abonos_cartera_efectivo` e imprima el Reporte Z al cerrar el turno (incluso si el turno cruzó la medianoche), **para** auditar la caja en papel y en la nube.
```gherkin
Escenario: Cálculo de efectivo esperado con todas las operaciones del turno
  Dado un turno con:
    | Concepto                   | Valor     |
    | Base inicial               | $100.000  |
    | Efectivo recibido en ventas| $450.000  |
    | Cambio entregado           | $120.000  |
    | Abonos de fiado en efectivo| $30.000   |
    | Salida pago a proveedor    | $50.000   |
    | Retiro parcial (safe drop) | $150.000  |
    | Devolución en efectivo     | $10.000   |
  Cuando se cierra el turno
  Entonces "expected_cash" es exactamente $250.000
  Y se imprime el Reporte Z con el resumen por medio de pago, movimientos, devoluciones y firma del cajero
```

### - [ ] HU-058: Reapertura de turno cerrado con PIN de supervisor y motivo auditado
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/pos/cash]` · `[UC-C07]`
- **Como** supervisor, **quiero** poder reabrir el último turno recién cerrado si el cajero cometió un error al digitar el arqueo, exigiendo mi PIN y el motivo, **para** corregir el conteo dejando constancia del primer arqueo y del nuevo en auditoría.
```gherkin
Escenario: Reapertura del último turno cuando aún no se ha abierto otro
  Dado que el turno "S1" se cerró hace 3 minutos por un error de digitación en los billetes de $50.000
  Cuando el supervisor autoriza "Reabrir turno" con motivo "Error contando billetes de $50.000"
  Entonces el turno pasa a estado "REOPENED", se conserva el primer conteo en el historial de auditoría y se encola "cash.session.reopened"
```

---

# ÉPICA 06: App Instalable — Clientes y Cartera de Fiados en Caja (Offline)

## Feature 06.1: Alta Rápida de Cliente en Caja y Consentimiento Habeas Data

### - [ ] HU-059: Creación rápida de cliente en caja con nombre/alias, teléfono, documento opcional y casilla Habeas Data
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/customers]` · `[UC-K01, Doc 06 §3]`
- **Como** cajero, **quiero** registrar en segundos a un vecino en la caja con su nombre, alias (ej. `"Doña Marta - casa reja verde"`), celular y aceptación del tratamiento de datos personales (Ley 1581), **para** asociarlo a una venta o fiado aunque no haya internet.
```gherkin
Escenario: Alta rápida de cliente offline con autorización de datos personales
  Dado que el cliente no existe en la tabla local "customers"
  Cuando ingreso "Marta Gómez", alias "Doña Marta", celular "3105551234" y marco "Autoriza tratamiento de datos y envío de comprobantes/cobros"
  Entonces se inserta en "customers" con UUIDv7 y se encola el evento "customer.created"
  Y en el plan Tendero el cliente nuevo tiene "credit_enabled = false" hasta que el dueño le asigne cupo (o lo apruebe con su PIN en caja)
```

### - [ ] HU-060: Búsqueda de cliente en caja por nombre, alias, documento o teléfono y vista de saldo estimado
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/customers]` · `[UC-K04]`
- **Como** cajero, **quiero** buscar al cliente por su alias o celular y ver su cupo, su saldo estimado (`server_balance + Σ local_credit_movements no sincronizados`) y la fecha de la última sincronización, **para** saber cuánto debe antes de fiarle.
```gherkin
Escenario: Cálculo de saldo estimado sumando movimientos locales pendientes
  Dado que "Doña Marta" tiene "server_balance = $30.000", un cargo local sin sincronizar de "+$12.000" y un abono local de "-$5.000"
  Cuando la selecciono en la caja
  Entonces la pantalla muestra "Saldo estimado: $37.000 (Cupo: $100.000 — Disponible: $63.000)"
```

---

## Feature 06.2: Venta a Crédito (Fiado), Modos de Cupo y Recepción de Abonos

### - [ ] HU-061: Venta a crédito (fiado total o con abono inicial) respetando los modos `SOFT`, `ALLOCATED` y `ONLINE_ONLY`
- **Meta:** `[Hito 2]` · `[P0]` · `[5 pts]` · `[apps/pos/customers]` · `[UC-V04, UC-E07]`
- **Como** dueño de tienda, **quiero** que al vender fiado la caja valide el cupo disponible según el modo configurado (`SOFT`: permite exceder solo con PIN de supervisor/dueño; `ALLOCATED`: valida contra la fracción de cupo asignada a esta caja; `ONLINE_ONLY`: exige conexión), **para** controlar el riesgo de cartera cuando hay una o varias cajas sin internet.
```gherkin
Escenario: Venta fiada dentro del cupo disponible con abono parcial en efectivo
  Dado que "Doña Marta" tiene disponible $63.000 de cupo y hace una compra de $25.000 entregando $5.000 en efectivo
  Cuando el cajero cobra con $5.000 en "CASH" y $20.000 en "CREDIT_ACCOUNT"
  Entonces se registra la venta con "is_credit = true", entra $5.000 al efectivo del turno y se inserta un cargo de +$20.000 en "local_credit_movements"

Escenario: Exceso de cupo en modo SOFT exige PIN de supervisor o dueño
  Dado que el cliente solo tiene $10.000 de cupo disponible y quiere llevar $18.000 fiados en modo "SOFT"
  Cuando el cajero intenta cobrar en "CREDIT_ACCOUNT"
  Entonces el sistema bloquea el cobro hasta que el supervisor o dueño autoriza con su PIN, dejando auditoría "credit.exceed_limit"
```

### - [ ] HU-062: Registro de abono de cartera en caja (efectivo o medio digital) e impresión de recibo de abono
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/customers]` · `[UC-K03]`
- **Como** cajero, **quiero** recibir un abono total o parcial de un cliente sin que tenga que hacer una compra nueva, imprimirle su recibo con saldo anterior, valor abonado y nuevo saldo, y que si paga en efectivo se sume al efectivo esperado de mi turno, **para** recaudar la cartera en el mostrador.
```gherkin
Escenario: Abono en efectivo disminuye la deuda del cliente y suma a la caja del turno
  Dado que "Doña Marta" tiene un saldo estimado de $57.000
  Cuando registra un abono de $20.000 en "CASH"
  Entonces se inserta "-2000000" centavos en "local_credit_movements", se suma $20.000 al esperado del turno, se encola "credit.payment.received" y se imprime el recibo mostrando "Nuevo saldo: $37.000"
```

---

# ÉPICA 07: Motor de Sincronización Offline-First (`sync-service` + Cliente Rust)

## Feature 07.1: Motor Cliente en Rust — Outbox, Compresión, Firma, Backoff y Circuit Breaker

### - [ ] HU-063: Despachador del Outbox local en lotes ordenados por `terminal_seq`, comprimidos (`gzip`) y firmados
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[apps/pos/sync]` · `[Doc 03 §4]`
- **Como** motor de sincronización de la caja, **quiero** tomar en segundo plano hasta 200 eventos `PENDING` (o máx. 1 MB) en estricto orden de `terminal_seq`, marcarlos `IN_FLIGHT`, comprimirlos con `gzip`, firmarlos con la llave Ed25519 del equipo y enviarlos a `POST /v1/sync/push` (con debounce de 2 s tras una venta y barrido cada 30 s), **para** subir las ventas apenas haya red sin bloquear la interfaz del cajero.
```gherkin
Escenario: Envío de lote y marcación como SENT al recibir confirmación
  Dado que hay 15 eventos "PENDING" con "terminal_seq" del 101 al 115
  Cuando el motor detecta red y envía el lote a "/v1/sync/push"
  Entonces al recibir "200 OK" con "status = ACCEPTED" o "DUPLICATE", los 15 eventos pasan a "SENT" con "sent_at"

Escenario: Recuperación de eventos IN_FLIGHT huérfanos tras corte de red o reinicio
  Dado que 15 eventos quedaron en "IN_FLIGHT" porque se cayó el internet antes de recibir la respuesta
  Cuando pasan 2 minutos o la aplicación se reinicia
  Entonces vuelven automáticamente a estado "PENDING" y se reenvían en el siguiente intento sin perder el orden
```

### - [ ] HU-064: Circuit Breaker del cliente POS con backoff exponencial, jitter aleatorio y respeto de `Retry-After`
- **Meta:** `[Hito 4]` · `[P0]` · `[3 pts]` · `[apps/pos/sync]` · `[Doc 03 §9, UC-E01, UC-E25]`
- **Como** arquitecto de resiliencia, **quiero** que el motor de sincronización abra su circuito tras 5 fallos de red/5xx consecutivos y espere `min(5 min, 2^n * 2 s) ± 30 % de jitter` (o el valor de `Retry-After` en respuestas `429`/`503`), **para** no saturar el PC cuando no hay internet ni tumbar la nube cuando vuelve la luz en toda una ciudad.
```gherkin
Escenario: Apertura del circuito tras 5 timeouts consecutivos
  Dado que el servidor no responde en 5 intentos seguidos (timeout de conexión de 5 s)
  Cuando falla el quinto intento
  Entonces el circuito pasa a "ABIERTO", el indicador de la barra superior muestra "Sin conexión (15 pendientes)" y no vuelve a intentar hasta que venza el backoff con jitter
```

---

## Feature 07.2: `sync-service` en Nube — Ingesta Idempotente, Orden y Fan-out a Kafka

### - [ ] HU-065: Endpoint `POST /v1/sync/push` con validación de firma del dispositivo, idempotencia y detección de conflicto de hash
- **Meta:** `[Hito 4]` · `[P0]` · `[8 pts]` · `[services/sync-service]` · `[Doc 03 §4, UC-E03, UC-E18]`
- **Como** `sync-service`, **quiero** validar el JWT y la firma Ed25519 del lote, insertar cada `event_id` en `event_ids` (`ON CONFLICT DO NOTHING`), persistir el evento en `ingested_events` y en el `outbox` hacia Kafka en una sola transacción antes de responder `200 OK`, **para** garantizar durabilidad inmediata e idempotencia estricta.
```gherkin
Escenario: Reenvío del mismo lote produce DUPLICATE sin duplicar eventos en Kafka
  Dado que el lote con los eventos "E1" y "E2" ya fue aceptado previamente
  Cuando la caja reenvía exactamente el mismo lote (o 100 veces en paralelo)
  Entonces "sync-service" responde "200 OK" con "status = DUPLICATE" para "E1" y "E2"
  Y en "ingested_events" y en el tópico "pos.events" de Kafka existe una única copia de cada evento

Escenario: Alerta crítica de seguridad si llega el mismo event_id con distinto payload_hash
  Dado que "E1" fue registrado con "payload_hash = H_original"
  Cuando llega un evento con el mismo "event_id = E1" pero con "payload_hash = H_alterado"
  Entonces se rechaza con "CONFLICT" y se emite una alerta de seguridad a "audit-service"
```

### - [ ] HU-066: Verificación de secuencia contigua `terminal_seq` por caja y respuesta `409 GAP_DETECTED`
- **Meta:** `[Hito 4]` · `[P0]` · `[3 pts]` · `[services/sync-service]` · `[UC-E17]`
- **Como** `sync-service`, **quiero** verificar contra `terminal_seq_state` que los eventos de cada caja lleguen sin saltos (`next = last_seq + 1`), y si falta un número responder `409 GAP_DETECTED` con `expected_seq`, **para** detectar pérdidas o manipulaciones en la base local de una caja.
```gherkin
Escenario: Detección de hueco en la secuencia de una caja
  Dado que "last_seq" de "CAJA-01" en la nube es 500
  Cuando llega un lote de "CAJA-01" que empieza en "terminal_seq = 502"
  Entonces el servicio responde "409 GAP_DETECTED" con "{ expected_seq: 501 }"
  Y la caja reenvía desde el evento 501
```

### - [ ] HU-067: Registro y gestión de eventos en cuarentena (`sync_quarantine`) cuando un consumidor detecta anomalía de negocio
- **Meta:** `[Hito 4]` · `[P1]` · `[3 pts]` · `[services/sync-service]` · `[Doc 03 §4]`
- **Como** administrador, **quiero** que si un evento ya ocurrido en caja tiene una inconsistencia de negocio no bloqueante en un consumidor, quede registrado en `sync_quarantine` y pueda revisarlo y resolverlo desde la App de Gestión, **para** que la cola de la caja nunca se atasque.
```gherkin
Escenario: Evento puesto en cuarentena es visible y resoluble en la App de Gestión
  Dado un evento de devolución que referencia una venta de otra caja que nunca llegó por pérdida declarada del equipo
  Cuando "sales-service" no puede enlazarla tras los reintentos
  Entonces publica "sync.quarantined", se guarda en "sync_quarantine" con "status = OPEN" y aparece en la bandeja de cuarentena de la App de Gestión
```

---

## Feature 07.3: Bajada Incremental por `xid8`, Bootstrap S3 y Heartbeat

### - [ ] HU-068: Proyección `downstream_changes` en `sync-service` alimentada por eventos de catálogo, usuarios, clientes, stock y configuración
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[services/sync-service]` · `[Doc 03 §7, UC-E32]`
- **Como** `sync-service`, **quiero** consumir los eventos `catalog.*`, `user.*`, `customer.*`, `inventory.level_changed` y `tenant.*` actualizando `downstream_changes` solo si `source_version` es mayor a la guardada (e incluyendo *tombstones* con `op = delete`), **para** que las cajas descarguen novedades sin consultar las bases de otros servicios ni sufrir desorden de mensajes.
```gherkin
Escenario: Descarte de evento viejo que llega fuera de orden
  Dado que en "downstream_changes" el producto "P1" ya está en "source_version = 5" con precio $3.000
  Cuando llega con retraso un evento del mismo producto con "source_version = 4" y precio $2.800
  Entonces "sync-service" ignora el evento viejo y conserva la versión 5
```

### - [ ] HU-069: Endpoint `GET /v1/sync/pull` paginado con cursor transaccional `xid8` y `pg_snapshot_xmin`
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[services/sync-service, apps/pos/sync]` · `[ADR-002, Doc 03 §7]`
- **Como** caja POS, **quiero** pedir novedades por *stream* enviando mi último cursor `xid8` y recibir únicamente las filas con `row_xid >= since AND row_xid < pg_snapshot_xmin(pg_current_snapshot())`, aplicando cada página en una transacción SQLite antes de avanzar el cursor, **para** que jamás se pierda un cambio de precio o de PIN por transacciones largas o relojes desfasados.
```gherkin
Escenario: Bajada incremental sin pérdida durante una transacción concurrente larga
  Dado que la transacción T1 (xid 100) sigue abierta mientras la transacción T2 (xid 101) ya hizo COMMIT modificando el producto "P2"
  Cuando la caja hace "GET /v1/sync/pull?stream=catalog&cursor=95"
  Entonces "safe_upto" es 100, la caja recibe los cambios hasta 99 y su nuevo cursor queda en 100
  Y cuando T1 termina, en el siguiente pull desde el cursor 100 la caja recibe tanto T1 (100) como T2 (101)
```

### - [ ] HU-070: Generación y descarga de paquete Bootstrap desde S3 (URL prefirmada) y respuesta `410 RESYNC_REQUIRED`
- **Meta:** `[Hito 4]` · `[P1]` · `[3 pts]` · `[services/sync-service, apps/pos/sync]` · `[Doc 03 §7]`
- **Como** caja recién enrolada (o que estuvo apagada muchos meses), **quiero** descargar un snapshot completo comprimido desde S3 con el cursor `xid8` inicial incluido y luego continuar por pull incremental, **para** cargar 50.000 productos en pocos segundos.
```gherkin
Escenario: Cursor demasiado antiguo dispara re-bootstrap automático
  Dado una caja que envía un cursor "xid8" ya purgado del historial
  Cuando llama a "GET /v1/sync/pull"
  Entonces recibe "410 RESYNC_REQUIRED" con la URL prefirmada de bootstrap, reemplaza su réplica de catálogo local y continúa sincronizando
```

### - [ ] HU-071: Endpoint `POST /v1/terminals/heartbeat` cada 60 s con renovación de licencia y bandera `pull_now`
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[services/device-service, apps/pos/sync]` · `[Doc 03 §8, UC-R02]`
- **Como** dueño de tienda, **quiero** que cada caja envíe un latido cada 60 segundos reportando versión, eventos pendientes, estado de impresora y espacio en disco, y reciba la hora del servidor, su licencia renovada y la señal `pull_now` cuando cambié un precio, **para** saber en tiempo real qué cajas están en línea y que los precios nuevos bajen de inmediato.
```gherkin
Escenario: Cambio de precio en la nube acelera el pull en la caja vía heartbeat
  Dado que el dueño acaba de cambiar el precio del arroz en la App de Gestión
  Cuando la caja envía su siguiente heartbeat
  Entonces la respuesta incluye "flags.pull_now = ['catalog', 'prices']" y la caja ejecuta el pull inmediatamente sin esperar el ciclo normal
```

---

# ÉPICA 08: Microservicios de Dominio Core en Nube (`tenant`, `identity`, `device`, `catalog`)

## Feature 08.1: `tenant-service` — Tiendas, Planes, Add-ons, Sucursales y Entitlements

### - [ ] HU-072: Gestión de planes (`TENDERO`, `NEGOCIO`, `MULTITIENDA`), add-ons y cálculo de entitlements efectivos
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[services/tenant-service]` · `[Doc 10 §2]`
- **Como** `tenant-service`, **quiero** calcular los límites y funciones efectivas de una tienda (`max_branches`, `max_terminals`, `max_users`, `max_products`, `max_credit_customers`, `allowed_roles`, `features`) sumando su plan base + `subscription_addons` + `tenant_feature_overrides` y publicar `tenant.entitlements_changed`, **para** que todos los microservicios apliquen las reglas del plan.
```gherkin
Escenario: Contratación de un add-on de caja adicional incrementa el límite y publica evento
  Dado una tienda en plan "NEGOCIO" (2 cajas incluidas)
  Cuando se agrega 1 unidad del add-on "EXTRA_TERMINAL"
  Entonces "max_terminals" pasa a 3 y se publica el evento "tenant.entitlements_changed" en Kafka
```

### - [ ] HU-073: CRUD de sucursales validando el límite `max_branches` del plan y creación automática de bodega por defecto
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[services/tenant-service, services/inventory-service]` · `[UC-O01]`
- **Como** dueño en plan Multi-tienda, **quiero** crear una nueva sucursal indicando nombre, dirección y encabezado/pie de comprobante, y que se cree automáticamente su bodega principal, **para** abrir un nuevo punto de venta.
```gherkin
Escenario: Bloqueo al intentar crear una segunda sucursal en plan Tendero o Negocio
  Dado una tienda en plan "NEGOCIO" ("max_branches = 1") que ya tiene su sucursal principal
  Cuando intenta crear otra sucursal en "POST /v1/app/branches"
  Entonces recibe "403 PLAN_LIMIT_REACHED" indicando que requiere el plan Multi-tienda
```

---

## Feature 08.2: `identity-service` — OIDC/MFA, Activación de Cuenta, Usuarios, Roles y PIN

### - [ ] HU-074: Flujo de activación de cuenta de dueño (`POST /v1/activation/{token}`) con cambio de contraseña, MFA y declaración de no obligado a facturar
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[services/identity-service]` · `[UC-P01b, Doc 06 §0]`
- **Como** dueño de una tienda recién creada por el super admin, **quiero** abrir el enlace de activación recibido por correo/WhatsApp, definir mi contraseña definitiva, configurar mi segundo factor (TOTP/WebAuthn), definir mi PIN de caja y aceptar la declaración de no estar obligado a facturar electrónicamente, **para** activar mi tienda de forma segura.
```gherkin
Escenario: Activación completa en un solo paso y expiración del token de activación
  Dado un token de activación vigente de un solo uso para el dueño de "Tienda El Sol"
  Cuando envía su nueva contraseña, código MFA verificado, PIN "4829" y marca la declaración de no obligado a facturar
  Entonces el usuario queda "ACTIVE" con "mfa_enabled = true", se guarda "not_obligated_declared_at" en "tenant-service" y el token de activación no puede volver a usarse
```

### - [ ] HU-075: Gestión de usuarios de la tienda (cajeros, supervisores, contador) validando `max_users`, `allowed_roles` y PIN no trivial
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[services/identity-service]` · `[UC-O04, Doc 04 §2.1, Doc 10 §1]`
- **Como** dueño de tienda, **quiero** crear, desactivar y resetear el PIN de mis empleados dentro de los roles y cupo que permite mi plan, rechazando PINs triviales (`1234`, `0000`, dígitos repetidos) y hasheándolos con Argon2id, **para** que entren a la caja con sus permisos exactos.
```gherkin
Escenario: Intento de crear un tercer usuario en el plan Tendero (máx. 2: dueño + 1 cajero)
  Dado una tienda en plan "TENDERO" que ya tiene al dueño y a 1 cajero activo
  Cuando el dueño intenta crear otro cajero
  Entonces recibe "403 PLAN_LIMIT_REACHED"

Escenario: Intento de asignar rol SUPERVISOR en el plan Tendero
  Dado que "allowed_roles" del plan "TENDERO" es "{OWNER, CASHIER}"
  Cuando se intenta crear un usuario con rol "SUPERVISOR"
  Entonces recibe "403 ROLE_NOT_ALLOWED_IN_PLAN"

Escenario: Rechazo de PIN trivial
  Cuando se intenta guardar el PIN "1234" o "1111"
  Entonces el servicio devuelve "400 WEAK_PIN"
```

### - [ ] HU-076: Creación y edición de roles personalizados en el plan Multi-tienda
- **Meta:** `[Hito 6]` · `[P2]` · `[3 pts]` · `[services/identity-service]` · `[UC-O05]`
- **Como** dueño en plan Multi-tienda, **quiero** crear roles a medida combinando permisos atómicos (sin poder otorgar permisos de plataforma), **para** adaptarlos a la estructura de mi empresa.
```gherkin
Escenario: Creación de rol personalizado "Jefe de Bodega"
  Dado una tienda con la feature "custom_roles = true"
  Cuando crea el rol "Jefe de Bodega" con los permisos "inventory.manage", "inventory.transfer" y "reports.view"
  Entonces el rol queda disponible para asignarlo a usuarios de esa tienda y se propaga a las cajas
```

---

## Feature 08.3: `device-service` — Cajas, Códigos de Enrolamiento y Emisión de Licencias KMS

### - [ ] HU-077: Creación de caja validando `max_terminals` y generación de código/QR de enrolamiento de 15 minutos
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[services/device-service]` · `[UC-O02]`
- **Como** dueño de tienda, **quiero** registrar una nueva caja (ej. `CAJA-02`, prefijo `C02`) dentro del límite de mi plan y generar un código de enrolamiento de un solo uso con vigencia de 15 minutos (guardado como hash SHA-256), **para** activar la App Instalable en el computador del mostrador.
```gherkin
Escenario: Generación de código de enrolamiento dentro del límite del plan
  Dado una tienda en plan "NEGOCIO" ("max_terminals = 2") que solo tiene 1 caja activa
  Cuando solicita crear "CAJA-02" y generar su código de enrolamiento
  Entonces se guarda el hash del código con expiración en 15 minutos y se devuelve el código en claro y el QR una única vez
```

### - [ ] HU-078: Emisión de token de dispositivo (`POST /v1/devices/token`) mediante `private_key_jwt` y firma de licencia con KMS
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[services/device-service]` · `[Doc 04 §2, Doc 10 §3.4]`
- **Como** `device-service`, **quiero** autenticar a cada caja verificando su aserción firmada con Ed25519 y emitirle su `license_token` firmado con la llave privada custodiada en AWS KMS con `exp = min(paid_until + 15 días, now + offline_grace_days)`, **para** que ninguna llave privada de licenciamiento salga de la nube.
```gherkin
Escenario: Cálculo de expiración de licencia acotado por la fecha de pago de la tienda
  Dado que la tienda tiene "paid_until = 2026-11-02" (faltan 2 días para llegar a D+15) y "offline_grace_days = 10"
  Cuando la caja renueva su licencia en el heartbeat
  Entonces "exp" de la licencia emitida es "2026-11-17" (paid_until + 15 días) y no los 10 días completos desde hoy
```

---

## Feature 08.4: `catalog-service` — Productos, Precios por Sucursal, Programados, Importación y Genéricos

### - [ ] HU-079: CRUD de impuestos, categorías, marcas, productos y múltiples códigos de barras con control optimista (`version`) y límite `max_products`
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[services/catalog-service]` · `[UC-I01, UC-E33]`
- **Como** dueño de tienda, **quiero** crear y editar mis productos, asignarles uno o varios códigos de barras (únicos por tienda) e impuestos, evitando que dos personas se pisen los cambios mediante `If-Match: <version>`, **para** mantener el catálogo limpio y sincronizado con las cajas.
```gherkin
Escenario: Conflicto de versión al editar el mismo producto desde dos sesiones
  Dado que el producto "P1" está en "version = 3"
  Cuando el administrador A guarda un cambio (pasa a "version = 4") y segundos después el administrador B envía un PATCH con "If-Match: 3"
  Entonces el servicio rechaza la petición de B con "409 VERSION_CONFLICT" y le devuelve los datos actuales de la versión 4

Escenario: Rechazo de código de barras duplicado dentro de la misma tienda
  Dado que el código "7702004003509" ya está asignado a un producto activo de la tienda
  Cuando se intenta asignar el mismo código a otro producto de la misma tienda
  Entonces responde "409 BARCODE_ALREADY_EXISTS"
```

### - [ ] HU-080: Precios por sucursal y cambios de precio programados con fecha futura (`valid_from`)
- **Meta:** `[Hito 3]` · `[P1]` · `[3 pts]` · `[services/catalog-service]` · `[UC-I03, UC-E05]`
- **Como** dueño de tienda, **quiero** programar un cambio de precio para que entre en vigor mañana a las 6:00 a. m. y se descargue por adelantado a las cajas, **para** que aunque la caja amanezca sin internet aplique el nuevo precio a la hora exacta.
```gherkin
Escenario: Precio programado se descarga antes y se activa a la hora indicada
  Dado un registro en "branch_prices" con "price = $3.200" y "valid_from = mañana 06:00:00-05:00"
  Cuando la caja sincroniza hoy por la noche
  Entonces guarda el precio programado localmente, sigue cobrando el precio anterior hasta las 05:59:59 y a partir de las 06:00:00 cobra $3.200
```

### - [ ] HU-081: Importación masiva de catálogo desde Excel/CSV con validación previa y ejecución asíncrona
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[services/catalog-service]` · `[UC-I02]`
- **Como** dueño de tienda, **quiero** subir un archivo Excel/CSV con mis productos, ver una vista previa con los errores por fila antes de confirmar y que se procese en segundo plano (`202 Accepted` + estado del job), **para** cargar miles de productos al iniciar sin digitarlos uno por uno.
```gherkin
Escenario: Validación de archivo Excel detecta filas con errores antes de importar
  Dado un archivo Excel con 500 productos donde la fila 42 tiene precio negativo y la fila 108 repite el código de barras de la fila 12
  Cuando subo el archivo para previsualización
  Entonces el servicio reporta las 498 filas válidas y el detalle exacto de los errores en las filas 42 y 108
```

### - [ ] HU-082: Bandeja de artículos genéricos vendidos en caja (`generic_item_sales`) y creación de producto en un clic
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/catalog-service]` · `[UC-I10]`
- **Como** administrador, **quiero** ver en la App de Gestión la lista de artículos que los cajeros vendieron como "Genérico" (con la descripción y el precio que digitaron) y convertirlos en productos formales del catálogo con un clic, **para** completar el catálogo a partir de la operación real.
```gherkin
Escenario: Conversión de artículo genérico vendido en producto formal
  Dado un registro "PENDING" en "generic_item_sales" con descripción "Ponqué Ramo nuevo" y precio $3.200
  Cuando el administrador escanea su código de barras real y presiona "Crear producto"
  Entonces se crea el producto en "products", el registro pasa a "status = CREATED" y el nuevo producto baja a todas las cajas
```

### - [ ] HU-083: Motor y gestión de promociones (`PERCENT`, `FIXED`, `NXM`, `BUNDLE`) para planes Negocio y Multi-tienda
- **Meta:** `[Hito 6]` · `[P2]` · `[5 pts]` · `[services/catalog-service, apps/pos]` · `[UC-V09]`
- **Como** dueño en plan Negocio, **quiero** configurar promociones por vigencia de fecha/hora y prioridad (ej. "Pague 2 lleve 3 en yogures" o "10 % en aseo los martes") que se evalúen automáticamente en la caja offline, **para** aumentar el ticket promedio sin que el cajero tenga que recordarlas.
```gherkin
Escenario: Aplicación automática de promoción 3x2 en el carrito de la caja
  Dado una promoción activa "NXM" (lleve 3 pague 2) sobre el producto "Yogur Vaso" de $2.000
  Cuando el cajero escanea la tercera unidad de "Yogur Vaso"
  Entonces se aplica automáticamente un descuento de $2.000 en la línea indicando el nombre de la promoción
```

---

# ÉPICA 09: Microservicios Operativos en Nube (`sales`, `cash`, `inventory`, `customer`, `audit`)

## Feature 09.1: `sales-service` — Registro de Ventas, Consecutivos Únicos y Conciliación de Pagos Digitales

### - [ ] HU-084: Consumidor de `sale.completed`, `sale.voided` y `sale.returned` con garantía de consecutivo único en `sale_receipt_numbers`
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[services/sales-service]` · `[Doc 03 §4, UC-V01]`
- **Como** `sales-service`, **quiero** consumir los eventos de venta desde `pos.events` usando `inbox.once`, persistir la venta particionada por mes, garantizar la unicidad en `sale_receipt_numbers` y publicar `sales.recorded` / `sales.returned`, **para** consolidar el libro de ventas de todas las cajas.
```gherkin
Escenario: Registro de venta y publicación del evento de dominio sales.recorded
  Dado un evento "sale.completed" válido para el comprobante "C01-000042"
  Cuando "sales-service" lo consume
  Entonces inserta en "sales", "sale_lines", "sale_payments" y "sale_receipt_numbers", registra en "inbox" y encola "sales.recorded" en su "outbox" en una sola transacción
```

### - [ ] HU-085: Bandeja y endpoints de conciliación de pagos digitales (`NEQUI`, `DAVIPLATA`, `BRE_B`, `TRANSFER`, `CARD`)
- **Meta:** `[Hito 5]` · `[P0]` · `[3 pts]` · `[services/sales-service]` · `[UC-V20]`
- **Como** dueño de tienda, **quiero** listar todos los pagos digitales que llegaron de las cajas en estado `reconciliation = PENDING` (con su hora, monto, cajero y referencia digitada) y marcarlos como `CONFIRMED` o `FAILED` al revisar mi extracto o celular, **para** detectar pantallazos falsos de Nequi o transferencias que nunca entraron.
```gherkin
Escenario: Pago por Nequi marcado como fallido genera alerta y registro de descuadre
  Dado un pago de $45.000 en "NEQUI" con referencia "M99911" en estado "PENDING"
  Cuando el dueño revisa su Nequi, no encuentra el movimiento y lo marca como "FAILED" en la App de Gestión
  Entonces el pago cambia a "reconciliation = FAILED", se publica "payment.reconciliation_changed" y queda resaltado en el turno del cajero y en auditoría
```

---

## Feature 09.2: `cash-service` — Consolidación de Turnos, Recalculo en Nube y Cierre Forzado Remoto

### - [ ] HU-086: Consumidor de eventos de turno y recalculo independiente de `server_expected_cash` en la nube
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[services/cash-service]` · `[UC-C05, UC-C06]`
- **Como** `cash-service`, **quiero** registrar la apertura, movimientos y cierre de cada turno y recalcular en la nube `server_expected_cash` a partir de las ventas y movimientos recibidos, emitiendo `cash.discrepancy.detected` si hay descuadre o si difiere de lo calculado por la caja, **para** auditar los cierres y avisar al dueño en el celular.
```gherkin
Escenario: Cierre de turno con faltante dispara evento de discrepancia para notificación push
  Dado que llega el evento "cash.session.closed" con "expected_cash = $300.000" y "declared_cash = $275.000" (faltante de $25.000)
  Cuando "cash-service" lo procesa
  Entonces guarda el turno cerrado, verifica que "server_expected_cash" coincide con $300.000 y publica "cash.discrepancy.detected" con diferencia "-$25.000"
```

### - [ ] HU-087: Cierre forzado remoto de un turno olvidado abierto desde la App de Gestión
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/cash-service]` · `[UC-C08]`
- **Como** administrador, **quiero** cerrar de forma forzada desde la App de Gestión un turno que un cajero dejó abierto al irse, **para** destrabar el cierre contable del día y que la orden baje a la caja en el siguiente pull.
```gherkin
Escenario: Cierre forzado remoto se propaga a la caja
  Dado un turno "OPEN" desde hace 20 horas en "CAJA-01"
  Cuando el dueño ejecuta "POST /v1/app/terminals/{id}/force-close-session" con motivo "Cajero olvidó cerrar"
  Entonces el turno pasa a "FORCE_CLOSED" en la nube y la orden baja en el stream "config" cerrando la sesión en la caja
```

---

## Feature 09.3: `inventory-service` — Libro de Movimientos por Deltas, Proveedores, Recepciones, Ajustes, Conteos y Traslados

### - [ ] HU-088: Actualización algebraica de existencias (`stock_levels`) por deltas de venta/devolución y alerta de stock negativo
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[services/inventory-service]` · `[ADR-003, Doc 03 §5, UC-E04]`
- **Como** `inventory-service`, **quiero** que cada línea de `sale.completed` o `sale.returned` inserte su movimiento relativo (`-N` o `+N`) en `stock_movements` y sume algebraicamente `on_hand = on_hand + delta` en `stock_levels`, publicando `inventory.level_changed` e `inventory.negative_detected` si queda menor a cero, **para** que dos cajas vendiendo sin internet jamás sobrescriban ni pierdan descuentos de inventario.
```gherkin
Escenario: Dos cajas venden offline las últimas unidades del mismo producto
  Dado que en la nube "on_hand" del producto "Gaseosa 1.5L" es 4 unidades
  Y la Caja 1 vendió 2 unidades offline y la Caja 2 vendió 3 unidades offline
  Cuando ambos eventos "sale.completed" llegan a "inventory-service" en cualquier orden
  Entonces se insertan dos movimientos ("-2" y "-3"), "on_hand" queda en "-1" y se publica "inventory.negative_detected" sugiriendo un conteo físico
```

### - [ ] HU-089: Gestión de proveedores (`suppliers`) y recepción de mercancía (`purchase_receipts`) con actualización de costo promedio ponderado
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[services/inventory-service]` · `[UC-I04]`
- **Como** dueño de tienda, **quiero** registrar a mis proveedores (con sus días de visita de preventa y WhatsApp) y cargar las entradas de mercancía con cantidad y costo de compra, actualizando el stock (`+N`) y el costo promedio ponderado (`avg_cost`), **para** saber cuánto me cuesta cada producto y cuál es mi ganancia real.
```gherkin
Escenario: Recepción de mercancía recalcula el costo promedio ponderado
  Dado un producto con "on_hand = 10" unidades a un "avg_cost = $2.000"
  Cuando registro una recepción de 10 unidades nuevas a un costo unitario de "$2.400"
  Entonces "on_hand" pasa a 20 unidades, se registra el movimiento "RECEIPT" por "+10" y el nuevo "avg_cost" es "$2.200"
```

### - [ ] HU-090: Registro de ajustes de inventario (merma, avería, vencido, consumo interno, robo) con justificación obligatoria
- **Meta:** `[Hito 5]` · `[P0]` · `[3 pts]` · `[services/inventory-service]` · `[UC-I05]`
- **Como** administrador en plan Negocio+, **quiero** dar de baja productos dañados, vencidos o de consumo interno indicando el tipo de ajuste y el motivo obligatorio, **para** que el inventario cuadre y saber cuánto dinero se pierde en mermas.
```gherkin
Escenario: Baja por producto vencido descuenta stock y queda auditada
  Dado que 3 bolsas de leche se vencieron en la nevera
  Cuando registro en "POST /v1/app/inventory/adjustments" un ajuste "EXPIRED" de -3 unidades con motivo "Lote vencido 30-oct"
  Entonces se inserta en "stock_movements", baja "on_hand" en 3 y se publica el evento hacia reportes y auditoría
```

### - [ ] HU-091: Conteo físico de inventario calculando el delta contra el stock teórico al instante del conteo (`as_of`)
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[services/inventory-service]` · `[Doc 03 §5, UC-I06]`
- **Como** administrador, **quiero** que al guardar un conteo físico tomado a las `10:00 a. m.` el ajuste `COUNT_CORRECTION` se calcule como `contado - stock_teórico_a_las_10:00`, **para** que las ventas que las cajas hayan hecho después de las `10:00 a. m.` (y que sincronicen más tarde) no sean pisadas por el conteo.
```gherkin
Escenario: Conteo físico a las 10:00 a. m. no pisa una venta hecha a las 10:15 a. m.
  Dado que a las 10:00 a. m. el administrador cuenta físicamente 20 unidades de "Arroz 1kg" (cuando el teórico a las 10:00 era 22, por lo que el ajuste es -2)
  Y a las 10:15 a. m. una caja vende 3 unidades
  Cuando se aplican tanto el conteo de las 10:00 como la venta de las 10:15
  Entonces el stock final en "stock_levels" es "22 + (-2) + (-3) = 17" unidades
```

### - [ ] HU-092: Traslados de mercancía entre bodegas/sucursales (`IN_TRANSIT` → `RECEIVED` / `RECEIVED_WITH_DIFF`) en plan Multi-tienda
- **Meta:** `[Hito 6]` · `[P2]` · `[5 pts]` · `[services/inventory-service]` · `[UC-I07]`
- **Como** dueño con varias sucursales, **quiero** despachar mercancía de la Sucursal Norte a la Sucursal Sur descontándola al salir (`TRANSFER_OUT`) y sumándola al confirmar la recepción en destino (`TRANSFER_IN`), registrando diferencias si llegó incompleta, **para** controlar la mercancía en tránsito.
```gherkin
Escenario: Recepción con diferencia en traslado entre sucursales
  Dado un traslado en estado "IN_TRANSIT" donde salieron 12 unidades de la Sucursal 1
  Cuando la Sucursal 2 confirma haber recibido solo 11 unidades con observación "1 unidad rota en transporte"
  Entonces entran +11 a la Sucursal 2 y el traslado queda en "RECEIVED_WITH_DIFF" alertando al dueño
```

---

## Feature 09.4: `customer-service` — Cartera Consolidada, Estados de Cuenta, Castigos y Derechos ARCO

### - [ ] HU-093: Consolidación de cargos/abonos de cartera, deduplicación de clientes creados en caja y alerta de cupo excedido
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[services/customer-service]` · `[Doc 03 §6, UC-K01, UC-E07]`
- **Como** `customer-service`, **quiero** aplicar de forma conmutativa todos los cargos y abonos en `credit_movements`, actualizar `customer_balances`, fusionar clientes duplicados creados offline con el mismo documento y publicar `customer.credit_limit_exceeded` si la suma entre cajas superó el cupo, **para** mantener el libro de fiados exacto y propagar los saldos a todas las cajas.
```gherkin
Escenario: Dos cajas fían offline al mismo cliente superando su cupo total
  Dado que "Don Pedro" tiene cupo de $100.000 y saldo $60.000 (disponible $40.000)
  Y la Caja 1 le fía $30.000 offline y la Caja 2 le fía $25.000 offline
  Cuando ambos eventos llegan a "customer-service"
  Entonces el saldo consolidado queda en $115.000, se envía a las cajas en "customer_balances" y se publica "customer.credit_limit_exceeded" para notificar al dueño
```

### - [ ] HU-094: Estado de cuenta detallado del cliente, castigo de cartera (`WRITE_OFF`) y anonimización por Habeas Data (Ley 1581)
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/customer-service]` · `[UC-K04, UC-K06, UC-K07]`
- **Como** dueño de tienda, **quiero** consultar y compartir por WhatsApp el estado de cuenta de un cliente, dar de baja una deuda incobrable (`WRITE_OFF` con re-autenticación MFA) y atender solicitudes de supresión de datos personales anonimizando la ficha cuando no tenga deuda activa sin alterar las ventas históricas, **para** cumplir con la Ley 1581 de 2012.
```gherkin
Escenario: Supresión de datos personales bloqueada si el cliente tiene deuda pendiente
  Dado un cliente con saldo de cartera de $40.000 que solicita supresión de sus datos
  Cuando se invoca la acción de supresión
  Entonces el sistema informa que no procede mientras exista una obligación contractual/saldo pendiente

Escenario: Anonimización exitosa de cliente con saldo en cero
  Dado un cliente con "balance = 0"
  Cuando el dueño ejecuta la supresión por Habeas Data
  Entonces su nombre, teléfono, correo y dirección se reemplazan por valores anonimizados, conservando la integridad de las ventas históricas
```

---

## Feature 09.5: `audit-service` — Bitácora Inmutable con Cadena SHA-256 y Verificación Nocturna

### - [ ] HU-095: Persistencia append-only en `audit_log` con cadena de hash por tienda y job nocturno de verificación e integridad WORM
- **Meta:** `[Hito 4]` · `[P0]` · `[3 pts]` · `[services/audit-service]` · `[Doc 04 §8, UC-R04]`
- **Como** oficial de seguridad, **quiero** que `audit-service` conecte con un rol de base de datos que solo tiene permisos `INSERT` y `SELECT` (sin `UPDATE` ni `DELETE`), encadene cada registro con SHA-256 y exporte diariamente los bloques cerrados a S3 con Object Lock, **para** garantizar una bitácora a prueba de manipulaciones.
```gherkin
Escenario: Intento de UPDATE o DELETE sobre audit_log es rechazado por PostgreSQL
  Dado una conexión con el rol "audit_rw"
  Cuando se intenta ejecutar "DELETE FROM audit_log" o "UPDATE audit_log SET ..."
  Entonces PostgreSQL rechaza la sentencia con "permission denied for table audit_log"
```

---

# ÉPICA 10: App de Gestión Web + Móvil (Expo, Siempre Online) y `bff-app`

## Feature 10.1: `bff-app`, Login OIDC/MFA, Step-up MFA y Guardia de Conectividad

### - [ ] HU-096: Guardia global de conectividad en la App de Gestión ("Siempre Online": bloqueo inmediato sin caché editable si se pierde la red)
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[ADR-011, UC-E34, UC-E35]`
- **Como** dueño de producto, **quiero** que la App de Gestión (web, iOS y Android) verifique continuamente la conectividad y, si no hay internet, muestre la pantalla "Sin conexión — Reintentar" sin permitir editar ni mostrar datos en caché obsoletos, usando `Idempotency-Key` en cada escritura por si la red cae a mitad de envío, **para** cumplir la regla de que solo la caja opera offline.
```gherkin
Escenario: Pérdida de internet mientras se usa la App de Gestión
  Dado que el dueño tiene abierta la App de Gestión en su celular
  Cuando el celular pierde conexión a internet
  Entonces se superpone la pantalla "Sin conexión a internet" bloqueando formularios y botones de guardado hasta que vuelva la red
```

### - [ ] HU-097: Inicio de sesión OIDC + PKCE + MFA en la App de Gestión y re-autenticación MFA (*Step-up*) para acciones críticas
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[apps/management, services/bff-app]` · `[Doc 04 §2, UC-O08]`
- **Como** dueño de tienda, **quiero** iniciar sesión con mi correo, contraseña y código MFA (con rotación de refresh token) y que acciones críticas (revocar una caja, cambiar precios masivamente, cambiar permisos, castigar cartera) me pidan confirmar el código MFA, **para** que aunque deje el celular desbloqueado nadie pueda hacer daños graves.
```gherkin
Escenario: Acción crítica de revocar una caja exige Step-up MFA
  Dado un dueño con sesión activa en la App de Gestión
  Cuando presiona "Revocar CAJA-01"
  Entonces "bff-app" exige un token con claim "amr = mfa" de menos de 5 minutos, la app solicita el código MFA actual y solo al validarlo ejecuta la revocación
```

---

## Feature 10.2: Pantallas de Administración de Sucursales, Cajas y Usuarios

### - [ ] HU-098: Gestión de cajas en la App de Gestión (crear, ver código/QR de enrolamiento, revocar, forzar cierre de turno)
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-O02, UC-O03, UC-C08]`
- **Como** dueño de tienda, **quiero** crear mis cajas, mostrar en pantalla el QR/código de enrolamiento para enlazar el computador, ver su estado en tiempo real y poder revocarlas o cerrar un turno olvidado, **para** administrar los equipos de mi negocio desde el celular o el navegador.
```gherkin
Escenario: Visualización de QR de enrolamiento para enlazar una caja nueva
  Dado que creé "CAJA-01" en la App de Gestión
  Cuando toco "Enrolar equipo"
  Entonces la pantalla muestra el código de 8 caracteres, el código QR y la cuenta regresiva de 15 minutos
```

### - [ ] HU-099: Gestión de empleados (crear cajero/supervisor/contador, asignar sucursal, cambiar/resetear PIN, desactivar)
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-O04, UC-O09]`
- **Como** dueño de tienda, **quiero** dar de alta a mi cajero en menos de 1 minuto definiéndole su nombre y su PIN inicial, o desactivarlo inmediatamente si ya no trabaja conmigo, **para** que el cambio baje a la caja en menos de 60 segundos.
```gherkin
Escenario: Desactivación de un cajero desde el celular
  Dado el cajero "Carlos" en estado "ACTIVE"
  Cuando el dueño lo cambia a "DISABLED" en la App de Gestión
  Entonces se publica "user.updated", el siguiente heartbeat de la caja dispara "pull_now: ['users']" y "Carlos" ya no puede iniciar sesión en la caja
```

---

## Feature 10.3: Pantallas de Catálogo, Escáner con Cámara del Celular, Precios e Inventario

### - [ ] HU-100: Creación y edición de productos en la App de Gestión escaneando el código de barras con la cámara del celular
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[apps/management]` · `[UC-I01]`
- **Como** tendero, **quiero** abrir el formulario de producto en mi celular, apuntar la cámara al código de barras del empaque y que si ya existe me abra su ficha para cambiarle el precio (o si es nuevo me llene el código automáticamente), **para** administrar el catálogo caminando por los estantes de la tienda.
```gherkin
Escenario: Escaneo con la cámara de un producto existente abre su edición inmediata
  Dado que apunto la cámara del celular al código "7702004003509" en la App de Gestión
  Cuando "expo-camera" decodifica el EAN-13 y consulta "GET /v1/app/products/by-barcode/7702004003509"
  Entonces se abre la ficha de "Gaseosa 400ml" con el cursor listo en el campo de precio de venta
```

### - [ ] HU-101: Pantallas de recepción de mercancía, ajustes de merma y conteo físico usando la cámara del celular como escáner
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[apps/management]` · `[UC-I04, UC-I05, UC-I06]`
- **Como** administrador, **quiero** recibir un pedido de proveedor o hacer el conteo de un estante escaneando cada producto con la cámara del celular (o lector Bluetooth) e ingresando las unidades contadas, **para** llevar el inventario al día sin usar la caja donde se está vendiendo.
```gherkin
Escenario: Conteo físico de una categoría desde el celular
  Dado que inicio un "Nuevo conteo físico" para la categoría "Lácteos" a las 10:00 a. m.
  Cuando escaneo los productos con la cámara, ingreso las cantidades físicas y presiono "Finalizar conteo"
  Entonces se envía a "POST /v1/app/inventory/counts" con la marca de tiempo de inicio y se aplican los ajustes "COUNT_CORRECTION"
```

### - [ ] HU-102: Pantallas de clientes, cupos de fiado, conciliación de pagos digitales y resolución de cuarentena
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[apps/management]` · `[UC-K02, UC-V20]`
- **Como** dueño de tienda, **quiero** habilitar y cambiar el cupo de crédito de mis clientes, confirmar o rechazar los pagos por Nequi/Daviplata/Bre-B del día y resolver cualquier evento en cuarentena, **para** tener control financiero diario desde el teléfono.
```gherkin
Escenario: Habilitación de cupo de fiado a un cliente creado rápidamente en la caja
  Dado que el cajero creó a "Doña Marta" en la caja sin cupo habilitado
  Cuando el dueño entra a Clientes en la App de Gestión, activa "Permitir fiado" y asigna un cupo de $120.000
  Entonces el cambio se guarda en "customer-service" y baja a la caja permitiendo fiarle hasta $120.000
```

---

# ÉPICA 11: Reportería CQRS, Dashboard en Vivo y Notificaciones Multicanal

## Feature 11.1: `reporting-service` (CQRS), Stream SSE yComponentes Compartidos (`packages/ui-reports`)

### - [ ] HU-103: Proyecciones CQRS en `reporting-service` (`rpt_daily_sales`, `rpt_hourly_sales`, `rpt_product_sales_daily`, `rpt_shift_summary`, `rpt_terminal_status`, `rpt_inventory_alerts`)
- **Meta:** `[Hito 4]` · `[P0]` · `[5 pts]` · `[services/reporting-service]` · `[UC-R01..R08]`
- **Como** `reporting-service`, **quiero** consumir todos los tópicos de dominio usando `inbox.once` y actualizar las tablas de lectura preagregadas en zona horaria `America/Bogota`, pudiendo reconstruirlas desde cero por *replay* de Kafka, **para** que los reportes carguen en menos de 200 ms sin tocar las bases transaccionales.
```gherkin
Escenario: Venta sincronizada actualiza proyecciones diarias, por hora y por producto en menos de 5 segundos
  Dado que llega el evento "sales.recorded" de una venta emitida el "2026-10-31 19:30:00-05:00" por $15.000
  Cuando "reporting-service" procesa el mensaje
  Entonces incrementa "tickets" y "gross_total" del día "2026-10-31" en "rpt_daily_sales", la franja de las 19:00 en "rpt_hourly_sales" y las unidades/ingresos en "rpt_product_sales_daily"
```

### - [ ] HU-104: Dashboard en tiempo real con actualización en vivo por Server-Sent Events (`/dashboard/stream`) y comparativo contra periodos anteriores
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[services/bff-app, apps/management]` · `[UC-R01]`
- **Como** dueño de tienda, **quiero** abrir la App de Gestión y ver las ventas de hoy, número de tiquetes, ticket promedio, desglose por medio de pago, top 10 productos y comparativo contra ayer y el mismo día de la semana pasada actualizándose en vivo sin recargar la pantalla, **para** monitorear mi negocio desde cualquier lugar.
```gherkin
Escenario: Actualización en vivo del dashboard cuando una caja sincroniza una venta
  Dado que el dueño tiene abierto el Dashboard en su celular conectado al stream SSE
  Cuando una caja sincroniza una venta de $18.000
  Entonces el total del día en la pantalla del dueño sube en $18.000 en menos de 5 segundos sin intervención del usuario
```

### - [ ] HU-105: Reportes detallados de ventas, turnos/descuadres, rentabilidad/rotación, cartera, impuestos, auditoría y estado de cajas
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[packages/ui-reports, apps/management]` · `[UC-R02..R08]`
- **Como** dueño de tienda, **quiero** filtrar reportes por rango de fechas, sucursal, caja, cajero y medio de pago, viendo el semáforo de salud de mis cajas (verde < 5 min, amarillo 5 min–2 h, rojo > 2 h), los productos sin rotación y el margen bruto (en plan Negocio+), **para** tomar decisiones basadas en datos.
```gherkin
Escenario: Semáforo de estado de cajas alerta una caja sin sincronizar
  Dado que "CAJA-02" envió su último heartbeat hace 3 horas y tiene 42 eventos en outbox
  Cuando consulto el reporte "Estado de cajas"
  Entonces "CAJA-02" aparece en color rojo indicando "Última conexión hace 3 h — 42 ventas pendientes de subir"
```

### - [ ] HU-106: Módulo de Reportes de sucursal en la App Instalable (`bff-pos`, solo online y sin caché local)
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/bff-pos, apps/pos]` · `[UC-E36]`
- **Como** administrador o supervisor en la tienda, **quiero** consultar desde la App Instalable los reportes consolidados de mi sucursal cuando hay internet (y ver el aviso "Requiere conexión a internet" cuando estamos offline, manteniendo siempre disponible el reporte local del turno), **para** revisar cómo va la tienda desde el computador del mostrador sin guardar datos de reportes en el disco local.
```gherkin
Escenario: Consulta de reportes de sucursal sin conexión a internet
  Dado que la caja no tiene conexión a internet
  Cuando el usuario con permiso "reports.view" entra a la pestaña "Reportes de sucursal"
  Entonces la pantalla muestra "Requiere conexión a internet" y el botón para abrir el "Reporte del turno actual (offline)"
```

### - [ ] HU-107: Exportación asíncrona de reportes a Excel (`.xlsx`) y PDF con URL prefirmada de S3 y plantillas contables (Siigo / World Office / Alegra)
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/reporting-service]` · `[UC-R05, Doc 06 §8]`
- **Como** dueño o contador (en plan Negocio+), **quiero** exportar cualquier reporte o el libro mensual de ventas/impuestos a Excel o PDF recibiendo un enlace de descarga de corta vida, **para** entregárselo a mi contador o importarlo en software contable.
```gherkin
Escenario: Solicitud y descarga de reporte mensual en Excel
  Dado un usuario con permiso "reports.export" y un plan con feature "export = true"
  Cuando solicita "POST /v1/app/reports/exports" para las ventas del mes
  Entonces recibe "202 Accepted" y al completarse el archivo obtiene una URL prefirmada de S3 válida por 15 minutos
```

---

## Feature 11.2: `notification-service` — Push, WhatsApp, Correo, SMS y Cumplimiento Ley 2300

### - [ ] HU-108: Motor de notificaciones multicanal con deduplicación (`dedupe_key`), plantillas y registro de dispositivos Push
- **Meta:** `[Hito 5]` · `[P0]` · `[5 pts]` · `[services/notification-service]` · `[UC-R09, UC-I09]`
- **Como** dueño de tienda, **quiero** recibir notificaciones push/WhatsApp/email cuando ocurra un descuadre de caja, una anulación, stock negativo o una caja lleve más de 4 horas sin sincronizar en horario laboral, sin recibir mensajes duplicados, **para** enterarme al instante de lo que pasa en mi tienda.
```gherkin
Escenario: Notificación push inmediata al dueño por descuadre en cierre de turno
  Dado que el dueño tiene registrado su celular en "push_devices" y activa la alerta "cash.discrepancy"
  Cuando llega el evento "cash.discrepancy.detected" con un faltante de $25.000 en "CAJA-01"
  Entonces "notification-service" envía una única notificación push con "dedupe_key = cash_session_id"
```

### - [ ] HU-109: Recordatorios de cobro de fiados por WhatsApp/SMS respetando horarios y canales de la Ley 2300 de 2023 ("Dejen de fregar")
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/notification-service]` · `[UC-K05, Doc 06 §3]`
- **Como** dueño en plan Negocio+, **quiero** enviar recordatorios cordiales de saldo pendiente por WhatsApp a clientes que dieron su consentimiento, garantizando que el sistema solo los despache en los días y horarios permitidos por la Ley 2300 de 2023 y respetando la frecuencia máxima semanal, **para** recuperar cartera sin infringir la ley.
```gherkin
Escenario: Recordatorio programado fuera de horario legal se encola para el siguiente día hábil
  Dado que un dueño solicita enviar un recordatorio de cobro un domingo o a las 9:00 p. m.
  Cuando "notification-service" recibe la solicitud
  Entonces guarda la notificación con "status = QUEUED" y "scheduled_for" ajustado al siguiente horario permitido por la Ley 2300
```

---

# ÉPICA 12: Consola del Super Admin (`platform-console` + `bff-platform`), Facturación SaaS, Mora y Bloqueos

## Feature 12.1: Consola Interna del Super Admin, Saga de Creación de Tienda y Soporte JIT

### - [ ] HU-110: Consola `platform-console` y `bff-platform` protegidos con OIDC + MFA obligatorio (WebAuthn/TOTP) e IP allow-list
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/platform-console, services/bff-platform]` · `[Doc 04 §2, Doc 10 §1]`
- **Como** super administrador de la plataforma (tú), **quiero** una consola en un dominio separado que exija MFA en cada inicio de sesión, verifique IP permitida y audite cada acción con `actor_kind = SUPPORT / SUPER_ADMIN`, **para** administrar todas las tiendas sin exponer el control del SaaS.
```gherkin
Escenario: Rechazo de acceso a la consola sin MFA o sin rol SUPER_ADMIN
  Dado un usuario autenticado con rol "OWNER" de una tienda
  Cuando intenta acceder a cualquier ruta "/v1/platform/*"
  Entonces el gateway y "bff-platform" rechazan la solicitud con "403 FORBIDDEN"
```

### - [ ] HU-111: Saga orquestada de creación de tienda desde la consola (`POST /v1/platform/tenants`: tienda → dueño → sucursal → `CAJA-01` → envío de activación)
- **Meta:** `[Hito 3]` · `[P0]` · `[5 pts]` · `[services/tenant-service, apps/platform-console]` · `[UC-P01, ADR-012]`
- **Como** super admin, **quiero** crear una tienda nueva ingresando nombre del negocio, documento del dueño (con cálculo/validación de dígito de verificación si es NIT), correo, celular, plan (`TENDERO`, `NEGOCIO`, `MULTITIENDA`), día de corte y periodo de prueba, creando automáticamente su usuario `OWNER`, su sucursal principal, `CAJA-01` y enviándole el enlace de activación, **para** dar de alta a cada cliente sin registro público abierto.
```gherkin
Escenario: Creación completa de tienda y compensación automática si falla un paso
  Dado que ingreso en la consola los datos de "Minimercado La 80" con plan "NEGOCIO"
  Cuando confirmo "Crear tienda"
  Entonces la saga crea el tenant en "tenant_db", el usuario dueño en "identity_db", la sucursal y bodega, la terminal "CAJA-01" en "device_db" y envía el correo/WhatsApp de activación
  Y si cualquiera de los pasos falla, la saga ejecuta los pasos compensatorios dejando el sistema sin registros huérfanos
```

### - [ ] HU-112: Gestión de usuarios de cualquier tienda desde la consola y acceso temporal de soporte (*Just-In-Time*)
- **Meta:** `[Hito 3]` · `[P1]` · `[3 pts]` · `[apps/platform-console]` · `[UC-P07, UC-P09]`
- **Como** super admin, **quiero** poder crearle los cajeros a un tendero durante su acompañamiento inicial, reenviar enlaces de activación, resetear su MFA tras verificar su identidad y solicitar acceso temporal de lectura (JIT por 30 minutos) a su tienda con motivo obligatorio, **para** darle soporte rápido dejando todo en la bitácora de auditoría.
```gherkin
Escenario: Creación de cajero por parte del super admin respeta límites del plan y queda auditada
  Dado que el super admin entra al detalle de "Tienda El Sol" (plan Tendero)
  Cuando crea el usuario cajero para ayudarle al dueño
  Entonces el usuario se crea en "identity-service" validando el límite del plan y en "audit_log" queda registrado el ID del super admin y el motivo
```

---

## Feature 12.2: Facturación de Suscripciones, Pasarela de Pagos y Registro de Pagos Manuales

### - [ ] HU-113: Generación automática de facturas de suscripción (`billing_invoices`) con link de pago y webhook HMAC de pasarela (Wompi / PayU / Mercado Pago)
- **Meta:** `[Hito 6]` · `[P0]` · `[5 pts]` · `[services/tenant-service]` · `[Doc 08 §5, Doc 10 §3.1]`
- **Como** plataforma SaaS, **quiero** generar la factura mensual/anual de cada tienda 5 días antes de su fecha de corte con su link de pago (PSE, Nequi, tarjeta) y procesar de forma idempotente el webhook firmado con HMAC de la pasarela al pagarse, **para** renovar automáticamente `paid_until` y reactivar la tienda al instante.
```gherkin
Escenario: Webhook de pago aprobado extiende paid_until y reactiva una tienda suspendida
  Dado que la tienda "T1" está en estado "SUSPENDED" con la factura "INV-104" abierta por $34.900
  Cuando llega el webhook de Wompi con firma HMAC válida e "status = APPROVED" para "INV-104"
  Entonces la factura pasa a "PAID", "paid_until" avanza 1 mes, el estado de la tienda pasa a "ACTIVE" en menos de 5 segundos y se publica "tenant.status_changed"
```

### - [ ] HU-114: Registro de pago manual en la consola (Nequi / transferencia / efectivo) adjuntando foto del comprobante
- **Meta:** `[Hito 6]` · `[P0]` · `[3 pts]` · `[apps/platform-console, services/tenant-service]` · `[UC-P04b]`
- **Como** super admin, **quiero** registrar en la consola un pago que un tendero me envió por Nequi, Bre-B o consignación, subiendo la imagen del comprobante a S3, **para** marcar su factura como pagada y reactivar su tienda de inmediato.
```gherkin
Escenario: Registro de pago manual reactiva la tienda y emite evento para renovar licencias de caja
  Dado una factura pendiente de pago
  Cuando el super admin registra un pago "MANUAL" por $34.900 en método "NEQUI", adjunta el comprobante y guarda
  Entonces se inserta en "billing_payments" con "registered_by", la tienda pasa a "ACTIVE" y la caja recibe su licencia extendida en el siguiente heartbeat
```

---

## Feature 12.3: Motor de Avisos de Pago Retrasado (Dunning D-5 a D+60), Prórrogas y Bloqueo Progresivo

### - [ ] HU-115: Job diario idempotente de mora (`dunning-scheduler`): avisos en D-5, D0, D+1, D+3, D+5 respetando horario 8 a. m. – 7 p. m.
- **Meta:** `[Hito 6]` · `[P0]` · `[5 pts]` · `[services/tenant-service, services/notification-service]` · `[UC-P04, Doc 10 §3.2]`
- **Como** plataforma, **quiero** un proceso diario que evalúe las facturas abiertas según `dunning_policies` + `grace_extensions`, cambie la tienda a `PAST_DUE` en D+1, envíe un único aviso por etapa (`UNIQUE (invoice_id, stage)`) entre las 8:00 a. m. y las 7:00 p. m., y muestre el aviso en la caja **únicamente al usuario Dueño** (nunca al cajero), **para** cobrar a tiempo sin incomodar al empleado frente a los clientes.
```gherkin
Escenario: En D+1 la tienda pasa a PAST_DUE y el aviso solo lo ve el dueño
  Dado una factura cuya "due_date" fue ayer y sigue en estado "OPEN"
  Cuando corre "dunning-scheduler" a las 9:00 a. m.
  Entonces la tienda pasa a "PAST_DUE", se registra "NOTICE_1" en "dunning_notices" y se envía el mensaje con el link de pago al dueño
  Y cuando el cajero inicia sesión en la caja NO ve ningún mensaje de cobro, pero cuando entra el dueño ve el aviso de pago pendiente
```

### - [ ] HU-116: Transición automática a `RESTRICTED` en D+7 (App de Gestión en solo lectura; la caja sigue vendiendo)
- **Meta:** `[Hito 6]` · `[P0]` · `[3 pts]` · `[services/tenant-service, services/bff-app]` · `[Doc 10 §3.2]`
- **Como** plataforma, **quiero** que al cumplirse 7 días de mora (más eventuales días de prórroga) la tienda pase a `RESTRICTED`, dejando la App de Gestión en modo solo lectura con la pantalla de pago al frente mientras **la caja sigue vendiendo normalmente**, **para** presionar el pago sin detener todavía las ventas del mostrador.
```gherkin
Escenario: Tienda en estado RESTRICTED bloquea escrituras en la App de Gestión pero permite vender en caja
  Dado una tienda con 7 días de mora que pasa a estado "RESTRICTED"
  Cuando el dueño intenta crear un producto o cambiar un precio en la App de Gestión
  Entonces "bff-app" rechaza la escritura con "402 PAYMENT_REQUIRED_RESTRICTED" permitiendo solo consultar reportes y pagar la factura
  Y la caja física sigue permitiendo abrir turno y cobrar ventas
```

### - [ ] HU-117: Transición a `SUSPENDED` en D+15 (bloqueo de nuevos turnos en caja sin cortar un turno abierto) y a `CANCELLED` en D+60
- **Meta:** `[Hito 6]` · `[P0]` · `[5 pts]` · `[services/tenant-service, services/device-service, apps/pos]` · `[Doc 10 §3.2, §3.3, §3.4]`
- **Como** plataforma, **quiero** que en D+15 la tienda pase a `SUSPENDED` impidiendo abrir turnos nuevos en las cajas (pero permitiendo terminar, arquear y sincronizar un turno que ya estuviera abierto, incluso si la caja está sin internet gracias al `exp` de su licencia), y en D+60 pase a `CANCELLED` conservando los datos 90 días para exportación, **para** hacer cumplir el bloqueo por no pago protegiendo siempre la integridad del turno y de los datos del cliente.
```gherkin
Escenario: Caja con turno abierto cuando la tienda pasa a SUSPENDED en D+15
  Dado que "CAJA-01" tiene un turno abierto a las 2:00 p. m. cuando la tienda pasa a "SUSPENDED"
  Cuando el cajero sigue cobrando en ese turno y luego hace el cierre con arqueo a las 8:00 p. m.
  Entonces todas las ventas y el cierre del turno se permiten y se sincronizan a la nube
  Y cuando intenta abrir un nuevo turno a las 8:05 p. m., la caja lo bloquea mostrando "Suscripción suspendida por falta de pago"

Escenario: Caja desconectada de internet en D+15 también se bloquea al vencer su licencia
  Dado una tienda que no pagó y cuya caja desconectaron de internet desde D+2
  Cuando llega el día D+15 ("paid_until + 15 días")
  Entonces el campo "exp" del "license_token" local expira y la caja bloquea la apertura de nuevos turnos aunque no tenga internet
```

### - [ ] HU-118: Otorgamiento de prórroga (`grace_extensions`, máx. 2 al año) y suspensión/reactivación manual desde la consola
- **Meta:** `[Hito 6]` · `[P0]` · `[3 pts]` · `[apps/platform-console, services/tenant-service]` · `[UC-P04b, UC-P04c]`
- **Como** super admin, **quiero** darle de 1 a 15 días de prórroga con motivo obligatorio a un tendero que me avisó que paga el fin de semana (máximo 2 prórrogas por año), devolviendo inmediatamente su tienda de `RESTRICTED` o `SUSPENDED` a `PAST_DUE`, **para** manejar acuerdos de pago desde la consola.
```gherkin
Escenario: Prórroga de 5 días desbloquea inmediatamente una tienda suspendida
  Dado una tienda en "SUSPENDED" en el día D+16
  Cuando el super admin le otorga una prórroga de 5 días con motivo "Cliente acordó pago por Nequi el viernes"
  Entonces se inserta en "grace_extensions", la fecha de suspensión se corre a D+20, la tienda vuelve a "PAST_DUE" y las cajas pueden abrir turno en menos de 60 segundos
```

---

# ÉPICA 13: Edición Local (Pago Único, Activación Online Única y Operación 100% Local)

## Feature 13.1: Build `local`, Separación Cajero / Administrador con Contraseña y Código de Recuperación

### - [ ] HU-119: Pantalla de inicio dual en la Edición Local: entrada de Cajero (con PIN) y entrada de Administración (con contraseña Argon2id)
- **Meta:** `[Hito L]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC-L03, UC-L04, Doc 10 §4.2]`
- **Como** comprador de la Edición Local (sin nube ni App de Gestión), **quiero** que al abrir el programa en mi computador pueda entrar como **Cajero** digitando un PIN (viendo solo la caja) o entrar a **Administración** digitando mi contraseña de administrador (viendo productos, precios, inventario, usuarios, fiados, reportes y respaldos en el mismo PC), **para** manejar todo mi negocio localmente sin que el cajero vea ni toque la administración.
```gherkin
Escenario: El cajero solo accede a la caja y el dueño con contraseña accede a toda la administración local
  Dado un PC con la Edición Local activada
  Cuando el empleado selecciona su usuario e ingresa su PIN
  Entonces entra únicamente al modo Caja sin menú de administración ni reportes globales
  Y cuando el dueño hace clic en "Administración" e ingresa su contraseña de administrador, accede al panel completo en el mismo PC
```

### - [ ] HU-120: Asistente de configuración inicial de la Edición Local y generación obligatoria del Código de Recuperación de 16 caracteres
- **Meta:** `[Hito L]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[UC-L03, Doc 10 §4.4]`
- **Como** dueño de la Edición Local, **quiero** configurar en el primer arranque los datos de mi tienda, crear mi contraseña de administrador y que el sistema me genere un **Código de Recuperación de 16 caracteres** que debo imprimir o escribir para confirmar antes de continuar, **para** poder recuperar mi contraseña y abrir mis archivos de respaldo `.tdbak` en otro computador.
```gherkin
Escenario: Confirmación obligatoria del código de recuperación durante la instalación inicial
  Dado el asistente inicial de la Edición Local
  Cuando el sistema muestra el código de recuperación "K9P4-M2X7-Q8W1-R5T3"
  Entonces ofrece el botón "Imprimir en tirilla" y exige digitar los últimos 4 caracteres ("R5T3") para confirmar que fue guardado antes de finalizar
  Y almacena únicamente su hash Argon2id en "local_admin.recovery_hash"
```

---

## Feature 13.2: Activación Online Única con Serial, Huella Tolerante (3 de 5) y Llave en TPM/DPAPI

### - [ ] HU-121: Generación de seriales de Edición Local en la consola (`POST /v1/platform/local-licenses`) guardando solo `serial_hash`
- **Meta:** `[Hito L]` · `[P0]` · `[3 pts]` · `[services/device-service, apps/platform-console]` · `[UC-L01, Doc 10 §4.3]`
- **Como** super admin, **quiero** registrar en la consola la venta de una licencia `LOCAL_ESENCIAL` o `LOCAL_PLUS` con el nombre y documento del comprador y obtener por única vez el serial (`TDL-XXXXX-XXXXX-XXXXX-XXXXX`), guardando en la base de datos solo su hash SHA-256 y los últimos 4 caracteres, **para** entregárselo al cliente sin almacenar seriales en texto plano.
```gherkin
Escenario: Emisión de licencia local en la consola
  Cuando creo una licencia "LOCAL_PLUS" para "Tienda Doña Marta" (CC 52.123.456) en la consola
  Entonces se crea el registro "LOC-2026-000123" con "updates_until = hoy + 1 año", se muestra el serial completo una sola vez para copiarlo y en "local_licenses" solo queda "serial_hash"
```

### - [ ] HU-122: Activación en línea única (`POST /v1/local-activation/activate`) con huella de 5 componentes, llave en TPM/DPAPI y bloqueo de serial ya usado
- **Meta:** `[Hito L]` · `[P0]` · `[8 pts]` · `[services/device-service, apps/pos]` · `[UC-L02, ADR-013, Doc 10 §4.3]`
- **Como** dueño de la Edición Local, **quiero** conectar mi PC a internet una sola vez al instalar, ingresar mi serial y que la aplicación genere su par Ed25519 en el TPM/DPAPI, envíe los 5 hashes de hardware (`cpu`, `board`, `disk`, `os_guid`, `mac`) y reciba la licencia perpetua firmada por KMS, **para** que después de ese instante el programa funcione para siempre sin volver a conectarse a internet y nadie pueda usar mi serial en otro computador.
```gherkin
Escenario: Activación exitosa por primera vez y operación posterior 100% sin internet
  Dado un serial válido "TDL-7KQ2M-..." que no tiene ninguna activación en estado "ACTIVE"
  Cuando el cliente lo ingresa en el PC con internet y presiona "Activar licencia"
  Entonces "device-service" verifica el hash del serial, registra la activación en "local_license_activations" y devuelve la licencia firmada con KMS
  Y al desconectar el PC de internet para siempre, la aplicación arranca y opera sin hacer ninguna conexión de red en segundo plano

Escenario: Rechazo automático e intento registrado cuando intentan usar el mismo serial en un segundo PC
  Dado que el serial "TDL-7KQ2M-..." ya está activo en el PC de la tienda 1
  Cuando otra persona intenta activar el mismo serial en un PC distinto (cuya huella coincide en menos de 3 de 5 componentes)
  Entonces el servidor responde "409 ALREADY_ACTIVATED", registra el intento con IP en "local_activation_attempts" y genera una alerta en la consola del super admin

Escenario: Reinstalación en el mismo PC se permite automáticamente sin gastar transferencias
  Dado que el cliente formateó su mismo PC y vuelve a activar con su serial
  Cuando el servidor compara la huella y ve que coinciden al menos 3 de los 5 componentes con la activación vigente
  Entonces reemite la licencia firmada para la nueva llave del equipo sin consumir transferencias del año
```

### - [ ] HU-123: Verificación offline en cada arranque (firma KMS + huella ≥ 3 de 5 + prueba de posesión TPM/DPAPI) y modo Prueba de 15 días
- **Meta:** `[Hito L]` · `[P0]` · `[5 pts]` · `[apps/pos/security]` · `[Doc 10 §4.3]`
- **Como** sistema anticopia de la Edición Local, **quiero** verificar en cada arranque sin internet que la firma de la licencia sea válida, que al menos 3 de los 5 componentes de hardware coincidan y que la llave privada no exportable del TPM/DPAPI firme un desafío verificable con `device_pubkey`, **para** que copiar la carpeta del programa y la base de datos a otro PC no funcione.
```gherkin
Escenario: Copia de la carpeta completa del programa y la base de datos a otro PC es bloqueada
  Dado que alguien copia todos los archivos de una instalación activada a otro computador sin internet
  Cuando intenta abrir el programa en el segundo computador
  Entonces falla la huella de hardware y falla la prueba de posesión de la llave privada del TPM/DPAPI, mostrando "Licencia no válida para este equipo"

Escenario: Cambio de disco duro o tarjeta de red en el mismo PC no invalida la licencia
  Dado que en el PC activado se reemplazó la tarjeta Wi-Fi (cambió "mac"), pero "cpu", "board", "disk" y "os_guid" siguen iguales (4 de 5 coinciden)
  Cuando inicia la aplicación sin internet
  Entonces la verificación pasa (4 >= 3) y la caja opera normalmente
```

---

## Feature 13.3: Administración Local Completa (`packages/admin-ui` con `LocalDataProvider`)

### - [ ] HU-124: Gestión local de productos, precios, proveedores, compras, ajustes de inventario, usuarios, clientes/fiados y reportes SQL en el mismo PC
- **Meta:** `[Hito L]` · `[P0]` · `[8 pts]` · `[packages/admin-ui, apps/pos]` · `[UC-L04, Doc 10 §4.2, §4.9]`
- **Como** dueño de la Edición Local, **quiero** usar dentro del modo Administración las mismas pantallas de catálogo, importación Excel, compras, inventario, cajeros, clientes y reportes conectadas a las tablas de SQLite (`002_local_edition.sql`) y respetando los límites de mi edición (`LOCAL_ESENCIAL` vs `LOCAL_PLUS`), **para** administrar todo en mi computador sin internet.
```gherkin
Escenario: Límite de cajeros y clientes con fiado aplicado según la edición en la licencia firmada
  Dado una licencia firmada con "edition = LOCAL_ESENCIAL" (máx. 2 cajeros y 50 clientes con fiado)
  Cuando el administrador intenta crear el tercer cajero en el modo Administración local
  Entonces el núcleo Rust lo rechaza indicando que "Local Esencial permite hasta 2 cajeros (actualiza a Local Plus para cajeros ilimitados)"
```

---

## Feature 13.4: Respaldo Cifrado `.tdbak`, Solicitud de Cambio de Equipo y Restauración

### - [ ] HU-125: Generación de respaldo `.tdbak` cifrado (AES-256-GCM con código de recuperación), verificación post-escritura y copias automáticas por turno
- **Meta:** `[Hito L]` · `[P0]` · `[5 pts]` · `[apps/pos/storage]` · `[UC-L05, Doc 10 §4.5.1]`
- **Como** dueño de la Edición Local, **quiero** que al cerrar cada turno (y cuando presione "Descargar archivo de respaldo" hacia una USB o carpeta externa) se genere un archivo `.tdbak` consistente usando SQLite Online Backup API, cifrado con AES-256-GCM derivado de mi código de recuperación, y que la app lo vuelva a leer para verificar su hash SHA-256 antes de mostrar `"Respaldo verificado ✔"`, además de recordarme cada 7 días sacar copia en USB, **para** estar seguro de que mi archivo sirve si el PC se daña.
```gherkin
Escenario: Descarga manual de respaldo en memoria USB con verificación de lectura
  Dado que conecto una memoria USB en "E:\" y elijo "Descargar archivo de respaldo"
  Cuando termina de escribirse el archivo "TiendaDonaMarta_2026-10-31.tdbak"
  Entonces la aplicación reabre el archivo desde la USB, verifica su encabezado, etiqueta GCM y hash SHA-256, registra "verified_at" en "backups" y reinicia el contador del recordatorio semanal
```

### - [ ] HU-126: Asistente de "Solicitud de cambio de equipo" (cierre de turno → respaldo final verificado → liberación de licencia en línea → PC viejo en solo lectura)
- **Meta:** `[Hito L]` · `[P0]` · `[5 pts]` · `[apps/pos, services/device-service]` · `[UC-L07, Doc 10 §4.5.2]`
- **Como** dueño de la Edición Local que va a cambiar o formatear su computador, **quiero** un asistente paso a paso que me exija cerrar el turno, genere y verifique en mi USB el respaldo final `.tdbak`, envíe en línea la solicitud firmada (`POST /v1/local-activation/transfer-request`) liberando mi serial sin gastar transferencias de soporte y deje el PC viejo en estado `TRANSFERRED` (solo lectura, bloqueando nuevas ventas), **para** pasar al computador nuevo sin perder ni una sola venta hecha después del respaldo.
```gherkin
Escenario: Flujo completo de solicitud de cambio de equipo deja el PC viejo en solo lectura y libera el serial
  Dado que no hay turnos abiertos en el PC actual
  Cuando completo el asistente "Solicitud de cambio de equipo", guardo y verifico el archivo ".tdbak" en la USB y envío la solicitud con internet
  Entonces "device-service" registra en "local_transfer_requests" el hash y los conteos del respaldo, pasa la activación anterior a "DEACTIVATED" sin incrementar "transfers_used"
  Y el PC actual pasa a "device_transfer.state = TRANSFERRED" impidiendo registrar nuevas ventas

Escenario: Generación del respaldo de traslado cuando no hay internet en ese instante
  Dado que el cliente inicia el cambio de equipo pero no tiene internet en el paso 4
  Cuando confirma el respaldo en la USB
  Entonces el PC local pasa a "PENDING_RELEASE" (bloqueando ventas nuevas para proteger el respaldo) y permite enviar la solicitud apenas conecte datos del celular o liberar el serial con soporte dando el hash del respaldo
```

### - [ ] HU-127: Restablecimiento de datos desde archivo `.tdbak` con resumen previo, validación de licencia y respaldo automático de seguridad
- **Meta:** `[Hito L]` · `[P0]` · `[5 pts]` · `[apps/pos/storage]` · `[UC-L05b, Doc 10 §4.5.3]`
- **Como** dueño de la Edición Local, **quiero** seleccionar mi archivo `.tdbak` (al instalar en el PC nuevo o desde Administración → Restablecer), ingresar mi código de recuperación, ver en pantalla el resumen del archivo (negocio, fecha, cantidad de productos, clientes y ventas) y restaurarlo haciendo antes una copia automática de lo que hubiera en el PC, **para** recuperar toda mi tienda en un minuto y sin necesitar internet.
```gherkin
Escenario: Restauración exitosa en el computador nuevo verificando conteos y migrando versión de esquema si aplica
  Dado un PC nuevo ya activado con la misma licencia "LOC-2026-000123" y el archivo ".tdbak" en la USB
  Cuando selecciono el archivo, ingreso el código de recuperación y confirmo el resumen ("1.420 productos, 38 clientes, 8.910 ventas")
  Entonces la aplicación crea primero un respaldo "PRE_RESTORE", restaura la base de datos, ejecuta migraciones si el archivo era de una versión anterior y deja todos los datos listos
  Y si hay internet, notifica "POST /v1/local-activation/transfer-complete" cerrando la solicitud en la consola

Escenario: Intento de restaurar un respaldo perteneciente a otra licencia distinta
  Dado un archivo ".tdbak" cuyo manifiesto indica "license_id = LOC-2026-000111" en un PC activado con "LOC-2026-000999"
  Cuando se intenta restaurar
  Entonces la app lo bloquea a menos que consulte en línea "/v1/local-activation/restore-check" y exista una aprobación expresa del super admin en "local_restore_approvals"
```

---

## Feature 13.5: Actualizaciones (`updates_until`), Recuperación de Contraseña y Migración a la Nube

### - [ ] HU-128: Validación de `updates_until` contra la fecha de compilación del instalador y botón "Actualizar licencia" en línea
- **Meta:** `[Hito L]` · `[P1]` · `[3 pts]` · `[apps/pos]` · `[UC-L08, UC-L09, Doc 10 §4.6]`
- **Como** plataforma, **quiero** que el instalador de una versión nueva compare su fecha de compilación firmada contra `updates_until` de la licencia local (impidiendo instalar versiones compiladas después del vencimiento de actualizaciones sin tocar la versión que ya tiene instalada), y que al renovar en la consola el cliente pueda pulsar "Actualizar licencia" en línea para descargar el nuevo `updates_until`, **para** monetizar las renovaciones anuales sin romper la promesa de licencia perpetua.
```gherkin
Escenario: Instalador nuevo se detiene sin dañar la versión actual si venció el año de actualizaciones
  Dado un PC con "updates_until = 2027-10-03" y la versión 1.2 funcionando
  Cuando el cliente ejecuta el instalador de la versión 2.0 compilada el "2028-02-15"
  Entonces el instalador avisa "Tu licencia incluye actualizaciones hasta el 2027-10-03; tu versión actual sigue siendo perpetua" y aborta sin modificar la instalación existente
```

### - [ ] HU-129: Recuperación de contraseña de administrador local (por código de recuperación offline o solicitud en línea aprobada por soporte) y exportación para migrar a la nube
- **Meta:** `[Hito L]` · `[P1]` · `[3 pts]` · `[apps/pos, services/device-service]` · `[UC-L06, UC-L10, Doc 10 §4.4, §4.7]`
- **Como** dueño de la Edición Local que olvidó su contraseña de administrador o que creció y quiere pasarse al plan SaaS en la nube, **quiero** restablecer mi contraseña con mi código de recuperación (o mediante aprobación en línea del super admin) y poder exportar un paquete de migración a TienditaOnline Cloud, **para** no quedar bloqueado nunca ni perder mi historial al crecer.
```gherkin
Escenario: Restablecimiento de contraseña con el código de recuperación sin internet
  Dado que el dueño olvidó su contraseña de Administración
  Cuando hace clic en "Olvidé mi contraseña", elige "Usar código de recuperación" e ingresa su código de 16 caracteres válido
  Entonces el sistema valida el hash contra "local_admin.recovery_hash" y le permite definir una nueva contraseña
```

---

# ÉPICA 14: Infraestructura Productiva, Seguridad OWASP, Observabilidad, DR y Lanzamiento

## Feature 14.1: Infraestructura como Código (Terraform), Edge WAF, Gateway y Despliegue Gradual

### - [ ] HU-130: Módulos Terraform para VPC privada, Aurora PostgreSQL Multi-AZ, Redpanda/MSK, Redis, S3, KMS, Secrets Manager, Cloudflare WAF y ECS/EKS
- **Meta:** `[Hito 7]` · `[P0]` · `[8 pts]` · `[infra/terraform]` · `[Doc 04 §6, Doc 05 §1, Guía 00 §3.2]`
- **Como** ingeniero DevOps, **quiero** aprovisionar toda la infraestructura de `staging` y `prod` con Terraform (bases de datos en subred privada sin IP pública, cifrado KMS, Cloudflare con WAF OWASP CRS y *Authenticated Origin Pulls*, Kong Gateway con rate limiting por IP/caja/usuario y despliegue sin caída), **para** operar en producción con seguridad de nivel bancario/comercial.
```gherkin
Escenario: Bloqueo de tráfico directo al balanceador que no provenga de Cloudflare
  Dado el entorno de producción desplegado con Terraform
  Cuando un atacante intenta hacer una petición directa a la IP del ALB saltándose Cloudflare
  Entonces la conexión es rechazada por Security Group y por validación de certificado de origen (Authenticated Origin Pull)
```

### - [ ] HU-131: Configuración de `pg_partman` para particionamiento mensual automático y archivado a S3 Parquet
- **Meta:** `[Hito 7]` · `[P1]` · `[3 pts]` · `[db/cloud]` · `[Doc 02 §6]`
- **Como** DBA, **quiero** que `pg_partman` cree con 3 meses de anticipación las particiones mensuales de `ingested_events`, `sales`, `sale_lines`, `stock_movements` y `audit_log`, **para** mantener consultas rápidas con millones de ventas.
```gherkin
Escenario: Creación anticipada de particiones para los próximos 3 meses
  Cuando corre el mantenimiento programado de "pg_partman"
  Entonces existen creadas las tablas hijas para el mes actual y los 3 meses siguientes en todas las tablas particionadas
```

---

## Feature 14.2: Simulador de Cajas, Pruebas de Carga k6, Chaos Testing, Alertas y DR

### - [ ] HU-132: Simulador de terminales (`tools/terminal-simulator`) y prueba de carga k6 de reconexión masiva ("volvió la luz en la ciudad")
- **Meta:** `[Hito 4 / 7]` · `[P0]` · `[5 pts]` · `[tools/terminal-simulator]` · `[Doc 05 §9, UC-E25]`
- **Como** equipo de ingeniería, **quiero** un simulador capaz de levantar miles de cajas virtuales que generan ventas offline y reconectan al mismo tiempo, verificando que el jitter, los `Retry-After` y Kafka mantengan el `p99` de `/v1/sync/push` bajo 800 ms y que al final las ventas, el inventario y la cartera cuadren al 100 %, **para** certificar la escalabilidad antes de salir al público.
```gherkin
Escenario: Reconexión simultánea de 5.000 cajas con 200 eventos pendientes cada una
  Dado el entorno de pruebas de carga con 5.000 terminales simuladas desconectadas
  Cuando se restablece la red para todas al mismo tiempo
  Entonces ninguna venta se pierde ni se duplica, la CPU de PostgreSQL se mantiene por debajo del 75 % y todas las colas drenan en menos de 10 minutos
```

### - [ ] HU-133: Tableros de Grafana, reglas de alerta (lag de Kafka, DLT > 0, cajas sin heartbeat, outbox acumulado) y Runbooks operativos
- **Meta:** `[Hito 7]` · `[P0]` · `[3 pts]` · `[infra, docs]` · `[Doc 05 §5, Doc 09 §6]`
- **Como** responsable de operación (on-call), **quiero** alertas automáticas cuando haya mensajes en cualquier `*.dlt`, cuando el lag de `pos.events` supere 5 minutos o cuando los errores 5xx superen el 1 %, junto con los runbooks paso a paso de recuperación y restauración PITR probada, **para** resolver incidentes en minutos.
```gherkin
Escenario: Alerta inmediata cuando un mensaje cae en Dead Letter Topic
  Dado un mensaje que llega a "pos.events.dlt"
  Cuando Prometheus recolecta la métrica "dlt_messages_total > 0"
  Entonces dispara alerta inmediata al canal de guardia con el enlace al runbook de reprocesamiento
```

### - [ ] HU-134: Auto-actualizador firmado (Ed25519 + Authenticode) de la App Instalable con canales `beta`/`stable` y bloqueo con turno abierto
- **Meta:** `[Hito 5 / 7]` · `[P0]` · `[3 pts]` · `[apps/pos]` · `[Doc 01 §5, UC-E24]`
- **Como** dueño de producto, **quiero** publicar actualizaciones firmadas de la App Instalable primero al 5 % de las cajas (`beta`) y luego a `stable`, aplicando la actualización únicamente cuando no haya un turno abierto y respaldando antes la base SQLite, **para** actualizar miles de tiendas sin interrumpir a ningún cajero en pleno cobro.
```gherkin
Escenario: Actualización descargada en segundo plano espera a que se cierre el turno
  Dado que la caja tiene un turno "OPEN" y el heartbeat informa "update_available = 1.5.0"
  Cuando la caja termina de descargar y verificar la firma Ed25519 del paquete 1.5.0
  Entonces NO reinicia la aplicación durante el turno y muestra el botón "Actualizar e instalar (20 s)" justo después de cerrar el turno y subir el outbox
```

### - [ ] HU-135: Kit de lanzamiento al público: documentos legales (T&C, Política Ley 1581, DPA, EULA Local), catálogo semilla colombiano y piloto con 5–10 tiendas
- **Meta:** `[Hito 7]` · `[P0]` · `[5 pts]` · `[producto/legal]` · `[Doc 06 §3, Doc 09 §6]`
- **Como** fundador de TienditaOnline, **quiero** contar con un catálogo base precargado de los productos de tienda más vendidos en Colombia (para que un tendero empiece en minutos), los textos legales integrados en la activación y haber completado 4 semanas de piloto real y un pentest sin hallazgos críticos/altos abiertos, **para** abrir las ventas al público con total confianza.
```gherkin
Escenario: Nueva tienda importa en un clic la plantilla de productos típicos de tienda de barrio colombiana
  Dado una tienda recién activada con su catálogo vacío
  Cuando el dueño elige "Cargar catálogo base sugerido para tienda de barrio"
  Entonces se importan las categorías e ítems base con sus códigos EAN-13 reales quedando listos para ajustar precios y vender
```

---

# ÉPICA 15 (FUTURA — Mapeada): Facturación Electrónica y Documento Equivalente POS DIAN

> Estas historias corresponden a la **Fase 7 (futura)** descrita en [06 — Cumplimiento Colombia §1](06-cumplimiento-colombia.md) y [09 — Plan de implementación](09-plan-implementacion.md). Los puntos de extensión (`fiscal_mode`, `NumberingStrategy`, `FiscalDocumentStrategy` y columnas fiscales) ya quedan creados en las épicas anteriores.

## Feature 15.1: `einvoicing-service`, Resoluciones DIAN y Bloques de Numeración por Caja

### - [ ] HU-136: Gestión de resoluciones de numeración DIAN y asignación automática de bloques sin solapamiento (`EXCLUDE USING gist`) por caja
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[5 pts]` · `[services/einvoicing-service]` · `[ADR-005, Doc 06 §1.4, UC-P08, UC-E08, UC-E09]`
- **Como** dueño de tienda obligado a facturar electrónicamente, **quiero** registrar mi resolución DIAN (prefijo, rango, vigencia, clave técnica en Secrets Manager) y que el sistema asigne automáticamente a cada caja un bloque activo y un bloque de reserva sin solaparse jamás, reponiendo otro bloque al consumir el 80 %, **para** que todas mis cajas puedan emitir documentos electrónicos incluso estando sin internet.
```gherkin
Escenario: Reposición automática de bloque de reserva al alcanzar el 80 % del bloque activo
  Dado que "CAJA-01" tiene asignado el bloque activo 1..1000 y reporta haber usado hasta el número 800
  Cuando "einvoicing-service" procesa el progreso de numeración
  Entonces asigna un nuevo bloque de reserva 2001..3000 y lo publica en el stream "numbering" del pull
```

---

## Feature 15.2: Estrategias Fiscales en Caja (`DianBlockNumbering` y `DianPosFiscalDocument`)

### - [ ] HU-137: Cálculo local de CUDE (SHA-384), generación de QR DIAN, plantilla `receipt.dian_pos.v1` y emisión de Factura Electrónica con NIT en caja
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[8 pts]` · `[apps/pos/domain]` · `[ADR-004, Doc 06 §1.3, §1.5, UC-V03]`
- **Como** cajero de una tienda con `fiscal_mode = DIAN_POS`, **quiero** que al cobrar la caja tome el consecutivo del bloque DIAN activo, calcule el CUDE y el código QR según el Anexo Técnico vigente, imprima el tiquete equivalente electrónico con todas las leyendas de ley (o cambie a Factura Electrónica de Venta cuando el cliente pida factura con NIT o supere el tope en UVT), **para** cumplir con la Resolución 000165 de 2023 con latencia cero en el mostrador.
```gherkin
Escenario: Venta que supera el tope configurado en UVT exige datos del adquirente y emite Factura Electrónica
  Dado que "fiscal_mode = DIAN_POS", el tope parametrizado es 5 UVT y el total del carrito supera ese valor
  Cuando el cajero presiona "Cobrar"
  Entonces la caja solicita los datos del adquirente (o consumidor final "222222222222"), usa el bloque de numeración de "INVOICE" y calcula el CUFE/CUDE correspondiente
```

---

## Feature 15.3: Transmisión UBL 2.1, Proveedor Tecnológico, Contingencia y Almacenamiento WORM

### - [ ] HU-138: Generación de XML UBL 2.1, envío al Proveedor Tecnológico con Circuit Breaker, manejo de contingencia/rechazos y archivo WORM por 10 años
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[8 pts]` · `[services/einvoicing-service]` · `[Doc 06 §1.3, §5, UC-R06, UC-E26, UC-E27]`
- **Como** `einvoicing-service`, **quiero** consumir `sales.recorded` y `sales.returned`, construir el XML UBL 2.1 (documento POS, factura o nota de ajuste/crédito), transmitirlo al proveedor tecnológico habilitado usando circuit breaker y cola de reintentos con alerta antes del plazo legal, guardar el XML firmado y el `ApplicationResponse` en S3 con Object Lock (WORM) y enviar la representación gráfica al correo del cliente, **para** completar el ciclo fiscal ante la DIAN sin detener nunca la caja.
```gherkin
Escenario: Caída del proveedor tecnológico encola los documentos y los transmite al recuperarse
  Dado que el proveedor tecnológico responde 503 y el circuit breaker de "einvoicing-service" se abre
  Cuando llegan 50 ventas desde las cajas
  Entonces quedan registradas en "electronic_documents" con "status = PENDING" y "next_attempt_at"
  Y cuando el proveedor se recupera, el worker transmite las 50 ventas, guarda sus XML y respuestas en S3 Object Lock y las pasa a "ACCEPTED"
```

---

# Desglose Atómico para Seguimiento Diario (HU-139 a HU-520)

Las historias `HU-001` a `HU-138` definen los bloques funcionales principales. A continuación se desglosa cada microservicio, comando IPC de Tauri, pantalla UI, endpoint de BFF, caso borde (`E01–E36`) y tarea operativa en **historias atómicas de 1 a 3 puntos** (1 día o menos de trabajo por historia) con su escenario Gherkin, para seguimiento diario de sprint.

---

## Desglose Atómico EP-01: Base de Datos, Semillas y Contratos Detallados (HU-139 a HU-175)

### - [ ] HU-139: Migración `000_common.sql` — Funciones `app.current_tenant()`, `app.touch_row()` y `app.enable_tenant_rls()`
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[db/cloud]` · `[UC: Base RLS]`
- **Como** DBA, **quiero** crear las funciones base de RLS y versionado por `xid8` en el esquema `app`, **para** reutilizarlas en las 12 bases de datos.
```gherkin
Escenario: Trigger touch_row actualiza updated_at y row_xid automáticamente
  Dado una tabla con el trigger "trg_touch" activo
  Cuando se ejecuta un UPDATE sobre cualquier fila
  Entonces "updated_at" toma "now()" y "row_xid" toma "pg_current_xact_id()"
```

### - [ ] HU-140: Migración `000_common.sql` — Tablas `outbox` e `inbox` e índice parcial `outbox_unpublished`
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[db/cloud]` · `[UC: Sync]`
- **Como** desarrollador backend, **quiero** las tablas `outbox` e `inbox` en cada base de datos de servicio, **para** soportar mensajería transaccional e idempotente.
```gherkin
Escenario: Uso del índice parcial en lecturas del OutboxRelay
  Dado que hay 100.000 filas publicadas y 5 filas con "published_at IS NULL"
  Cuando el relay consulta las filas pendientes
  Entonces el plan de ejecución usa "Index Scan using outbox_unpublished"
```

### - [ ] HU-141: Semilla de departamentos y municipios de Colombia (códigos DANE)
- **Meta:** `[Hito 1]` · `[P1]` · `[1 pt]` · `[db/cloud/tenant-service]` · `[Doc 02 §9]`
- **Como** administrador, **quiero** el catálogo oficial de códigos DANE de departamentos y municipios de Colombia, **para** seleccionar la ciudad de cada tienda y sucursal.
```gherkin
Escenario: Consulta de municipio por código DANE
  Dado que se aplicó la semilla de municipios DANE
  Cuando busco el código "11001" o "05001"
  Entonces retorna "Bogotá, D.C." y "Medellín (Antioquia)" respectivamente
```

### - [ ] HU-142: Semilla de tipos de documento de identidad en Colombia (`CC`, `NIT`, `CE`, `PPT`, `TI`, `PA`) y validador de dígito de verificación DIAN (Módulo 11)
- **Meta:** `[Hito 1]` · `[P0]` · `[2 pts]` · `[packages/contracts]` · `[UC-P01]`
- **Como** sistema, **quiero** validar tipos de documento colombianos y calcular el dígito de verificación (`dv`) de cualquier NIT con el algoritmo Módulo 11 (pesos `3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71`), **para** evitar NITs mal digitados.
```gherkin
Escenario: Cálculo exacto del dígito de verificación de un NIT
  Dado el NIT "900123456"
  Cuando ejecuto "calculateNitDv('900123456')"
  Entonces retorna el dígito de verificación exacto y rechaza cualquier otro dígito enviado en el formulario
```

### - [ ] HU-143: Semilla de impuestos por defecto para tienda nueva (`IVA19`, `IVA5`, `EXENTO`, `EXCLUIDO`, `INC8`, `BOLSA`)
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[services/catalog-service]` · `[Doc 06 §2]`
- **Como** dueño de tienda nueva, **quiero** que al crearse mi tienda ya existan las tarifas de impuestos colombianas listas para usar, **para** no tener que configurarlas desde cero.
```gherkin
Escenario: Creación de impuestos semilla al recibir tenant.created
  Dado que "catalog-service" consume el evento "tenant.created"
  Cuando termina de procesarlo
  Entonces existen en "taxes" para ese tenant los códigos "IVA19", "IVA5", "EXENTO", "EXCLUIDO", "INC8" y "BOLSA"
```

### - [ ] HU-144: Semilla de denominaciones de billetes y monedas COP para la pantalla de arqueo
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/contracts]` · `[UC-C05]`
- **Como** cajero, **quiero** que la pantalla de arqueo tenga predefinidos los billetes (`$100.000`, `$50.000`, `$20.000`, `$10.000`, `$5.000`, `$2.000`, `$1.000`) y monedas (`$1.000`, `$500`, `$200`, `$100`, `$50`), **para** solo digitar la cantidad de piezas de cada uno.
```gherkin
Escenario: Multiplicación automática de piezas por denominación COP
  Dado el listado oficial de denominaciones COP
  Cuando digito 8 billetes de $50.000 y 15 monedas de $1.000
  Entonces el subtotal calculado es exactamente $415.000
```

### - [ ] HU-145: Contrato Zod `CashSessionOpenedV1` y `CashSessionClosedV1`
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/contracts]` · `[UC-C01, UC-C05]`
- **Como** desarrollador, **quiero** los esquemas estrictos de apertura y cierre de turno con desglose por denominación y por medio de pago, **para** validarlos en caja y nube.
```gherkin
Escenario: Validación de cierre de turno con conteo por denominación
  Dado un payload "CashSessionClosedV1" con "opening_float_cents", "expected_cash_cents", "declared_cash_cents" y "difference_cents"
  Cuando se valida con Zod
  Entonces verifica que "difference_cents == declared_cash_cents - expected_cash_cents"
```

### - [ ] HU-146: Contrato Zod `CashMovementRecordedV1` y `CashSessionReopenedV1`
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/contracts]` · `[UC-C02, UC-C03, UC-C04, UC-C07]`
- **Como** desarrollador, **quiero** los esquemas de movimientos de efectivo (`CASH_IN`, `CASH_OUT`, `EXPENSE`, `SUPPLIER_PAYMENT`, `SAFE_DROP`) y de reapertura de turno, **para** garantizar que siempre incluyan `reason` obligatorio.
```gherkin
Escenario: Rechazo de movimiento de caja sin motivo
  Dado un evento "cash.movement.recorded" con "reason" vacío o menor a 3 caracteres
  Cuando se valida contra "CashMovementRecordedV1"
  Entonces la validación falla
```

### - [ ] HU-147: Contrato Zod `SaleVoidedV1` y `SaleReturnedV1`
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/contracts]` · `[UC-V13, UC-V14]`
- **Como** desarrollador, **quiero** los esquemas de anulación y devolución con `original_sale_id` (o referencia manual), `approved_by`, `reason` y líneas devueltas, **para** procesar reversos de inventario y caja.
```gherkin
Escenario: Validación de devolución exige aprobador distinto al solicitante salvo dueño en Tendero
  Dado un payload "SaleReturnedV1"
  Cuando se valida el esquema
  Entonces exige "approved_by" (UUID), "reason" no vacío y al menos 1 línea devuelta con cantidad mayor a cero
```

### - [ ] HU-148: Contrato Zod `CustomerCreatedV1`, `CustomerUpdatedV1` y `CreditPaymentReceivedV1`
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/contracts]` · `[UC-K01, UC-K03]`
- **Como** desarrollador, **quiero** los esquemas de alta/edición rápida de cliente en caja y de abono a cartera, **para** sincronizar clientes y fiados offline.
```gherkin
Escenario: Alta de cliente exige fecha de consentimiento de datos personales
  Dado un payload "CustomerCreatedV1" con teléfono o correo electrónico
  Cuando "data_consent_at" es nulo
  Entonces el esquema rechaza el evento por incumplir el requisito de Habeas Data
```

### - [ ] HU-149: Contrato Zod `AuditRecordedV1` con encadenamiento de hashes
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/contracts]` · `[UC-R04]`
- **Como** oficial de seguridad, **quiero** el esquema del evento de auditoría con `action`, `actor_id`, `approved_by`, `prev_hash` y `hash`, **para** validar la cadena en la nube.
```gherkin
Escenario: Validación de estructura de evento de auditoría
  Dado un payload "AuditRecordedV1" con "hash" SHA-256 de 64 caracteres hexadecimales
  Cuando se valida con Zod
  Entonces pasa la validación y rechaza cualquier hash con longitud o formato distinto
```

### - [ ] HU-150: Contratos Zod de eventos internos de dominio (`catalog.*`, `user.*`, `tenant.*`, `device.*`, `sales.*`, `inventory.*`, `customer.*`, `cash.*`)
- **Meta:** `[Hito 1]` · `[P0]` · `[3 pts]` · `[packages/contracts]` · `[Doc 05 §4]`
- **Como** desarrollador de microservicios, **quiero** los esquemas de todos los eventos que viajan por Kafka entre servicios, **para** registrarlos en el Schema Registry.
```gherkin
Escenario: Todos los tópicos definidos en arquitectura tienen esquema validado
  Dado el catálogo de tópicos de Kafka del sistema
  Cuando se ejecuta "pnpm contracts:check"
  Entonces cada tipo de evento tiene su esquema Zod y su JSON Schema generado
```

### - [ ] HU-151: Generador y validador de identificadores UUIDv7 en TypeScript y Rust
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/service-kit, apps/pos]` · `[ADR-001]`
- **Como** desarrollador, **quiero** una función `newId()` que genere UUIDv7 ordenables por tiempo en TS y Rust, **para** evitar fragmentación de índices B-tree en PostgreSQL y SQLite.
```gherkin
Escenario: Dos UUIDv7 generados en secuencia mantienen orden lexicográfico creciente
  Dado un ID "id1" generado en el milisegundo T y un "id2" generado en T+1
  Cuando comparo "id1 < id2" como cadenas de texto
  Entonces el resultado es verdadero
```

### - [ ] HU-152: Serializador JSON canónico (RFC 8785 / JCS) idéntico en TypeScript y Rust
- **Meta:** `[Hito 1]` · `[P0]` · `[2 pts]` · `[packages/contracts, apps/pos]` · `[Doc 03 §3]`
- **Como** arquitecto, **quiero** que el cálculo de `payload_hash` use serialización JSON canónica (RFC 8785) en ambos lenguajes, **para** que la firma y el hash nunca fallen por diferencias de espacios o de orden de propiedades.
```gherkin
Escenario: Objetos con llaves en distinto orden producen el mismo SHA-256
  Dado "{ b: 1, a: 2 }" en TypeScript y "{ a: 2, b: 1 }" en Rust
  Cuando ambos calculan "canonicalSha256(obj)"
  Entonces producen exactamente el mismo hash hexadecimal
```

### - [ ] HU-153: Cliente Kafka en `service-kit` con productor `idempotent: true`, `acks: -1` y propagación de headers `traceparent` y `tenant_id`
- **Meta:** `[Hito 1]` · `[P0]` · `[2 pts]` · `[packages/service-kit]` · `[Doc 05 §4]`
- **Como** SRE, **quiero** que el productor Kafka de `service-kit` esté preconfigurado con idempotencia y `acks=all`, **para** no perder mensajes si falla un broker líder.
```gherkin
Escenario: Publicación de evento incluye cabeceras de trazabilidad y tenant
  Cuando el "OutboxRelay" publica un registro a Kafka
  Entonces el mensaje en el tópico contiene los headers "x-tenant-id", "x-event-id" y "traceparent"
```

### - [ ] HU-154: Guard de autenticación JWT y extractor de claims (`tid`, `sub`, `roles`, `perms`, `aud`, `amr`) en `service-kit`
- **Meta:** `[Hito 1]` · `[P0]` · `[2 pts]` · `[packages/service-kit]` · `[Doc 04 §2]`
- **Como** desarrollador backend, **quiero** decoradores `@RequirePermission('...')`, `@RequireAudience('...')` y `@RequireRecentMfa()` en NestJS, **para** proteger cada endpoint de forma declarativa.
```gherkin
Escenario: Rechazo de token con audiencia incorrecta
  Dado un token emitido con "aud = pos-device"
  Cuando intenta llamar a un endpoint decorado con "@RequireAudience('mgmt-app')"
  Entonces el guard responde "403 FORBIDDEN" antes de ejecutar el controlador
```

### - [ ] HU-155: Helper de pruebas de aislamiento multi-tenant (`assertTenantIsolation`) en `service-kit/testing`
- **Meta:** `[Hito 1]` · `[P0]` · `[2 pts]` · `[packages/service-kit]` · `[Doc 02 §4]`
- **Como** QA, **quiero** una función reutilizable que cree datos en `tenant_A`, ejecute el endpoint autenticado como `tenant_B` y verifique que recibe `404`/`0 filas`, **para** exigirla en el DoD de cada endpoint.
```gherkin
Escenario: Falla automática del test si un endpoint filtra datos de otro tenant
  Dado un endpoint nuevo registrado en un servicio
  Cuando se ejecuta "assertTenantIsolation(endpoint)"
  Entonces verifica lectura, actualización y borrado cruzado entre dos tenants y pasa solo si los tres son bloqueados
```

---

## Desglose Atómico EP-02: Seguridad Local, Enrolamiento, PIN y Licencias en Caja (HU-156 a HU-190)

### - [ ] HU-156: Derivación y custodia de la clave de SQLCipher en Windows Credential Manager / DPAPI y Android Keystore
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/security]` · `[Doc 04 §4]`
- **Como** núcleo Rust de la caja, **quiero** generar 32 bytes aleatorios criptográficos al inicializar la base local y guardarlos en el almacén seguro del SO, **para** abrir SQLCipher sin tener la clave en el código ni en archivos de configuración.
```gherkin
Escenario: Recuperación de la clave desde DPAPI con el mismo usuario de Windows
  Dado que la aplicación creó y guardó su clave en DPAPI
  Cuando el proceso reinicia bajo la misma cuenta del sistema operativo
  Entonces recupera la clave y ejecuta "PRAGMA key" abriendo la base en menos de 50 ms
```

### - [ ] HU-157: Ejecutor de migraciones SQLite en el arranque con copia de respaldo previa automática
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/storage]` · `[Doc 02 §8, UC-E24]`
- **Como** caja POS que se acaba de actualizar, **quiero** que si `device_state.schema_version` es menor a la versión de la app, se cree primero una copia del archivo `.db` y luego se apliquen las migraciones dentro de una transacción, **para** poder volver atrás si algo falla sin perder el outbox.
```gherkin
Escenario: Migración de esquema local preserva todos los eventos pendientes del outbox
  Dado una base local en "schema_version = 1" con 12 eventos en "outbox"
  Cuando arranca la versión de la app con "schema_version = 2"
  Entonces crea "pos.pre-migrate-v1.db", aplica la migración v2 y los 12 eventos siguen intactos en "outbox"
```

### - [ ] HU-158: Snapshot automático local cifrado cada hora y al cerrar cada turno (rotación de las últimas 30 copias)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/storage]` · `[Doc 01 §5, UC-E16]`
- **Como** sistema local, **quiero** usar la API Online Backup de SQLite para guardar una copia consistente en una carpeta secundaria local cada hora y en cada cierre de turno, **para** recuperarme automáticamente si se daña el archivo principal.
```gherkin
Escenario: Restauración automática desde el último snapshot si falla integrity_check
  Dado que el archivo principal de SQLite sufrió corrupción física de disco
  Cuando la app arranca y "PRAGMA integrity_check" devuelve error
  Entonces ofrece restaurar el último snapshot verificado y reporta en el siguiente sync el estado de secuencia
```

### - [ ] HU-159: Comando IPC `get_device_enrollment_state` y ruteo inicial en la UI (No enrolada → Enrolamiento / Enrolada → Login PIN)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-O02, UC-O06]`
- **Como** aplicación Tauri, **quiero** consultar al arrancar si `device_state` ya tiene `terminal_id`, **para** llevar al usuario directamente al Login por PIN o al asistente de enrolamiento.
```gherkin
Escenario: Caja ya enrolada abre directamente el selector de cajeros
  Dado que "device_state" tiene un "terminal_id" válido
  Cuando se abre la aplicación
  Entonces muestra la pantalla de selección de usuario y teclado numérico de PIN en menos de 1 segundo
```

### - [ ] HU-160: Lector de código QR de enrolamiento desde cámara web del PC o cámara de tablet Android
- **Meta:** `[Hito 3]` · `[P1]` · `[2 pts]` · `[apps/pos]` · `[UC-O02]`
- **Como** tendero, **quiero** poder acercar la pantalla de mi celular (con el QR de la App de Gestión) a la cámara del PC o tablet para enrolar la caja sin digitar el código, **para** evitar errores de lectura entre `0/O` o `1/I`.
```gherkin
Escenario: Lectura de QR completa los datos de enrolamiento automáticamente
  Cuando muestro el QR de enrolamiento frente a la cámara en la pantalla de vinculación
  Entonces la app extrae el código de 8 caracteres y lanza el proceso de enrolamiento automáticamente
```

### - [ ] HU-161: Renovación silenciosa en segundo plano del `access_token` del dispositivo (`POST /v1/devices/token`) cada 12 minutos
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[apps/pos/sync]` · `[Doc 04 §2]`
- **Como** motor de sincronización, **quiero** obtener y renovar en memoria el JWT de corta vida (15 min) firmando una aserción `private_key_jwt` con la llave Ed25519 del equipo, **para** autenticar llamadas a `/v1/sync/*` sin guardar tokens de larga vida.
```gherkin
Escenario: Renovación automática ante respuesta 401 por expiración del token de 15 minutos
  Dado que el token en memoria acaba de expirar
  Cuando "/v1/sync/push" responde 401
  Entonces el cliente solicita un nuevo token en "/v1/devices/token" con su firma Ed25519 y reintenta el push transparentemente
```

### - [ ] HU-162: Verificación de firma Ed25519 del `license_token` con llavero de múltiples llaves públicas (`kid`) embebidas en el binario
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[apps/pos/security]` · `[Doc 04 §2.3]`
- **Como** arquitecto de seguridad, **quiero** que el binario de la caja incluya un mapa `{ kid -> PublicKey }` para verificar la licencia firmada por la nube, **para** permitir rotar la llave de KMS sin dejar inválidas las licencias vigentes.
```gherkin
Escenario: Licencia alterada manualmente en SQLite es rechazada al verificar la firma
  Dado que alguien modifica con un editor hexadecimal la fecha "exp" o las "features" dentro de "device_state.license_token"
  Cuando la aplicación verifica la firma Ed25519 del token
  Entonces la verificación falla y la caja bloquea el inicio de ventas reportando manipulación de licencia
```

### - [ ] HU-163: Banner de aviso preventivo cuando se ha consumido más del 50 % y del 80 % de la ventana de gracia offline
- **Meta:** `[Hito 3]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[Doc 04 §2.3, UC-E11]`
- **Como** cajero o dueño, **quiero** ver un indicador claro cuando la caja lleve más de 5 días sin conectarse a internet (en una ventana de 10 días), **para** conectar el Wi-Fi o datos del celular antes de que la caja pase a solo lectura.
```gherkin
Escenario: Aviso amarillo al superar el 50 % de los días de gracia offline
  Dado un plan con "grace_days = 10" donde la última conexión exitosa fue hace 6 días
  Cuando se abre la pantalla de caja
  Entonces la barra superior muestra "6 días sin internet — Conéctate antes de 4 días para sincronizar"
```

### - [ ] HU-164: Aviso de suscripción en mora (`PAST_DUE`) visible únicamente cuando inicia sesión el rol `OWNER` en la caja
- **Meta:** `[Hito 6]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[Doc 10 §3.2]`
- **Como** dueño de tienda, **quiero** que si mi suscripción está en `PAST_DUE` el aviso aparezca en la caja solo cuando yo ingreso con mi PIN y nunca cuando ingresa el cajero, **para** que mis empleados y clientes no vean temas de cobro de mi suscripción.
```gherkin
Escenario: El cajero no ve el aviso de mora pero el dueño sí lo ve
  Dado que la licencia actual tiene "status = PAST_DUE"
  Cuando inicia sesión el usuario con rol "CASHIER"
  Entonces no se muestra ningún modal ni banner de cobro de suscripción
  Y cuando inicia sesión el usuario con rol "OWNER", se muestra el aviso "Tienes una factura pendiente de pago"
```

### - [ ] HU-165: Teclado numérico táctil y por teclado físico para ingreso de PIN con máscara visual y limpieza rápida
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-O06]`
- **Como** cajero en pantalla táctil o con teclado numérico, **quiero** botones grandes (`64x64 px` mínimo) para digitar mi PIN con `Enter` para confirmar y `Esc`/`Borrar` para limpiar, **para** entrar rápido sin equivocarme.
```gherkin
Escenario: Ingreso de PIN con teclado numérico físico sin usar el ratón
  Dado que estoy en la pantalla de login y selecciono mi usuario con las flechas del teclado
  Cuando digito los 4 números de mi PIN y presiono Enter
  Entonces inicia sesión en menos de 200 ms
```

### - [ ] HU-166: Desbloqueo en caja de un cajero bloqueado por intentos fallidos mediante el PIN del supervisor o dueño
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos/security]` · `[Doc 04 §2.1]`
- **Como** supervisor, **quiero** desbloquear en la misma caja a un cajero que bloqueó su usuario por equivocarse de PIN, ingresando mi PIN de supervisor, **para** que siga trabajando aunque no haya internet.
```gherkin
Escenario: Supervisor desbloquea en caja al cajero bloqueado
  Dado que el usuario "Carlos" tiene "failed_pin_attempts = 6" y "locked_until" en el futuro
  Cuando el supervisor presiona "Desbloquear con PIN de supervisor" y digita su PIN válido
  Entonces "failed_pin_attempts" de "Carlos" vuelve a 0, "locked_until" pasa a NULL y se audita "auth.pin.unlocked_by_supervisor"
```

### - [ ] HU-167: Cierre automático de sesión en pantalla de caja tras inactividad configurable (auto-lock)
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[UC-O07]`
- **Como** dueño de tienda, **quiero** que si la caja lleva X minutos sin tocarse (ej. 5 minutos) se bloquee la pantalla pidiendo PIN nuevamente sin perder el carrito actual, **para** evitar que un tercero use la caja sola.
```gherkin
Escenario: Bloqueo automático por 5 minutos de inactividad
  Dado que el tiempo de auto-bloqueo está configurado en 5 minutos
  Cuando transcurren 5 minutos sin eventos de teclado, lector ni ratón
  Entonces se activa la pantalla de bloqueo conservando el carrito en memoria
```

---

## Desglose Atómico EP-03: Operación Detallada de Ventas y Carrito en Caja (HU-168 a HU-205)

### - [ ] HU-168: Navegación 100 % por teclado en la pantalla de venta (sin necesidad de tocar el ratón)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[Guía 00 §5]`
- **Como** cajero experimentado, **quiero** atajos fijos para toda la venta (`F2` buscar, `+`/`-` o `*cantidad` para cambiar unidades, `Supr` quitar línea, `F4` cliente/fiado, `F6` suspender, `F8` descuento, `F9` cajón, `F10`/`Espacio` cobrar, `Esc` cancelar), **para** despachar una fila en segundos sin soltar el teclado.
```gherkin
Escenario: Venta completa de 3 productos ejecutada únicamente con el teclado
  Dado que el turno está abierto
  Cuando escaneo 3 productos, presiono "*4" sobre el último para poner 4 unidades, presiono "F10", digito el efectivo recibido y presiono "Enter"
  Entonces la venta se cobra, imprime y abre el cajón sin haber tocado el ratón ni una sola vez
```

### - [ ] HU-169: Multiplicador rápido de cantidad antes o después de escanear (`5 * código` o tecla `+`)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-V01]`
- **Como** cajero, **quiero** escribir `6*` y luego pasar 1 sola botella por el lector para que se agreguen las 6 unidades de inmediato, **para** no tener que pasar 6 veces el mismo producto por el escáner.
```gherkin
Escenario: Prefijo multiplicador antes del escaneo
  Dado que el cajero digita "6*" en la barra de escaneo
  Cuando pasa una sola vez el código de barras de "Agua 600ml"
  Entonces se agregan 6 unidades de "Agua 600ml" al carrito en una sola línea
```

### - [ ] HU-170: Cuadrícula táctil de "Productos rápidos sin código de barras" organizada por pestañas (Panadería, Huevos, Sueltos, Fruver)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[Recomendación #5]`
- **Como** tendero, **quiero** tener en la pantalla de venta botones táctiles grandes con los productos de alta rotación que no traen código de barras (pan de $500, huevo unidad, cigarrillo suelto, cilantro, bolsa de leche), **para** agregarlos con un toque.
```gherkin
Escenario: Agregar pan y huevos desde la cuadrícula rápida
  Dado que toco la pestaña "Panadería y Huevos" en la pantalla de venta
  Cuando toco 4 veces el botón "Pan $500" y 1 vez "Cubeta Huevos AA"
  Entonces el carrito contiene 4 unidades de "Pan $500" y 1 unidad de "Cubeta Huevos AA"
```

### - [ ] HU-171: Decodificador configurable de códigos de barra EAN-13 de balanza (prefijos `20–29` con peso en gramos o precio total embebido)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/domain]` · `[UC-V05]`
- **Como** tienda con balanza etiquetadora en carnicería o fruver, **quiero** que la caja interprete tanto etiquetas con peso (`20 + 5 dígitos SKU + 5 dígitos gramos + dígito control`) como etiquetas con precio total (`21 + 5 dígitos SKU + 5 dígitos pesos COP + dígito control`), **para** que sea compatible con cualquier balanza comercial (Dibal, Epelsa, Torrey, CAS).
```gherkin
Escenario: Etiqueta EAN-13 con precio total embebido calcula la cantidad en kilos hacia atrás
  Dado el producto con SKU "02010" ("Carne Molida" a $20.000/kg) y una etiqueta con prefijo "21" y valor embebido "$15.000"
  Cuando se escanea la etiqueta en la caja
  Entonces se agrega "Carne Molida" con cantidad "0,750 kg" y total de línea "$15.000"
```

### - [ ] HU-172: Indicador visual de existencia estimada en el buscador y alerta no bloqueante de stock en cero (`allow_negative_stock = true`)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[Doc 03 §5, UC-E04]`
- **Como** cajero, **quiero** ver cuántas unidades teóricas quedan al buscar un producto, pero que si el sistema dice `0` y yo tengo la botella físicamente en la mano me deje venderla sin bloquear la fila (salvo que el producto tenga explícitamente `allow_negative_stock = false`), **para** que un atraso en registrar una compra al proveedor nunca impida vender.
```gherkin
Escenario: Venta permitida cuando el stock teórico es 0 pero allow_negative_stock es true
  Dado un producto con "allow_negative_stock = 1" cuya existencia local estimada es 0
  Cuando lo escaneo y cobro la venta
  Entonces la venta se completa normalmente y la existencia local pasa a -1
```

### - [ ] HU-173: Bloqueo de venta de producto inactivo o borrado (`deleted = 1` o `status != ACTIVE`) en nuevas lecturas
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[UC-E06]`
- **Como** administrador, **quiero** que un producto desactivado no aparezca en el buscador de la caja y avise al escanearlo, **para** no seguir vendiendo referencias retiradas.
```gherkin
Escenario: Escaneo de producto desactivado muestra aviso y ofrece artículo genérico o cancelar
  Dado un producto que fue marcado con "deleted = 1" en el último pull
  Cuando el cajero escanea su código de barras
  Entonces la caja informa "Producto inactivo en el catálogo" y no lo agrega sin autorización
```

### - [ ] HU-174: Cálculo en vivo de vueltas (cambio) con botones rápidos de billetes colombianos (`Exacto`, `$2.000`, `$5.000`, `$10.000`, `$20.000`, `$50.000`, `$100.000`)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-V01]`
- **Como** cajero, **quiero** tocar el botón del billete que me entrega el cliente (ej. `$50.000`) o sumar dos botones (`$20.000 + $10.000`) y ver en números gigantes las vueltas a entregar, **para** no equivocarme devolviendo dinero.
```gherkin
Escenario: Selección de billete de $50.000 para una cuenta de $13.400
  Dado que el total a pagar es $13.400
  Cuando toco el botón "$50.000" en el modal de cobro
  Entonces el campo "Recibido" muestra "$50.000" y "Cambio a devolver" muestra en tamaño grande "$36.600"
```

### - [ ] HU-175: Validación en pagos mixtos: solo la porción en efectivo puede generar cambio (los medios digitales no pueden superar el saldo restante)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/domain]` · `[UC-V02]`
- **Como** dueño de tienda, **quiero** que en un pago mixto la suma de medios digitales/tarjeta/fiado nunca pueda superar el total de la venta y que las vueltas salgan únicamente del efectivo entregado, **para** evitar errores contables o retiros encubiertos de efectivo.
```gherkin
Escenario: Rechazo cuando el monto en Nequi supera el total de la venta
  Dado una venta cuyo total es $20.000
  Cuando el cajero intenta registrar $25.000 en el método "NEQUI"
  Entonces el sistema lo impide indicando "El pago digital no puede superar el saldo por pagar ($20.000)"
```

### - [ ] HU-176: Captura obligatoria de referencia/aprobación en pagos con Datáfono, Nequi, Daviplata, Bre-B y Transferencia
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[Doc 06 §6, UC-V20]`
- **Como** dueño de tienda, **quiero** que al seleccionar pago por Nequi, Daviplata, Bre-B, transferencia o datáfono la caja pida los últimos dígitos de la referencia o número de aprobación (y permita mostrar en pantalla el QR estático de Nequi/Bre-B de la tienda), **para** poder conciliar cada pago al final del día.
```gherkin
Escenario: Cobro con Bre-B muestra el QR de la tienda y exige referencia
  Dado que la sucursal tiene configurada su llave/QR de Bre-B
  Cuando el cajero elige medio de pago "BRE_B"
  Entonces se muestra el QR en pantalla para el cliente y se exige digitar los últimos 4–6 caracteres del comprobante antes de confirmar
```

### - [ ] HU-177: Recuperación al reiniciar la caja tras un apagón: aviso de la última venta confirmada con botón de reimpresión inmediata
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-E02]`
- **Como** cajero a quien se le fue la luz justo al cobrar, **quiero** que cuando vuelva la energía y abra la app me muestre un aviso con la última venta que alcanzó a guardarse hace pocos minutos y un botón para reimprimir su tiquete, **para** saber de inmediato si la venta había quedado registrada o no.
```gherkin
Escenario: Aviso post-apagón informa la última venta confirmada
  Dado que la venta "C01-000088" por $14.200 hizo COMMIT 3 segundos antes de un corte de energía que impidió imprimir
  Cuando el PC enciende y el cajero abre la aplicación
  Entonces muestra "Última venta registrada antes del cierre: C01-000088 por $14.200 — ¿Deseas imprimir el comprobante?"
```

### - [ ] HU-178: Continuidad del consecutivo interno `next_receipt_number` tras restaurar un respaldo (`max(local, nube) + 1`)
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[apps/pos/sync, services/device-service]` · `[UC-E08]`
- **Como** sistema, **quiero** que `device-service` guarde `last_receipt_number` reportado en el heartbeat y que si una caja restaura un snapshot local ajuste `next_receipt_number = max(local, reportado_en_nube) + 1`, **para** que jamás se repita un número de comprobante `C01-XXXXXX`.
```gherkin
Escenario: Caja restaurada desde un snapshot de hace 1 hora no repite consecutivos ya enviados
  Dado que el snapshot local tenía "next_receipt_number = 500" pero la nube ya había recibido hasta el comprobante "512"
  Cuando la caja se conecta tras restaurar el snapshot
  Entonces actualiza "next_receipt_number = 513" antes de permitir emitir nuevos comprobantes en línea
```

### - [ ] HU-179: Historial local de ventas del turno actual con búsqueda por consecutivo, hora, monto o medio de pago
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-V13, UC-V14, UC-V16]`
- **Como** cajero, **quiero** ver las ventas de mi turno actual y buscar cualquiera en segundos para reimprimirla o iniciar una devolución/anulación, **para** resolver reclamos de clientes en el mostrador.
```gherkin
Escenario: Búsqueda de una venta del turno por su número o valor
  Dado un turno con 80 ventas realizadas
  Cuando abro "Ventas del turno" y filtro por "$14.200" o por "0088"
  Entonces aparece la venta "C01-000088" con el detalle de sus productos, pagos y botones "Reimprimir" y "Anular / Devolver"
```

### - [ ] HU-180: Captura opcional de datos del comprador en el comprobante interno cuando el cliente pide su nombre/NIT en el recibo
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[UC-V03]`
- **Como** cajero de una tienda en modo no fiscal (`fiscal_mode = NONE`), **quiero** poder asociar un cliente a una venta de contado cuando me pide que el recibo salga a su nombre o con su cédula/NIT, **para** imprimir sus datos en el comprobante interno y que la venta quede lista si en el futuro se activa facturación electrónica.
```gherkin
Escenario: Comprobante de contado incluye nombre y documento del cliente seleccionado
  Dado que el cajero selecciona al cliente "Ferretería El Tornillo - NIT 900.555.111-2" en una venta en efectivo
  Cuando se imprime el comprobante interno
  Entonces el encabezado incluye el nombre y documento del cliente manteniendo la leyenda no fiscal
```

---

## Desglose Atómico EP-07 y EP-08: Sincronización, Gateway y Servicios Core en Nube (HU-181 a HU-225)

### - [ ] HU-181: Configuración de Kong / Envoy API Gateway con validación JWT por audiencia (`pos-device`, `mgmt-app`, `platform`), límites de tamaño de body y CORS
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[infra, gateway]` · `[Doc 05 §2, Doc 08 §0]`
- **Como** ingeniero de plataforma, **quiero** que el API Gateway valide la firma y audiencia del JWT en cada prefijo de ruta, limite el cuerpo de `/v1/sync/push` a 1 MB (y `/v1/app/products/import` a 10 MB) y aplique CORS con lista blanca solo al dominio de la App de Gestión, **para** proteger a todos los microservicios en el borde.
```gherkin
Escenario: Rechazo en el gateway de payload de sincronización mayor a 1 MB
  Dado un request a "POST /v1/sync/push" cuyo cuerpo excede 1 MB
  Cuando llega al API Gateway
  Entonces el gateway responde inmediatamente "413 Payload Too Large" sin reenviarlo a "sync-service"
```

### - [ ] HU-182: Rate Limiting distribuido en Redis por IP anónima, por caja, por usuario y por tienda con respuesta `429` y cabecera `Retry-After`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[gateway]` · `[Doc 04 §7]`
- **Como** SRE, **quiero** aplicar los límites por minuto definidos en arquitectura (IP anónima 10/min, push 60/min por caja, pull 30/min por caja, App de Gestión 300/min por usuario) y degradar a memoria local si Redis falla, **para** evitar abusos o ataques de fuerza bruta.
```gherkin
Escenario: Exceso de intentos de login desde una misma IP devuelve 429 con Retry-After
  Dado que una IP anónima realiza 11 intentos de login o activación en menos de 1 minuto
  Cuando envía el intento número 11
  Entonces recibe "429 Too Many Requests" con la cabecera "Retry-After" en segundos
```

### - [ ] HU-183: Middleware de idempotencia HTTP (`Idempotency-Key`) en `bff-app` y `bff-platform` respaldado por Redis (TTL 24 h)
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[packages/service-kit, services/bff-app]` · `[Doc 08 §1, UC-E35]`
- **Como** usuario de la App de Gestión con internet móvil inestable, **quiero** que toda petición `POST`/`PATCH`/`DELETE` lleve una cabecera `Idempotency-Key` y que si se reintenta por un corte de red devuelva exactamente la misma respuesta sin duplicar el producto, recepción o pago, **para** que los reintentos en móvil sean 100 % seguros.
```gherkin
Escenario: Reintento de creación de producto con la misma Idempotency-Key
  Dado que la App de Gestión envió "POST /v1/app/products" con "Idempotency-Key: K1" pero perdió la conexión antes de leer la respuesta
  Cuando la app reintenta la misma petición con "Idempotency-Key: K1"
  Entonces "bff-app" devuelve el "201 Created" guardado en caché sin crear un segundo producto
```

### - [ ] HU-184: Compresión y descompresión segura de lotes `gzip` en `sync-service` con protección contra *zip bombs*
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[services/sync-service]` · `[Doc 04 §5]`
- **Como** `sync-service`, **quiero** descomprimir cuerpos `Content-Encoding: gzip` abortando inmediatamente si el tamaño descomprimido supera los 5 MB, **para** impedir ataques de agotamiento de memoria (*gzip bomb*).
```gherkin
Escenario: Corte inmediato al descomprimir un stream gzip que supera 5 MB
  Dado un cuerpo comprimido de 100 KB que al descomprimirse crece a más de 5 MB
  Cuando "sync-service" procesa el stream de entrada
  Entonces aborta la descompresión al llegar al límite de 5 MB y responde "413 Payload Too Large"
```

### - [ ] HU-185: Cálculo de desfase de reloj (`clock_skew_ms`) al recibir cada evento en `sync-service` y alerta si supera 15 minutos
- **Meta:** `[Hito 4]` · `[P1]` · `[1 pt]` · `[services/sync-service]` · `[Doc 03 §10, UC-E10]`
- **Como** `sync-service`, **quiero** calcular `clock_skew_ms = received_at - occurred_at` cuando un evento se sube en tiempo real y guardarlo en la venta, avisando en el heartbeat si el reloj del PC tiene más de 15 minutos de desfase respecto a la nube, **para** mantener las horas de los reportes limpias.
```gherkin
Escenario: Caja en línea con el reloj del PC adelantado 1 hora recibe aviso de ajuste
  Dado una caja conectada cuya "local_time" en el heartbeat está 60 minutos adelantada respecto a "server_time"
  Cuando responde "POST /v1/terminals/heartbeat"
  Entonces incluye un mensaje de advertencia indicando el desfase del reloj del sistema operativo
```

### - [ ] HU-186: Respuesta `426 Upgrade Required` cuando `X-App-Version` es menor a la versión mínima soportada de protocolo
- **Meta:** `[Hito 4]` · `[P1]` · `[1 pt]` · `[gateway, services/sync-service]` · `[Doc 03 §11]`
- **Como** plataforma, **quiero** rechazar peticiones de versiones obsoletas no soportadas con `426 Upgrade Required`, mientras la caja sigue operando localmente y muestra al dueño el aviso para actualizar, **para** retirar versiones muy antiguas de forma controlada.
```gherkin
Escenario: Caja con versión obsoleta recibe 426 y muestra aviso de actualización sin detener ventas locales
  Dado que la versión mínima permitida en nube es "1.2.0" y una caja envía "X-App-Version: 1.0.0"
  Cuando llama a "/v1/sync/push"
  Entonces recibe "426 Upgrade Required", la caja mantiene sus eventos en el outbox sin borrarlos y muestra "Actualiza la aplicación para sincronizar"
```

### - [ ] HU-187: Generador de snapshots de Bootstrap por tienda/sucursal hacia S3 con URL prefirmada de 10 minutos
- **Meta:** `[Hito 4]` · `[P0]` · `[3 pts]` · `[services/sync-service]` · `[Doc 03 §7]`
- **Como** `sync-service`, **quiero** empaquetar en un archivo comprimido JSON Lines todas las filas actuales de `downstream_changes` para la sucursal de una caja junto con el `safe_upto` `xid8` y subirlo a S3 devolviendo una URL prefirmada, **para** que el enrolamiento y la resincronización sean rápidos y no carguen la base de datos.
```gherkin
Escenario: Bootstrap incluye el cursor xid8 exacto para continuar por pull incremental sin huecos
  Dado un paquete de bootstrap generado con "cursor_xid = 8450"
  Cuando la caja termina de importar el archivo y guarda "8450" en "sync_cursors"
  Entonces su primer "GET /v1/sync/pull?cursor=8450" trae únicamente los cambios ocurridos desde 8450 en adelante
```

### - [ ] HU-188: Réplica local `tenant_limits_replica` en `device-service`, `identity-service`, `catalog-service` y `customer-service` actualizada por eventos
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[services/*]` · `[Doc 01 §3, Doc 10 §2.3]`
- **Como** arquitecto de microservicios, **quiero** que cada servicio que valida límites del plan mantenga su propia tabla de réplica alimentada por `tenant.entitlements_changed` y `tenant.status_changed`, **para** validar cupos de plan en 1 ms sin hacer llamadas HTTP síncronas a `tenant-service`.
```gherkin
Escenario: Validación local de límite de productos sin llamar a tenant-service
  Dado que "tenant-service" está temporalmente reiniciando pero "catalog-service" ya tiene en su réplica "max_products = 3000"
  Cuando el dueño crea un producto nuevo en "catalog-service"
  Entonces la validación del límite se ejecuta contra la réplica local y responde normalmente
```

### - [ ] HU-189: Flujo de Upgrade inmediato (con prorrateo) y Downgrade diferido al fin de ciclo en `tenant-service`
- **Meta:** `[Hito 6]` · `[P1]` · `[3 pts]` · `[services/tenant-service]` · `[UC-P03, UC-E28, Doc 10 §2.3]`
- **Como** dueño de tienda, **quiero** que al subir de plan (ej. de Tendero a Negocio) las nuevas funciones y cupos se activen de inmediato calculando el prorrateo, y que al bajar de plan se programe para el fin del periodo actual exigiendo antes desactivar las cajas o usuarios sobrantes, **para** que nunca se apague una caja automáticamente a mitad de mes.
```gherkin
Escenario: Intento de downgrade teniendo más cajas activas que las permitidas en el plan destino
  Dado una tienda en plan "NEGOCIO" con 2 cajas activas que solicita bajar al plan "TENDERO" (1 caja)
  Cuando envía la solicitud de cambio de plan
  Entonces el sistema exige seleccionar cuál de las 2 cajas quedará retirada al finalizar el periodo actual antes de confirmar
```

### - [ ] HU-190: Exportación completa de datos del tenant al cancelar suscripción (`UC-P05`) y eliminación certificada tras retención legal
- **Meta:** `[Hito 6]` · `[P1]` · `[3 pts]` · `[services/tenant-service, services/reporting-service]` · `[UC-P05, Doc 06 §5]`
- **Como** dueño de tienda que cancela su suscripción, **quiero** descargar un paquete ZIP con todos mis catálogos, clientes, saldos de cartera, turnos y ventas en CSV/JSON antes de que venza el plazo de retención de 90 días posterior a `CANCELLED`, **para** conservar la historia contable de mi comercio.
```gherkin
Escenario: Descarga de archivo completo de datos de una tienda cancelada dentro de los 90 días
  Dado una tienda en estado "CANCELLED" hace 10 días
  Cuando el dueño ingresa a la App de Gestión y solicita "Descargar todos mis datos"
  Entonces se genera el paquete completo en S3 y recibe el enlace de descarga
```

---

## Desglose Atómico EP-09, EP-10 y EP-11: Inventario, Reportes, Notificaciones y App de Gestión (HU-191 a HU-235)

### - [ ] HU-191: Cálculo de pedidos sugeridos a proveedores según stock mínimo/máximo y días de visita del preventista (`UC-I08`)
- **Meta:** `[Hito 6]` · `[P2]` · `[3 pts]` · `[services/inventory-service, apps/management]` · `[UC-I08]`
- **Como** tendero en plan Negocio+, **quiero** definir el stock mínimo e ideal de mis productos principales y que el día que me visita el preventista (ej. martes para Postobón) la App de Gestión me muestre la lista sugerida de pedido (`ideal - on_hand`) lista para enviársela por WhatsApp, **para** no quedarme sin mercancía ni comprar de más.
```gherkin
Escenario: Generación de lista de pedido sugerido para el proveedor que visita hoy
  Dado que hoy es martes, el proveedor "Postobón" tiene "visit_days = [2]" y 5 de sus productos están por debajo de "min_stock"
  Cuando abro "Pedidos sugeridos" en la App de Gestión
  Entonces veo el pedido prellenado con las cantidades faltantes y el botón "Compartir pedido por WhatsApp"
```

### - [ ] HU-192: Detección y alerta de ventas realizadas en caja con precio desactualizado mientras la caja estuvo offline (`UC-E05`)
- **Meta:** `[Hito 5]` · `[P2]` · `[2 pts]` · `[services/sales-service, services/reporting-service]` · `[UC-E05]`
- **Como** dueño de tienda, **quiero** que si cambié el precio de un producto en la nube mientras una caja estaba sin internet, las ventas offline se respeten al precio que cobró la caja pero aparezcan en un indicador informativo de "Ventas con precio anterior", **para** entender cualquier diferencia de margen sin alterar lo cobrado al cliente.
```gherkin
Escenario: Venta offline con precio anterior al cambio en nube se respeta y se marca en reportes
  Dado que a las 2:00 p. m. el dueño subió el precio de un producto de $2.000 a $2.300 en la nube
  Y una caja desconectada vendió ese producto a las 2:30 p. m. a $2.000
  Cuando la venta se sincroniza a las 5:00 p. m.
  Entonces "sales-service" registra la venta exactamente en $2.000 y la incluye en el conteo de ventas con precio anterior al último cambio
```

### - [ ] HU-193: Enlace diferido de devoluciones cuya venta original de otra caja aún no había llegado a la nube (`UC-E23`)
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/sales-service]` · `[UC-E23]`
- **Como** `sales-service`, **quiero** que si llega un evento `sale.returned` referenciando un comprobante `C02-000105` que aún no ha sincronizado porque la Caja 2 sigue sin internet, la devolución quede en estado `PENDING_ORIGINAL_SALE` y se enlace automáticamente en cuanto llegue la venta de `C02` (o pase a cuarentena si no llega en 72 horas), **para** soportar devoluciones cruzadas entre cajas offline.
```gherkin
Escenario: Enlace automático cuando la venta original llega después que la devolución
  Dado que llegó primero la devolución sobre "C02-000105" y quedó en "PENDING_ORIGINAL_SALE"
  Cuando 2 horas después "CAJA-02" recupera internet y sube la venta "C02-000105"
  Entonces "sales-service" enlaza automáticamente la devolución con el "sale_id" de "C02-000105" y actualiza su estado a "PARTIALLY_RETURNED"
```

### - [ ] HU-194: Comando y job de reconstrucción total de proyecciones (`rebuild-projection`) en `reporting-service` e `inventory-service`
- **Meta:** `[Hito 4]` · `[P1]` · `[3 pts]` · `[services/reporting-service, services/inventory-service]` · `[Doc 02 §5]`
- **Como** SRE, **quiero** una herramienta administrativa que recalcule desde cero `stock_levels`, `customer_balances` o las tablas `rpt_*` para un tenant a partir de las tablas fuente inmutables / eventos en `ingested_events`, **para** reparar cualquier vista derivada en minutos si hubiera un bug en una proyección.
```gherkin
Escenario: Reconstrucción de rpt_daily_sales produce exactamente los mismos totales que la tabla fuente sales
  Dado que se ejecuta "rebuild-projection --service reporting --tenant T1"
  Cuando finaliza el job
  Entonces la suma de "gross_total" en "rpt_daily_sales" coincide al centavo con la suma de "sales" para cada día
```

### - [ ] HU-195: Pantalla de anotación y justificación de descuadres de turno por el administrador (`UC-C06`)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/management, services/cash-service]` · `[UC-C06]`
- **Como** dueño o administrador, **quiero** abrir el detalle de un turno cerrado que tuvo sobrante o faltante, ver todas sus ventas, movimientos y conteo por denominación, y registrar una nota de revisión (ej. `"Se descontó del turno siguiente"` o `"Billete estaba debajo de la gaveta"`), **para** llevar el control de cada descuadre por cajero.
```gherkin
Escenario: Registro de nota de auditoría sobre un turno con descuadre
  Dado un turno cerrado con faltante de -$10.000
  Cuando el dueño agrega la justificación "Cajero entregó recibo de taxi que olvidó registrar" y marca el turno como "Revisado"
  Entonces la nota queda guardada en el turno y registrada en "audit-service"
```

### - [ ] HU-196: Detector de cajas silenciosas (`terminal.stale`) y alerta cuando una caja lleva más de N horas sin heartbeat o con outbox de más de 24 h
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[services/device-service, services/notification-service]` · `[Doc 03 §8, Doc 05 §5]`
- **Como** dueño de tienda, **quiero** que un job en `device-service` revise cada 15 minutos qué cajas activas no han enviado heartbeat o reportan `oldest_pending_at > 24 h` y publique `terminal.stale`, **para** recibir una alerta antes de que se acumulen días de ventas sin respaldo en la nube.
```gherkin
Escenario: Emisión de alerta cuando una caja reporta ventas pendientes de hace más de 24 horas
  Dado una caja cuyo "oldest_pending_at" supera las 24 horas
  Cuando corre el verificador de "device-service"
  Entonces publica el evento "terminal.stale" y el dueño recibe una notificación indicando qué caja tiene ventas sin sincronizar
```

### - [ ] HU-197: Preferencias de notificaciones por usuario en la App de Gestión (`PUT /v1/app/me/notifications`)
- **Meta:** `[Hito 5]` · `[P2]` · `[2 pts]` · `[apps/management, services/notification-service]` · `[Doc 08 §3b]`
- **Como** dueño de tienda, **quiero** elegir en la App de Gestión qué alertas quiero recibir por Push, cuáles por WhatsApp y cuáles por correo (descuadres, anulaciones, stock negativo, cajas sin conexión), **para** evitar exceso de mensajes sin perder las alertas críticas.
```gherkin
Escenario: Desactivación de canal de correo conservando notificaciones Push para anulaciones
  Dado que desmarco "Email" y dejo marcado "Push" para el tópico "sale.void"
  Cuando ocurre una anulación en caja
  Entonces "notification-service" envía únicamente la notificación Push y no envía correo electrónico
```

### - [ ] HU-198: Diseño accesible y táctil para tenderos en ambos frontends (tipografía grande, alto contraste, pocos pasos y soporte de teclado/táctil)
- **Meta:** `[Hito 2 / 3]` · `[P0]` · `[3 pts]` · `[apps/pos, apps/management]` · `[Recomendación #9]`
- **Como** tendero (incluyendo adultos mayores o mostradores con poca luz), **quiero** una interfaz con modo de letra grande, contraste alto (WCAG AA mínimo 4.5:1), totales de cobro y cambio muy visibles y textos en español colombiano claro (sin tecnicismos como *"outbox"*, *"idempotencia"* o *"tenant"*), **para** usar el sistema sin confusiones.
```gherkin
Escenario:Activación de modo de letra grande y lenguaje claro para el tendero
  Dado que activo "Texto grande" en la configuración de la caja
  Entonces todos los precios, nombres de productos y botones de acción escalan proporcionalmente sin recortar textos
  Y ningún mensaje dirigido al usuario contiene jerga técnica interna
```

---

## Desglose Atómico de Comandos IPC Rust en la App Instalable (`apps/pos/src-tauri`) (HU-199 a HU-250)

### - [ ] HU-199: Comando IPC `cmd_enroll_device` — Validación de formato de código, generación de llaves y persistencia inicial
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-O02]`
- **Como** UI de la caja, **quiero** invocar `cmd_enroll_device(code)` en el núcleo Rust, **para** enlazar el equipo sin manejar llaves criptográficas en JavaScript.
```gherkin
Escenario: Invocación IPC con código válido enlaza la terminal
  Dado que la caja está en estado "UNENROLLED"
  Cuando la UI invoca "cmd_enroll_device('K7Q2-9XMA')"
  Entonces Rust genera el par Ed25519 en el keystore, llama a "/v1/devices/enroll" y guarda la fila única en "device_state"
```

### - [ ] HU-200: Comando IPC `cmd_run_bootstrap` — Descarga streaming, verificación de hash e importación masiva en SQLite
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-O02, Doc 03 §7]`
- **Como** núcleo Rust, **quiero** descargar el archivo de bootstrap en streaming y cargarlo por lotes dentro de una transacción SQLite reportando progreso por eventos IPC, **para** mostrar la barra de progreso real al tendero.
```gherkin
Escenario: Importación de bootstrap reporta porcentaje y hace rollback si se corta la descarga
  Dado una URL prefirmada de bootstrap con 10.000 productos
  Cuando se ejecuta "cmd_run_bootstrap"
  Entonces emite eventos de progreso (0 %..100 %) a la UI y solo confirma los cursores al terminar el 100 %
```

### - [ ] HU-201: Comando IPC `cmd_list_login_users` — Listado de operadores activos de la sucursal sin exponer hashes de PIN
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos/src-tauri]` · `[UC-O06]`
- **Como** pantalla de login de la caja, **quiero** obtener la lista de usuarios activos (`id`, `full_name`, `role_codes`, `is_locked`) sin incluir jamás el campo `pin_hash`, **para** que la WebView nunca tenga acceso al hash del PIN.
```gherkin
Escenario: Respuesta de usuarios omite pin_hash
  Cuando la UI invoca "cmd_list_login_users()"
  Entonces el JSON retornado contiene únicamente "id", "full_name", "role_codes" y "locked_until"
```

### - [ ] HU-202: Comando IPC `cmd_login_with_pin` — Verificación Argon2id en hilo bloqueante de Tokio y creación de sesión local
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-O06]`
- **Como** núcleo Rust, **quiero** ejecutar la verificación Argon2id en `tokio::task::spawn_blocking`, **para** no congelar el hilo principal durante los ~150 ms del hash.
```gherkin
Escenario: Verificación de PIN correcta crea sesión en memoria del proceso Rust
  Dado el usuario "U1" activo y no bloqueado
  Cuando se invoca "cmd_login_with_pin('U1', '4829')" con el PIN correcto
  Entonces reinicia "failed_pin_attempts = 0" y devuelve el perfil de sesión con su lista de permisos
```

### - [ ] HU-203: Comando IPC `cmd_lock_screen` y `cmd_logout_cashier` — Bloqueo de sesión conservando estado del carrito
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos/src-tauri]` · `[UC-O07]`
- **Como** cajero, **quiero** que `cmd_lock_screen` invalide la sesión activa en memoria de Rust hasta que se vuelva a validar el PIN, **para** que ningún comando IPC de venta pueda ejecutarse mientras la pantalla esté bloqueada.
```gherkin
Escenario: Cualquier comando de venta falla con UNAUTHORIZED mientras la pantalla está bloqueada
  Dado que se invocó "cmd_lock_screen()"
  Cuando alguien intenta invocar "cmd_complete_sale" por IPC
  Entonces el núcleo Rust rechaza la llamada con error "SESSION_LOCKED"
```

### - [ ] HU-204: Comando IPC `cmd_verify_approver_pin` — Validación puntual de permiso de supervisor/dueño y emisión de token de aprobación efímero
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-V08, UC-V13]`
- **Como** núcleo Rust, **quiero** validar el PIN de un aprobador para un permiso específico (`permission_code`) y devolver un `approval_nonce` de un solo uso válido por 60 segundos en memoria, **para** atarlo al comando restringido que solicitó el cajero.
```gherkin
Escenario: Token de aprobación expira tras usarse una sola vez
  Dado un "approval_nonce" generado para el permiso "sale.void"
  Cuando se usa en "cmd_void_sale" y luego se intenta reutilizar en una segunda anulación
  Entonces la segunda llamada falla con "APPROVAL_NONCE_ALREADY_USED"
```

### - [ ] HU-205: Comando IPC `cmd_get_open_cash_session` — Consulta del estado del turno actual y detección de turno vencido (> 16 h)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos/src-tauri]` · `[UC-C01, UC-E21]`
- **Como** UI de la caja, **quiero** saber al iniciar sesión si hay un turno abierto, de qué cajero es y si lleva más de 16 horas abierto, **para** pedir abrir turno o cerrar el turno olvidado.
```gherkin
Escenario: Detección de turno abierto hace 18 horas
  Dado una fila en "cash_sessions" con "status = OPEN" y "opened_at" hace 18 horas
  Cuando se invoca "cmd_get_open_cash_session()"
  Entonces retorna el turno con la bandera "is_stale = true"
```

### - [ ] HU-206: Comando IPC `cmd_open_cash_session` — Creación atómica del turno, base inicial y evento `cash.session.opened`
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-C01]`
- **Como** cajero, **quiero** que `cmd_open_cash_session(opening_float_cents, denominations)` valide que la licencia no esté en `SUSPENDED` ni vencida y que no exista otro turno `OPEN` antes de abrir el turno, **para** garantizar la regla de un solo turno abierto por caja.
```gherkin
Escenario: El índice único parcial one_open_session impide abrir dos turnos simultáneos
  Dado que ya existe un turno con "status = OPEN"
  Cuando se intenta ejecutar "cmd_open_cash_session"
  Entonces falla con error "CASH_SESSION_ALREADY_OPEN"
```

### - [ ] HU-207: Comando IPC `cmd_record_cash_movement` — Registro de ingreso, gasto, pago a proveedor o *safe drop*
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-C02, UC-C03, UC-C04]`
- **Como** cajero, **quiero** registrar movimientos manuales de efectivo validando el umbral de autorización, guardando en `cash_movements`, encolando `cash.movement.recorded` e imprimiendo el comprobante de soporte, **para** respaldar cada salida o entrada de dinero.
```gherkin
Escenario: Salida de efectivo por encima del umbral sin approval_nonce es rechazada
  Dado que el umbral de salida libre es $20.000
  Cuando se invoca "cmd_record_cash_movement" por $50.000 sin "approval_nonce"
  Entonces el comando devuelve "APPROVAL_REQUIRED"
```

### - [ ] HU-208: Comando IPC `cmd_close_cash_session_blind` — Arqueo ciego, cálculo interno de descuadre e impresión de Reporte Z
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/src-tauri]` · `[UC-C05]`
- **Como** dueño de tienda, **quiero** que el cálculo de `expected_cash_cents` ocurra exclusivamente dentro de Rust al ejecutar `cmd_close_cash_session_blind(declared_detail)` y que ningún comando IPC exponga el efectivo esperado a un usuario sin permiso `cash.session.view_expected`, **para** que el arqueo sea verdaderamente ciego incluso si alguien inspecciona la WebView.
```gherkin
Escenario: Un cajero no puede obtener expected_cash_cents por ningún comando IPC antes ni durante el arqueo
  Dado un usuario autenticado con rol "CASHIER"
  Cuando consulta el estado del turno por IPC
  Entonces el campo "expected_cash_cents" viene en NULL
```

### - [ ] HU-209: Comando IPC `cmd_reopen_cash_session` — Reapertura auditada del último turno cerrado
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[apps/pos/src-tauri]` · `[UC-C07]`
- **Como** supervisor, **quiero** reabrir el último turno cerrado si no se ha abierto otro turno posterior, **para** corregir un error de conteo en el arqueo.
```gherkin
Escenario: Prohibición de reabrir un turno antiguo cuando ya existe un turno más reciente
  Dado que después del turno "S1" ya se abrió el turno "S2"
  Cuando se intenta invocar "cmd_reopen_cash_session('S1')"
  Entonces el núcleo responde "CANNOT_REOPEN_NON_LATEST_SESSION"
```

### - [ ] HU-210: Comando IPC `cmd_lookup_barcode` — Resolución de código normal, código de paca (`pack_qty`) y código EAN-13 de balanza
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-V01, UC-V05, UC-V06]`
- **Como** pantalla de venta, **quiero** un único comando `cmd_lookup_barcode(code)` que identifique si es un código estándar, una paca o una etiqueta de balanza y devuelva el producto, la cantidad en milésimas y el precio, **para** centralizar toda la lógica de códigos en Rust.
```gherkin
Escenario: Resolución prioritaria de código exacto antes de evaluar prefijos de balanza
  Dado un código de 13 dígitos que comienza con "20" pero existe registrado exactamente en "product_barcodes"
  Cuando se invoca "cmd_lookup_barcode"
  Entonces devuelve el producto exacto de "product_barcodes"
```

### - [ ] HU-211: Comando IPC `cmd_search_products` — Búsqueda FTS5 / índice por tokens de nombre y SKU con límite de 30 resultados
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-V01]`
- **Como** cajero, **quiero** que la búsqueda por texto use una tabla virtual FTS5 en SQLite (`products_fts`) actualizada por triggers, **para** encontrar productos con palabras en cualquier orden (ej. `"500 arroz diana"`) en menos de 15 ms.
```gherkin
Escenario: Búsqueda con palabras desordenadas encuentra el producto correcto
  Dado el producto "Arroz Diana Bolsa 500g"
  Cuando invoco "cmd_search_products('500 diana')"
  Entonces el primer resultado devuelto es "Arroz Diana Bolsa 500g"
```

### - [ ] HU-212: Comando IPC `cmd_calculate_cart` — Evaluación determinística del carrito completo (impuestos, descuentos, promociones y redondeo)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-V01, UC-V08, UC-V09]`
- **Como** UI de la caja, **quiero** enviar el estado del carrito a `cmd_calculate_cart` en cada cambio y recibir todos los subtotales, impuestos por tarifa, descuentos y redondeo calculados por el motor Rust, **para** no duplicar fórmulas matemáticas en el frontend.
```gherkin
Escenario: La UI solo muestra los totales calculados por Rust
  Cuando se agrega o modifica cualquier línea del carrito en la UI
  Entonces los montos mostrados provienen exclusivamente del resultado de "cmd_calculate_cart"
```

### - [ ] HU-213: Comando IPC `cmd_park_cart` y `cmd_list_parked_carts` / `cmd_resume_parked_cart` — Persistencia de carritos en espera
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos/src-tauri]` · `[UC-V11]`
- **Como** cajero, **quiero** guardar y recuperar carritos en la tabla `parked_carts` de SQLite para que sobrevivan incluso si se reinicia el PC antes de que el cliente regrese del pasillo, **para** no perder la cuenta en espera.
```gherkin
Escenario: Carrito en espera sobrevive a un reinicio de la aplicación
  Dado un carrito guardado con "cmd_park_cart"
  Cuando se cierra y vuelve a abrir la aplicación
  Entonces "cmd_list_parked_carts" sigue devolviendo el carrito guardado listo para reanudarse
```

### - [ ] HU-214: Comando IPC `cmd_complete_sale` — Validaciones previas, transacción atómica, encolado en outbox y disparo asíncrono de periféricos
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/src-tauri]` · `[UC-V01, HU-043]`
- **Como** cajero, **quiero** que `cmd_complete_sale` responda en menos de 100 ms tras confirmar en disco y despache la impresión y el pulso del cajón sin bloquear la respuesta si la impresora es lenta, **para** sentir cobro instantáneo.
```gherkin
Escenario: Latencia de confirmación en disco menor a 100 ms
  Dado un carrito válido listo para cobrar
  Cuando se ejecuta "cmd_complete_sale"
  Entonces la transacción SQLite hace COMMIT y devuelve el comprobante confirmado en menos de 100 ms
```

### - [ ] HU-215: Comando IPC `cmd_void_sale` y `cmd_return_sale` — Validación de cantidades disponibles a devolver y reverso atómico
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-V13, UC-V14]`
- **Como** supervisor, **quiero** que `cmd_return_sale` sume todas las devoluciones previas registradas en `sale_returns` para ese `original_sale_id` e impida devolver una cantidad mayor a la comprada, **para** bloquear devoluciones dobles.
```gherkin
Escenario: Suma de devoluciones parciales no puede superar la cantidad original de la línea
  Dado una línea de venta original de 5 unidades con una devolución previa de 3 unidades
  Cuando se invoca "cmd_return_sale" intentando devolver 3 unidades más de esa línea
  Entonces retorna error "RETURN_QTY_EXCEEDS_SOLD_QTY"
```

### - [ ] HU-216: Comando IPC `cmd_create_quick_customer` y `cmd_search_customers` — Gestión local de clientes y cálculo de cupo disponible
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-K01, UC-K04]`
- **Como** cajero, **quiero** buscar clientes en SQLite en menos de 20 ms y crear clientes nuevos validando que no se repita `(doc_type, doc_number)` localmente, **para** operar fiados sin red.
```gherkin
Escenario: Prevención de documento duplicado al crear cliente rápido en caja
  Dado que ya existe en la tabla local "customers" la cédula "CC 79123456"
  Cuando el cajero intenta crear otro cliente con "CC 79123456"
  Entonces el comando devuelve el cliente existente en lugar de duplicarlo
```

### - [ ] HU-217: Comando IPC `cmd_record_credit_payment` — Registro atómico de abono de cartera, movimiento de caja e impresión de recibo
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src-tauri]` · `[UC-K03]`
- **Como** cajero, **quiero** que al registrar un abono de un cliente se actualice su saldo local estimado, se sume a la caja del turno si fue en efectivo y se imprima el comprobante de abono, todo en una sola transacción SQLite, **para** que nunca se descuadre la caja ni la cartera.
```gherkin
Escenario: Rechazo de abono mayor a la deuda salvo confirmación explícita de saldo a favor
  Dado un cliente cuyo saldo estimado es $15.000
  Cuando el cajero digita por error un abono de $150.000
  Entonces el comando advierte "El valor supera el saldo pendiente ($15.000)" antes de permitir continuar
```

### - [ ] HU-218: Comando IPC `cmd_get_sync_status` y `cmd_trigger_sync_now` — Estado del outbox, último latido y botón "Sincronizar ahora"
- **Meta:** `[Hito 4]` · `[P0]` · `[1 pt]` · `[apps/pos/src-tauri]` · `[Doc 03 §8]`
- **Como** dueño o cajero, **quiero** ver cuántos eventos están pendientes por subir, cuándo fue la última sincronización exitosa y tener un botón "Sincronizar ahora" que reinicie el circuit breaker si estaba abierto y haga push + pull inmediato, **para** forzar la sincronización cuando acabo de reconectar el internet.
```gherkin
Escenario: Botón Sincronizar ahora salta la espera del backoff y ejecuta push y pull inmediatos
  Dado que el circuit breaker del cliente estaba en espera de backoff pero el usuario acaba de conectar el cable de red
  Cuando presiona "Sincronizar ahora"
  Entonces el circuito pasa a "SEMI_ABIERTO", ejecuta el heartbeat, sube el outbox y descarga las novedades del catálogo
```

---

## Desglose Atómico de Pantallas UI de la App Instalable (`apps/pos/src`) (HU-219 a HU-245)

### - [ ] HU-219: Barra superior de estado en la App Instalable (Indicador Online/Offline, cola Outbox, Impresora, Cajero activo, Turno y Reloj)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src]` · `[UC-E01]`
- **Como** cajero, **quiero** una barra superior fija que muestre siempre el semáforo de internet/sincronización, el estado de la impresora, mi nombre, el número de caja (`CAJA-01`) y el botón de bloqueo, **para** conocer el estado del equipo de un vistazo.
```gherkin
Escenario: Cambio instantáneo del indicador cuando se desconecta el internet
  Dado que la caja está vendiendo en línea
  Cuando se pierde la conexión de red
  Entonces el indicador pasa a "Modo sin internet — Tus ventas están seguras en este equipo" sin mostrar ningún popup que interrumpa la venta
```

### - [ ] HU-220: Pantalla principal de Venta dividida en 2 paneles: Carrito + Totales a la izquierda y Buscador + Botones Rápidos a la derecha
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/src]` · `[UC-V01]`
- **Como** cajero, **quiero** ver simultáneamente la lista de productos escaneados con su total gigante y la cuadrícula de productos rápidos / buscador sin cambiar de pestaña, **para** combinar lector de código de barras y toques en pantalla.
```gherkin
Escenario: El foco del lector de código de barras se mantiene activo aunque el cajero toque botones en pantalla
  Dado que el cajero acaba de tocar el botón táctil "Pan $500"
  Cuando inmediatamente pasa una gaseosa por el lector de código de barras
  Entonces el código es capturado por el listener global y agrega la gaseosa sin perder ningún dígito
```

### - [ ] HU-221: Modal de Cobro (`F10`) con pestañas de Efectivo, Pago Mixto, Fiado y Medios Digitales
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/src]` · `[UC-V01, UC-V02, UC-V04]`
- **Como** cajero, **quiero** que al presionar `F10` se abra el modal de cobro con "Efectivo exacto" preseleccionado para que baste presionar `Enter` si me pagan exacto, o elegir billete / medio digital / fiado en un toque, **para** cobrar una venta de contado en 2 teclas (`F10` → `Enter`).
```gherkin
Escenario: Cobro en efectivo exacto con solo dos pulsaciones (F10 + Enter)
  Dado un carrito con total de $5.000
  Cuando presiono "F10" y enseguida presiono "Enter"
  Entonces se registra el cobro en efectivo por $5.000 con cambio $0, se imprime y se limpia el carrito para el siguiente cliente
```

### - [ ] HU-222: Modal de Apertura de Turno con calculadora opcional de billetes y monedas para la base inicial
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src]` · `[UC-C01]`
- **Como** cajero, **quiero** poder escribir el monto total de la base (ej. `$100.000`) o desplegar el contador de billetes y monedas para que me sume la base automáticamente al recibir el turno, **para** verificar que la base que me entregan esté completa.
```gherkin
Escenario: Suma automática de la base inicial contando billetes y monedas
  Cuando despliego "Contar por denominación" y digito 3 billetes de $20.000 y 4 billetes de $10.000
  Entonces el campo de base inicial se llena con "$100.000"
```

### - [ ] HU-223: Pantalla de Cierre de Turno y Arqueo Ciego paso a paso (1. Efectivo por denominación → 2. Datáfono/Digitales → 3. Confirmación e impresión Z)
- **Meta:** `[Hito 2]` · `[P0]` · `[3 pts]` · `[apps/pos/src]` · `[UC-C05]`
- **Como** cajero, **quiero** un asistente de 3 pasos claros al cerrar mi turno que me pida contar el dinero físico, verificar los pagos digitales del turno y advertirme antes de cerrar definitivamente, **para** evitar errores de digitación en el arqueo ciego.
```gherkin
Escenario: Confirmación doble antes de enviar el arqueo ciego
  Dado que el cajero terminó de digitar las cantidades de cada billete y moneda sumando $285.400
  Cuando presiona "Cerrar turno"
  Entonces aparece el resumen de las denominaciones digitadas pidiendo confirmar "¿Estás seguro? Una vez cerrado el turno no podrás modificar el conteo sin un supervisor"
```

### - [ ] HU-224: Pantalla de Clientes y Cartera en Caja (Buscar cliente, Ver saldo estimado, Registrar abono, Crear cliente rápido)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src]` · `[UC-K01, UC-K03, UC-K04]`
- **Como** cajero, **quiero** una sección de Clientes en la caja donde pueda recibir abonos rápidamente o seleccionar al vecino para fiarle la compra actual, **para** atender el cuaderno de fiados desde la pantalla.
```gherkin
Escenario: Selección de cliente desde el modal de fiado y regreso automático al cobro
  Dado que estoy en el modal de cobro en la pestaña "Fiado"
  Cuando busco "Marta", la selecciono y confirmo
  Entonces se valida su cupo disponible y queda listo el botón "Confirmar venta fiada"
```

### - [ ] HU-225: Pantalla de Configuración Local de Hardware en Caja (Impresora, Cajón, Balanza, Tamaño de letra, Sonidos)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/src]` · `[HU-048, HU-051, HU-052]`
- **Como** técnico o dueño instalando la caja, **quiero** una pantalla para elegir la impresora, el ancho de papel (58/80 mm), si corta papel, si tiene cajón monedero conectado, el puerto de la balanza y probar cada periférico con un botón, **para** dejar el mostrador funcionando en 2 minutos.
```gherkin
Escenario: Selección de impresora y prueba inmediata de pulso del cajón monedero
  Cuando selecciono la impresora "POS-58" y presiono "Probar cajón monedero"
  Entonces envía el comando ESC/POS de apertura y el cajón se abre físicamente
```

---

## Desglose Atómico de Pantallas y Flujos de la App de Gestión (`apps/management` + `bff-app`) (HU-226 a HU-275)

### - [ ] HU-226: Navegación adaptativa en Expo Router (Sidebar en Web/Desktop y Bottom Tabs + Drawer en iOS/Android) filtrada por permisos
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[apps/management]` · `[Doc 01 §6, Doc 04 §3]`
- **Como** usuario de la App de Gestión (dueño, admin de sucursal o contador), **quiero** que el menú se adapte a pantalla grande en navegador web y a pestañas inferiores en celular, ocultando las secciones para las que mi rol no tiene permiso (ej. el contador solo ve Reportes), **para** usar la misma aplicación cómodamente en cualquier dispositivo.
```gherkin
Escenario: Usuario con rol ACCOUNTANT solo ve la sección de Reportes
  Dado un usuario autenticado con rol "ACCOUNTANT"
  Cuando carga la App de Gestión en web o móvil
  Entonces el menú muestra únicamente "Reportes" y "Mi perfil", y oculta "Catálogo", "Inventario", "Usuarios" y "Cajas"
```

### - [ ] HU-227: Pantalla de Activación Inicial del Dueño (bienvenida, contraseña, enrolamiento TOTP/QR con Google Authenticator, PIN de caja y declaración legal)
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-P01b, HU-074]`
- **Como** dueño que recibe el enlace de bienvenida, **quiero** un asistente guiado de 4 pasos que me explique cómo instalar Google/Microsoft Authenticator, verifique el código de 6 dígitos, guarde mi PIN para la caja y al terminar me muestre el botón de descarga del instalador de Windows y el QR de `CAJA-01`, **para** dejar mi negocio listo sin ayuda técnica.
```gherkin
Escenario: Finalización del asistente de activación muestra descarga de la caja y QR de CAJA-01
  Cuando completo los 4 pasos de activación de cuenta
  Entonces la pantalla final muestra el enlace "Descargar TienditaOnline Caja para Windows" y el código QR de enrolamiento de "CAJA-01"
```

### - [ ] HU-228: Asistente de carga inicial de catálogo: elegir "Catálogo base de tienda de barrio colombiana", "Subir archivo Excel" o "Crear con la cámara"
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-P02, HU-081, HU-135]`
- **Como** tendero recién registrado, **quiero** que al entrar por primera vez al catálogo me ofrezca pre-cargar las categorías y productos más comunes de tienda de barrio en Colombia (marcando qué tipos de productos vendo: abarrotes, lácteos, gaseosas, licores, aseo, dulces) y solo ajustar mis precios, **para** no empezar con el sistema en blanco.
```gherkin
Escenario: Precarga selectiva por categorías de tienda de barrio
  Dado un catálogo vacío en una tienda nueva
  Cuando selecciono las categorías "Abarrotes", "Gaseosas y Bebidas" y "Lácteos" en el asistente inicial
  Entonces se crean las categorías y los productos base con sus códigos de barra EAN-13 oficiales en menos de 5 segundos
```

### - [ ] HU-229: Listado de productos con búsqueda instantánea, filtros (categoría, stock bajo/negativo, sin código, inactivos) y edición rápida de precio en línea
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[apps/management]` · `[UC-I01]`
- **Como** dueño de tienda cuando sube el precio de un proveedor, **quiero** buscar una marca o categoría y editar el precio de venta directamente desde la lista con un toque, **para** actualizar 20 precios en un par de minutos.
```gherkin
Escenario: Edición rápida de precio en la tabla de productos envía PATCH con If-Match
  Dado que cambio el precio de "Leche Bolsa 1L" de $4.200 a $4.500 directamente en la fila del listado
  Cuando presiono Enter o guardar
  Entonces envía "PATCH /v1/app/products/{id}" con "If-Match: <version>" y muestra confirmación visual inmediata
```

### - [ ] HU-230: Formulario completo de producto (nombre, SKU autogenerado o manual, categoría, marca, unidad, pesaje, múltiples códigos de barra y empaques, costo, precio, margen en vivo e impuestos)
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-I01, UC-V05, UC-V06]`
- **Como** administrador, **quiero** que al digitar el costo de compra y el precio de venta el formulario me muestre en vivo el porcentaje de ganancia (margen) y me permita agregar el código de barras de la unidad y el de la paca/caja (`pack_qty`), **para** configurar bien la rentabilidad del producto.
```gherkin
Escenario: Cálculo en vivo del margen de ganancia al escribir costo y precio
  Dado que en el formulario de producto escribo "Costo = $2.000" y "Precio de venta = $2.500" (excluido de IVA)
  Entonces el indicador junto al precio muestra "Ganancia: $500 (Margen: 20 %)"
```

### - [ ] HU-231: Pantalla de Precios por Sucursal y Programación de Cambios de Precio Futuros (`UC-I03`)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/management]` · `[UC-I03, HU-080]`
- **Como** dueño, **quiero** definir un precio distinto para una sucursal específica o programar un aumento de precios para una fecha futura, **para** preparar cambios de lista antes de que abran las tiendas.
```gherkin
Escenario: Programación de nuevo precio para el lunes a las 6:00 a. m.
  Cuando selecciono 10 productos y programo un incremento del 5 % con fecha de inicio "Lunes 06:00 a. m."
  Entonces quedan creados los registros en "branch_prices" con "valid_from" futuro y estado "Programado"
```

### - [ ] HU-232: Pantalla de "Artículos genéricos vendidos en caja" con botón "Convertir en producto del catálogo"
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/management]` · `[UC-I10, HU-082]`
- **Como** dueño de tienda, **quiero** ver una notificación cuando los cajeros vendieron artículos genéricos y abrir el formulario de creación de producto ya prellenado con el nombre y el precio que cobró el cajero, **para** formalizar esos productos en segundos.
```gherkin
Escenario: Crear producto a partir de un artículo genérico prellena nombre y precio
  Dado el artículo genérico pendiente "Chocoramo Mini" vendido en caja a $1.800
  Cuando toco "Crear producto" sobre esa fila
  Entonces se abre el formulario con nombre "Chocoramo Mini" y precio "$1.800" pidiendo solo escanear el código de barras o guardar
```

### - [ ] HU-233: Pantalla de Proveedores y Recepción de Mercancía con escáner de cámara del celular y opción "¿Se pagó con efectivo de la caja?"
- **Meta:** `[Hito 5]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-I04, HU-089]`
- **Como** tendero cuando llega el camión del proveedor, **quiero** escanear con mi celular cada producto que me entregan, poner cuántas unidades llegaron y cuánto costaron, e indicar si se pagó de la caja o del bolsillo del dueño, **para** que el stock suba de inmediato en el sistema.
```gherkin
Escenario: Recepción de pedido con 5 productos desde el celular actualiza existencias al instante
  Cuando escaneo 5 productos con la cámara, ingreso las cantidades recibidas y sus costos y presiono "Registrar entrada de mercancía"
  Entonces "inventory-service" crea el registro en "purchase_receipts", suma las unidades en "stock_levels" y recalcula el costo promedio
```

### - [ ] HU-234: Pantalla de Ajustes de Inventario (Merma, Avería, Vencido, Consumo propio) y de Conteo Físico guiado con cámara
- **Meta:** `[Hito 5]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-I05, UC-I06, HU-090, HU-091]`
- **Como** dueño de tienda, **quiero** poder hacer conteos rápidos ("Inventario relámpago" de los 20 productos más caros o de una categoría como Licores/Cigarrillos) desde mi celular y ver al instante si faltan unidades, **para** controlar los productos que más se pierden.
```gherkin
Escenario: Conteo relámpago de la categoría Cigarrillos muestra diferencias antes de aplicar
  Dado que inicio un conteo de la categoría "Cigarrillos"
  Cuando ingreso las cantidades contadas de las 10 referencias
  Entonces la pantalla muestra una tabla comparativa "Sistema vs. Contado vs. Diferencia en unidades y en $" antes de confirmar el ajuste
```

### - [ ] HU-235: Pantalla de Clientes y Cartera en la App de Gestión (listado de deudores, antigüedad de deuda, estado de cuenta en PDF/WhatsApp, bloqueo de cupo y botón de recordatorio)
- **Meta:** `[Hito 5]` · `[P0]` · `[3 pts]` · `[apps/management]` · `[UC-K02, UC-K04, UC-K05]`
- **Como** dueño de tienda, **quiero** ver quiénes me deben dinero ordenados por monto o por días sin abonar, bloquearle el fiado a un moroso con un interruptor y enviarle su estado de cuenta por WhatsApp, **para** cobrar mi cartera a tiempo.
```gherkin
Escenario: Bloqueo del interruptor de fiado impide nuevas ventas a crédito en la caja
  Dado que "Don Pedro" tiene una deuda vencida de hace 45 días
  Cuando el dueño desactiva el interruptor "Permitir fiado" en su ficha
  Entonces "credit_enabled" pasa a "false", el cambio baja a las cajas y el cajero ya no puede venderle fiado
```

### - [ ] HU-236: Pantalla de Conciliación de Pagos Digitales del Día (Nequi, Daviplata, Bre-B, Transferencia, Datáfono) con filtros y confirmación por lote
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[apps/management]` · `[UC-V20, HU-085]`
- **Como** dueño de tienda al final del día, **quiero** ver en una sola lista todos los pagos por Nequi, Daviplata, Bre-B y datáfono con su hora, valor y referencia, e ir marcándolos con un check mientras miro los movimientos de mi banco/billetera, **para** verificar en 3 minutos que todo el dinero digital entró realmente.
```gherkin
Escenario: Confirmación masiva de pagos digitales verificados del turno
  Dado que hay 12 pagos por Nequi en estado "PENDING" en el turno de la tarde
  Cuando marco los 12 como verificados y presiono "Confirmar seleccionados"
  Entonces los 12 pasan a "CONFIRMED" y el turno queda conciliado al 100 %
```

### - [ ] HU-237: Pantalla "Mi Suscripción y Facturación" en la App de Gestión (plan actual, uso de cupos, facturas, botón Pagar con PSE/Nequi/Tarjeta y cambio de plan)
- **Meta:** `[Hito 6]` · `[P0]` · `[2 pts]` · `[apps/management]` · `[UC-P03, UC-P04]`
- **Como** dueño de tienda, **quiero** ver cuánto estoy usando de mi plan (ej. `1 de 1 cajas`, `2 de 2 usuarios`, `840 de 3.000 productos`), mis facturas pendientes y pagadas y un botón para pagar en línea con PSE/Nequi o cambiar de plan, **para** estar al día sin tener que escribir a soporte.
```gherkin
Escenario: Pago de factura pendiente desde la App de Gestión cuando la cuenta está en RESTRICTED
  Dado una tienda en estado "RESTRICTED" (solo lectura por mora en D+8)
  Cuando el dueño entra a la App de Gestión
  Entonces ve destacada su factura pendiente con el botón "Pagar ahora ($34.900)" y al completarse el pago se habilitan nuevamente todas las funciones de escritura
```

---

## Desglose Atómico de Reportes en `reporting-service`, `bff-app`, `bff-pos` y `packages/ui-reports` (HU-238 a HU-262)

### - [ ] HU-238: Reporte de Ventas por Día, Semana, Mes y Rango Personalizado (`/v1/app/reports/sales` y `/v1/pos-reports/sales`)
- **Meta:** `[Hito 4 / 5]` · `[P0]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R01]`
- **Como** dueño de tienda, **quiero** consultar las ventas brutas, descuentos, devoluciones, ventas netas, número de tiquetes y ticket promedio por cualquier rango de fechas, **para** comparar cómo van mis ventas.
```gherkin
Escenario: Consulta de ventas del mes actual agrupadas por día
  Cuando consulto "/v1/app/reports/sales?from=2026-10-01&to=2026-10-31&group_by=day"
  Entonces retorna la serie diaria en zona horaria "America/Bogota" en menos de 200 ms desde "rpt_daily_sales"
```

### - [ ] HU-239: Reporte de Ventas por Hora del Día (mapa de calor de horas pico de la tienda)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R01]`
- **Como** dueño de tienda, **quiero** ver en qué horas del día se concentran más ventas y tiquetes (`rpt_hourly_sales`), **para** organizar los turnos y horarios de mis cajeros.
```gherkin
Escenario: Gráfica de ventas por franja horaria
  Cuando abro el reporte "Ventas por hora" del último mes
  Entonces muestra las 24 franjas horarias destacando las horas pico de mayor facturación y número de clientes
```

### - [ ] HU-240: Reporte de Ventas por Medio de Pago (Efectivo, Nequi, Daviplata, Bre-B, Datáfono, Transferencia, Fiado)
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R01]`
- **Como** dueño de tienda, **quiero** ver cuánto vendí en cada medio de pago y qué porcentaje representa del total, **para** cuadrar mi efectivo y mis cuentas bancarias/billeteras.
```gherkin
Escenario: Desglose exacto por medio de pago coincide con el total de ventas
  Dado un día con ventas en Efectivo ($500.000), Nequi ($200.000) y Fiado ($100.000)
  Cuando consulto el desglose por medio de pago
  Entonces muestra los tres montos y porcentajes (62,5 %, 25 % y 12,5 %) sumando $800.000
```

### - [ ] HU-241: Reporte de Ventas por Sucursal y Comparativo entre Sucursales (plan Multi-tienda)
- **Meta:** `[Hito 6]` · `[P2]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R01]`
- **Como** dueño con varias sucursales, **quiero** comparar en una sola tabla y gráfica las ventas, el ticket promedio y el margen de cada una de mis tiendas, **para** identificar cuál local rinde mejor.
```gherkin
Escenario: Comparativo entre Sucursal Centro y Sucursal Norte
  Dado un tenant con 2 sucursales y feature "reports_multi_branch = true"
  Cuando consulta el reporte agrupado por "branch"
  Entonces ve los totales y variaciones porcentuales de cada sucursal lado a lado
```

### - [ ] HU-242: Reporte de Ventas y Desempeño por Caja y por Cajero
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R03]`
- **Como** dueño de tienda, **quiero** ver cuánto vendió cada cajero, cuántos tiquetes atendió, cuántas anulaciones/eliminaciones de carrito tuvo y su historial de descuadres de turno, **para** evaluar a mi personal con datos objetivos.
```gherkin
Escenario: Resumen de desempeño por cajero en el mes
  Cuando filtro el reporte de personal para el mes actual
  Entonces veo por cada cajero: total vendido, tiquetes, promedio de descuadre en arqueos y cantidad de ítems borrados del carrito
```

### - [ ] HU-243: Reporte de Productos Más Vendidos (por unidades y por dinero) y Productos Hueso / Sin Rotación
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R01, UC-R07]`
- **Como** tendero, **quiero** saber cuáles son los 20 productos que más se venden y cuáles llevan más de 30 días con stock mayor a cero pero sin vender ni una unidad, **para** no volver a comprar mercancía que se queda quieta en el estante.
```gherkin
Escenario: Identificación de productos con existencia pero cero ventas en 30 días
  Dado un producto con "on_hand = 15" que no tiene registros en "rpt_product_sales_daily" en los últimos 30 días
  Cuando consulto la pestaña "Productos sin rotación"
  Entonces aparece listado con sus 15 unidades y el capital inmovilizado ("on_hand * avg_cost")
```

### - [ ] HU-244: Reporte de Rentabilidad y Margen Bruto por Producto y por Categoría (`reports.financial`, plan Negocio+)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R07]`
- **Como** dueño en plan Negocio+, **quiero** ver la utilidad bruta (`ingresos_sin_impuestos - costo_promedio * unidades`) por producto y categoría, **para** saber qué productos me dejan más ganancia real.
```gherkin
Escenario: Cálculo de utilidad bruta y margen porcentual en el periodo
  Dado un producto que vendió 100 unidades a $3.000 (excluido) con costo promedio de $2.100
  Cuando consulto el reporte de rentabilidad con permiso "reports.financial"
  Entonces muestra Ingresos $300.000, Costo $210.000, Utilidad $90.000 y Margen 30 %
```

### - [ ] HU-245: Reporte de Turnos y Arqueos (`/v1/app/reports/shifts`) con filtro de turnos con descuadre
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R03]`
- **Como** administrador, **quiero** listar todos los turnos cerrados y abiertos con su base, esperado, declarado y diferencia, pudiendo filtrar "Solo con faltante/sobrante", **para** auditar los cierres rápidamente.
```gherkin
Escenario: Filtro de turnos con faltante mayor a $5.000
  Cuando activo el filtro "Con descuadre" en el reporte de turnos
  Entonces retorna únicamente los turnos donde "abs(difference) > 0" ordenados del más reciente al más antiguo
```

### - [ ] HU-246: Reporte de Cartera y Antigüedad de Saldos de Fiado (Al día, 1–15 días, 16–30 días, > 30 días)
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R08]`
- **Como** dueño de tienda, **quiero** ver el total que me deben en la calle clasificado por antigüedad desde la última compra/abono, **para** priorizar a quién cobrarle primero.
```gherkin
Escenario: Clasificación de cartera por tramos de antigüedad
  Cuando abro el reporte de Cartera
  Entonces muestra el saldo total de fiados dividido en los tramos "0-15 días", "16-30 días" y "Más de 30 días"
```

### - [ ] HU-247: Reporte de Existencias Valorizadas y Alertas de Inventario (Stock Bajo y Stock Negativo)
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-I09]`
- **Como** dueño de tienda, **quiero** saber cuánto vale todo mi inventario actual a precio de costo y a precio de venta, y ver la lista de productos en alerta (`LOW` o `NEGATIVE`), **para** conocer el valor de mi negocio y corregir descuadres de stock.
```gherkin
Escenario: Alerta inmediata de productos con existencia negativa por ventas offline concurrentes
  Dado que "rpt_inventory_alerts" tiene 2 productos con "kind = NEGATIVE"
  Cuando abro el reporte de Inventario
  Entonces aparecen en la parte superior con el botón "Hacer conteo de ajuste"
```

### - [ ] HU-248: Reporte Libro de Ventas e Impuestos Discriminados por Tarifa para el Contador (`/v1/app/reports/taxes`)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/reporting-service, packages/ui-reports]` · `[UC-R05]`
- **Como** dueño o contador de la tienda, **quiero** un resumen mensual con el rango de comprobantes emitidos por cada caja (`C01-000100` a `C01-000950`), bases gravables e impuestos por tarifa (`IVA 19%`, `IVA 5%`, `Exento`, `Excluido`, `INC 8%`, `Bolsas`), **para** elaborar declaraciones tributarias y contabilidad sin sumar tiquetes a mano.
```gherkin
Escenario: Consolidado mensual por tarifa de impuesto y rango de consecutivos por caja
  Cuando consulto el reporte de impuestos del mes de octubre
  Entonces muestra el primer y último comprobante emitido en cada caja y la tabla con Base, Tarifa e Impuesto total de cada código tributario
```

### - [ ] HU-249: Visor de Bitácora de Auditoría de Operaciones Críticas (`/v1/app/reports/audit`, plan Negocio+)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/bff-app, packages/ui-reports]` · `[UC-R04]`
- **Como** dueño en plan Negocio+, **quiero** filtrar la bitácora de auditoría por tipo de evento (anulaciones, devoluciones, cajón abierto sin venta, ítems borrados del carrito, descuentos autorizados, intentos fallidos de PIN, cambios de precio), por cajero y por fecha, **para** investigar cualquier anomalía en mi tienda.
```gherkin
Escenario: Búsqueda de todas las aperturas manuales de cajón de la semana
  Cuando filtro la auditoría por "action = drawer.open.manual"
  Entonces veo cada evento con fecha/hora exacta, caja, cajero que lo solicitó, supervisor que lo aprobó y el motivo escrito
```

---

## Desglose Atómico EP-12: Consola del Super Admin (`platform-console` + `bff-platform`) (HU-250 a HU-275)

### - [ ] HU-250: Dashboard global del Super Admin (MRR, tiendas activas por plan, en prueba, en mora, suspendidas, licencias locales vendidas y salud técnica)
- **Meta:** `[Hito 3 / 6]` · `[P0]` · `[3 pts]` · `[apps/platform-console, services/bff-platform]` · `[UC-P06, Doc 10 §3.5]`
- **Como** super admin dueño del SaaS, **quiero** ver al abrir mi consola el ingreso mensual recurrente (MRR), cuántas tiendas hay en `TRIAL`, `ACTIVE`, `PAST_DUE`, `RESTRICTED` y `SUSPENDED`, cuántas cajas llevan más de 24 h sin latido y si hay mensajes en DLT, **para** controlar la salud comercial y técnica de toda la plataforma.
```gherkin
Escenario: Carga del panel principal de plataforma con métricas financieras y técnicas
  Cuando inicio sesión con MFA en "platform-console"
  Entonces veo los indicadores de MRR, tiendas por estado, tasa de conversión de prueba a pago y el semáforo de salud de Kafka y bases de datos
```

### - [ ] HU-251: Directorio y buscador de tiendas en la consola (por nombre, NIT/cédula, teléfono, correo, plan o estado) y vista 360° de una tienda
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[apps/platform-console]` · `[UC-P06]`
- **Como** super admin, **quiero** buscar cualquier tienda en segundos y ver su ficha completa (plan, entitlements, sucursales, cajas con versión y último heartbeat, usuarios, facturas, pagos, avisos de mora enviados y prórrogas), **para** atender por WhatsApp o teléfono a cualquier cliente con toda la información a la vista.
```gherkin
Escenario: Búsqueda de una tienda por el número de celular del dueño
  Cuando escribo "3105551234" en el buscador de la consola
  Entonces abre la ficha 360° de la tienda correspondiente mostrando su estado de pago, sus cajas y su historial
```

### - [ ] HU-252: Editor de Planes, Add-ons, Cupones de descuento (`FUNDADORES30`) y Overrides de features por tienda en la consola
- **Meta:** `[Hito 6]` · `[P1]` · `[2 pts]` · `[apps/platform-console, services/tenant-service]` · `[Doc 10 §2, §3.5]`
- **Como** super admin, **quiero** crear cupones promocionales (ej. `30 % por 3 meses para los primeros 100 clientes`) y poder activar una función puntual en `tenant_feature_overrides` para una tienda específica, **para** manejar campañas comerciales y acuerdos especiales sin tocar código.
```gherkin
Escenario: Aplicación de cupón de descuento por 3 meses al crear o activar la suscripción
  Dado el cupón "FUNDADORES30" con "percent_off = 30" y "months = 3"
  Cuando se asigna a una tienda en el plan "TENDERO" ($34.900)
  Entonces las primeras 3 facturas mensuales se generan con descuento del 30 % y a partir del cuarto mes vuelven a $34.900
```

### - [ ] HU-253: Bandeja de Morosidad en la consola (lista priorizada de tiendas en `PAST_DUE`, `RESTRICTED` y `SUSPENDED` con botón de WhatsApp directo, pago manual y prórroga)
- **Meta:** `[Hito 6]` · `[P0]` · `[2 pts]` · `[apps/platform-console]` · `[Doc 10 §3.5]`
- **Como** super admin, **quiero** una bandeja dedicada de cobranza que me liste las tiendas con factura vencida ordenadas por días de atraso, con botones rápidos para abrir chat de WhatsApp con el dueño, registrar su pago manual o darle una prórroga, **para** gestionar la cartera del SaaS en pocos minutos al día.
```gherkin
Escenario: Gestión desde la bandeja de morosidad
  Cuando filtro la bandeja de morosidad por estado "RESTRICTED" (D+7 a D+14)
  Entonces veo cada tienda con los días de atraso, el último aviso automático enviado y los botones "Registrar pago" y "Dar prórroga"
```

### - [ ] HU-254: Visor y reprocesador de mensajes en Dead Letter Topics (`*.dlt`) desde la consola del Super Admin
- **Meta:** `[Hito 4]` · `[P1]` · `[2 pts]` · `[apps/platform-console, services/bff-platform]` · `[Doc 05 §3.2]`
- **Como** super admin / SRE, **quiero** ver en la consola cualquier mensaje que haya caído en un tópico `*.dlt`, inspeccionar su error y poder reenviarlo al tópico original tras corregir la causa, **para** operar la mensajería sin conectarme por terminal a Kafka.
```gherkin
Escenario: Reprocesamiento exitoso de un mensaje desde DLT
  Dado un mensaje en "pos.events.dlt"
  Cuando selecciono "Reintentar mensaje" en la consola
  Entonces se republica al tópico consumidor, se procesa con "inbox.once" y se marca como resuelto en la bandeja DLT
```

---

## Desglose Atómico EP-13: Pantallas y Flujos de la Edición Local en Consola y PC (HU-255 a HU-275)

### - [ ] HU-255: Módulo de Licencias de Edición Local en la consola del Super Admin (emitir serial, ver activaciones e intentos rechazados, liberar equipo dañado, revocar, renovar `updates_until` y aprobar restablecimiento de contraseña)
- **Meta:** `[Hito L]` · `[P0]` · `[3 pts]` · `[apps/platform-console, services/device-service]` · `[UC-L01..L09, Doc 10 §3.5, §4]`
- **Como** super admin, **quiero** una sección en mi consola para administrar todas las licencias de pago único (`LOCAL_ESENCIAL` y `LOCAL_PLUS`), ver desde qué IP/ciudad se activaron, ver alertas si alguien intentó usar un serial en un segundo PC, liberar la activación si al cliente se le quemó el PC (validando el tope de 2 al año) y aprobar solicitudes de restablecimiento de contraseña o restauración entre licencias, **para** operar el negocio de licencias perpetuas con control total.
```gherkin
Escenario: Liberación por soporte de una licencia cuyo computador se dañó irremediablemente
  Dado que la licencia "LOC-2026-000123" tiene "transfers_used = 0" y una activación "ACTIVE" en el PC dañado
  Cuando el super admin verifica la identidad del cliente y presiona "Liberar activación por daño de equipo"
  Entonces la activación anterior pasa a "RELEASED_BY_SUPPORT", "transfers_used" sube a 1 y el serial queda libre para activarse en el PC nuevo
```

### - [ ] HU-256: Modo de Prueba de 15 días en la Edición Local (`POST /v1/local-activation/trial`, una sola vez por huella de hardware)
- **Meta:** `[Hito L]` · `[P1]` · `[2 pts]` · `[services/device-service, apps/pos]` · `[Doc 10 §4.3]`
- **Como** tendero interesado en comprar la Edición Local, **quiero** activar en línea una prueba gratuita de 15 días (registrada por la huella de mi placa base y sistema en `local_trials` para que no se pueda reiniciar reinstalando) y al comprar ingresar mi serial conservando todos los productos y ventas que registré durante la prueba, **para** probar el programa con mis propios datos antes de pagar.
```gherkin
Escenario: Intento de pedir una segunda prueba de 15 días en el mismo computador tras reinstalar
  Dado que el computador con "machine_key = MK1" ya usó su prueba de 15 días hace un mes
  Cuando reinstala la aplicación y solicita "Iniciar prueba de 15 días"
  Entonces "POST /v1/local-activation/trial" responde "409 TRIAL_ALREADY_USED" y pide ingresar un serial de licencia
```

### - [ ] HU-257: Impresión de datos nominativos del titular de la licencia en "Acerca de", encabezados de reportes internos y pie de página en la Edición Local
- **Meta:** `[Hito L]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[Doc 10 §4.3]`
- **Como** elemento disuasivo contra la reventa pirata, **quiero** que la Edición Local muestre de forma permanente e ineditable el nombre y documento del comprador (`customer` y `doc` dentro del payload firmado de la licencia) en la barra de Administración, en la ventana "Acerca de" y en los reportes exportados, **para** que ningún tercero quiera usar una licencia a nombre de otra persona.
```gherkin
Escenario: Visualización de los datos nominativos firmados en la licencia
  Dado que la licencia firmada contiene "customer = Tienda Doña Marta" y "doc = CC 52.123.456"
  Cuando se abre el panel de Administración o se exporta un reporte en Excel/PDF
  Entonces aparece impreso "Licencia autorizada a: Tienda Doña Marta (CC 52.123.456) — ID: LOC-2026-000123"
```

---

## Desglose Atómico de Casos Borde y Tolerancia a Fallos `E01` a `E36` (Pruebas Automatizadas de Aceptación) (HU-258 a HU-275)

### - [ ] HU-258: Suite automatizada de Casos Borde de Red y Energía en Caja (`E01`, `E02`, `E03`, `E14`, `E16`, `E19`, `E20`, `E29`, `E30`)
- **Meta:** `[Hito 2 / 4]` · `[P0]` · `[5 pts]` · `[apps/pos/tests]` · `[Doc 07 §H]`
- **Como** QA de la App Instalable, **quiero** pruebas automatizadas que simulen caída de red a mitad de turno (`E01`), muerte del proceso durante `CompleteSale` (`E02`), timeout en respuesta de `/sync/push` (`E03`), disco con menos de 1 GB libre (`E14`), fallo de `integrity_check` (`E16`), impresora desconectada post-commit (`E19`), ráfaga EAN corrupta (`E20`), doble clic en cobrar (`E29`) y venta de $0 (`E30`), **para** certificar que ninguna falla física o de red corrompe la caja.
```gherkin
Escenario: Todas las pruebas de fallos locales pasan en CI antes de empaquetar el instalador
  Cuando se ejecuta "cargo test --test edge_cases_local"
  Entonces los 9 escenarios de fallo físico y de red finalizan en verde sin pérdida de transacciones confirmadas ni duplicación de consecutivos
```

### - [ ] HU-259: Suite automatizada de Casos Borde de Sincronización y Concurrencia Multi-Caja (`E04`, `E05`, `E06`, `E07`, `E17`, `E18`, `E22`, `E23`, `E24`, `E25`, `E31`, `E32`, `E33`)
- **Meta:** `[Hito 4 / 5]` · `[P0]` · `[5 pts]` · `[services/sync-service, tools/terminal-simulator]` · `[Doc 07 §H]`
- **Como** QA de plataforma, **quiero** pruebas de integración con Testcontainers que verifiquen venta simultánea de la última unidad offline (`E04`), venta con precio anterior al cambio en nube (`E05`), venta de producto borrado en nube (`E06`), exceso de cupo entre dos cajas (`E07`), hueco en `terminal_seq` (`E17`), conflicto de `payload_hash` (`E18`), cajero desactivado reconectando (`E22`), devolución cruzada antes de que llegue la venta original (`E23`), migración con outbox pendiente (`E24`), estampida de reconexión (`E25`), consumidor Kafka caído (`E31`), evento de catálogo fuera de orden (`E32`) y conflicto optimista `409` en edición de producto (`E33`), **para** garantizar que ningún caso borde de sistemas distribuidos rompa la contabilidad.
```gherkin
Escenario: Ejecución completa de la suite de casos borde distribuidos en CI
  Cuando se ejecuta "pnpm test:edge-cases"
  Entonces los 13 casos borde distribuidos pasan al 100 % manteniendo consistencia contable entre cajas y nube
```

### - [ ] HU-260: Suite automatizada de Casos Borde de Licenciamiento, Reloj, Planes y Conectividad de Frontends (`E08`, `E10`, `E11`, `E12`, `E13`, `E21`, `E28`, `E34`, `E35`, `E36`)
- **Meta:** `[Hito 5 / 6]` · `[P0]` · `[3 pts]` · `[tests/e2e]` · `[Doc 07 §H]`
- **Como** QA, **quiero** pruebas automatizadas para continuidad de consecutivo tras restaurar snapshot (`E08`), retroceso del reloj del SO (`E10`), vencimiento de gracia offline (`E11`), suspensión por mora (`E12`), revocación de equipo robado (`E13`), turno olvidado varios días (`E21`), bloqueo de downgrade con exceso de cajas (`E28`), apertura de App de Gestión sin internet (`E34`), corte de red al guardar en App de Gestión con `Idempotency-Key` (`E35`) y apertura de Reportes en caja sin internet (`E36`), **para** blindar las reglas comerciales y de seguridad del SaaS.
```gherkin
Escenario: Certificación de los 10 casos borde de gobierno y conectividad
  Cuando corre la suite E2E de licenciamiento y conectividad
  Entonces los 10 escenarios se comportan exactamente según la especificación sin permitir evasión de bloqueos ni pérdida de datos
```

---

## Desglose Atómico por Endpoint de API y Consumidor de Microservicio (HU-261 a HU-350)

### - [ ] HU-261: `tenant-service` — `POST /v1/platform/tenants` (Paso 1 de Saga: validación de documento/DV y creación de registro en `tenants` y `subscriptions`)
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/tenant-service]` · `[UC-P01]`
- **Como** `tenant-service`, **quiero** validar el documento del dueño y crear el tenant en estado `TRIAL` o `ACTIVE` junto con su suscripción inicial, **para** iniciar la saga de alta de tienda.
```gherkin
Escenario: Rechazo de creación si ya existe una tienda con el mismo documento del propietario
  Dado que ya existe un tenant con "owner_doc_type = NIT" y "owner_doc_number = 900123456"
  Cuando el super admin envía otro POST con el mismo documento
  Entonces devuelve "409 TENANT_DOCUMENT_ALREADY_EXISTS"
```

### - [ ] HU-262: `tenant-service` — Paso 2 y 3 de Saga de alta: creación de sucursal principal (`MAIN`), bodega por defecto y terminal `CAJA-01`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/tenant-service]` · `[UC-P01]`
- **Como** orquestador de la saga, **quiero** crear la sucursal `MAIN`, coordinar la creación de su bodega en `inventory-service` y de `CAJA-01` (`prefix = C01`) en `device-service`, **para** que la tienda nazca lista para enrolar su primera caja.
```gherkin
Escenario: Creación automática de CAJA-01 con prefijo C01
  Cuando la saga de alta de tienda finaliza
  Entonces existe la sucursal "MAIN", la bodega por defecto y la terminal con código "C01" en estado "PENDING_ENROLL"
```

### - [ ] HU-263: `tenant-service` — Paso 4 de Saga y compensación: creación del usuario `OWNER` en `identity-service` y disparo de enlace de activación
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/tenant-service, services/identity-service]` · `[UC-P01]`
- **Como** orquestador de la saga, **quiero** crear el usuario `OWNER` y enviar el enlace de activación, revirtiendo los pasos anteriores si `identity-service` rechaza el correo, **para** no dejar tiendas a medias.
```gherkin
Escenario: Rollback completo de la saga si falla el paso en identity-service
  Dado que el paso en "identity-service" devuelve error inesperado
  Cuando el orquestador ejecuta las compensaciones
  Entonces la terminal, la bodega, la sucursal y el tenant recién creados se marcan como eliminados/cancelados
```

### - [ ] HU-264: `tenant-service` — `GET /v1/app/branches`, `POST /v1/app/branches` y `PATCH /v1/app/branches/{id}`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/tenant-service]` · `[UC-O01]`
- **Como** dueño de tienda, **quiero** editar la dirección, teléfono y el texto de encabezado/pie del comprobante de mi sucursal y que se publique `branch.updated`, **para** actualizar los datos impresos en los recibos de mis cajas.
```gherkin
Escenario: Cambio de pie de página de comprobante llega a las cajas en el stream config
  Cuando actualizo "receipt_footer" a "¡Domicilios al 310 555 1234!"
  Entonces se publica "branch.updated" y las cajas de esa sucursal imprimen el nuevo mensaje en el siguiente recibo
```

### - [ ] HU-265: `tenant-service` — `GET /v1/app/subscription`, `POST /v1/app/subscription/change-plan` y gestión de add-ons
- **Meta:** `[Hito 6]` · `[P0]` · `[2 pts]` · `[services/tenant-service]` · `[UC-P03]`
- **Como** dueño de tienda, **quiero** consultar los detalles de mi suscripción activa y contratar o retirar add-ons (`EXTRA_TERMINAL`, `EXTRA_BRANCH`, `EXTRA_USERS_5`), **para** ajustar la capacidad de mi cuenta.
```gherkin
Escenario: Contratación de add-on EXTRA_USERS_5 amplía inmediatamente max_users en +5
  Dado una tienda en plan "NEGOCIO" ("max_users = 7")
  Cuando contrata 1 unidad de "EXTRA_USERS_5"
  Entonces "max_users" efectivo pasa a 12 inmediatamente
```

### - [ ] HU-266: `identity-service` — Integración OIDC con Keycloak/Cognito, flujo PKCE y rotación de Refresh Tokens con detección de reuso
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[services/identity-service]` · `[Doc 04 §2]`
- **Como** ingeniero de seguridad, **quiero** que cada vez que se use un `refresh_token` se invalide y emita uno nuevo, y que si alguien intenta reutilizar un `refresh_token` ya rotado se revoque toda la familia de sesiones del usuario, **para** detectar robo de tokens.
```gherkin
Escenario: Reutilización de un refresh token ya consumido revoca todas las sesiones activas del usuario
  Dado que el refresh token "RT1" ya fue canjeado por "RT2"
  Cuando un atacante intenta usar nuevamente "RT1"
  Entonces "identity-service" revoca "RT2" y todas las sesiones del usuario y registra una alerta en auditoría
```

### - [ ] HU-267: `identity-service` — `GET /v1/app/users`, `POST /v1/app/users` y `PATCH /v1/app/users/{id}`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/identity-service]` · `[UC-O04]`
- **Como** dueño de tienda, **quiero** listar, crear y editar usuarios de mi tienda asignándoles rol y sucursal (`branch_id` o todas), **para** controlar quién opera en cada local.
```gherkin
Escenario: Cajero asignado a la Sucursal 1 no se sincroniza a las cajas de la Sucursal 2
  Dado un cajero creado con "branch_id = SUCURSAL_1"
  Cuando una caja de "SUCURSAL_2" hace pull del stream "users"
  Entonces no recibe a ese cajero y este no puede iniciar sesión en "SUCURSAL_2"
```

### - [ ] HU-268: `identity-service` — `POST /v1/app/users/{id}/reset-pin` con cambio obligatorio en el primer ingreso si fue temporal
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/identity-service]` · `[UC-O04, Doc 04 §2.1]`
- **Como** administrador, **quiero** asignarle un PIN nuevo a un cajero que olvidó el suyo, hasheándolo con Argon2id y publicando `user.pin_changed`, **para** que se actualice en la caja en el siguiente pull.
```gherkin
Escenario: Reset de PIN reinicia también el contador de intentos fallidos en la caja
  Dado un cajero que estaba bloqueado por intentos fallidos
  Cuando el dueño ejecuta "POST /v1/app/users/{id}/reset-pin"
  Entonces el nuevo "pin_hash" baja a la caja y limpia "failed_pin_attempts = 0" y "locked_until = NULL"
```

### - [ ] HU-269: `identity-service` — `POST /v1/app/users/{id}/invite` para invitar a un Admin de Sucursal o Contador a la App de Gestión
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/identity-service]` · `[UC-O09]`
- **Como** dueño en plan Negocio+, **quiero** invitar por correo/WhatsApp a mi contador o administrador de sucursal para que cree su contraseña y MFA y entre a la App de Gestión con su rol, **para** delegar sin compartir mi propia cuenta de dueño.
```gherkin
Escenario: Contador invitado activa su acceso y solo tiene permisos de lectura y exportación de reportes
  Cuando el contador abre su enlace de invitación y configura su contraseña y MFA
  Entonces obtiene acceso a la App de Gestión únicamente con los permisos del rol "ACCOUNTANT"
```

### - [ ] HU-270: `device-service` — `GET /v1/app/terminals`, `POST /v1/app/terminals` y `POST /v1/app/terminals/{id}/enrollment-code`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/device-service]` · `[UC-O02]`
- **Como** dueño, **quiero** listar las cajas de mis sucursales, crear nuevas cajas dentro del cupo de mi plan y generar códigos de enrolamiento, **para** administrar mis puntos de venta.
```gherkin
Escenario: Generar un código nuevo invalida cualquier código de enrolamiento anterior no usado de esa misma caja
  Dado que "CAJA-02" tenía un código de enrolamiento generado hace 3 minutos
  Cuando genero un nuevo código para "CAJA-02"
  Entonces el código anterior queda invalidado inmediatamente
```

### - [ ] HU-271: `device-service` — `POST /v1/devices/enroll` — Verificación atómica del código, atadura de llave pública Ed25519 y emisión de licencia inicial
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[services/device-service]` · `[UC-O02]`
- **Como** `device-service`, **quiero** que el consumo del código de enrolamiento sea atómico (`UPDATE ... WHERE used_at IS NULL AND expires_at > now()`) y guarde `device_public_key` y `device_fingerprint`, **para** que sea imposible que dos equipos usen el mismo código al mismo tiempo.
```gherkin
Escenario: Dos peticiones simultáneas con el mismo código de enrolamiento solo permiten ganar a una
  Dado un código de enrolamiento válido
  Cuando dos equipos envían "POST /v1/devices/enroll" al mismo milisegundo con ese código
  Entonces exactamente uno recibe "201 Created" y el segundo recibe "409 ENROLLMENT_CODE_ALREADY_USED"
```

### - [ ] HU-272: `device-service` — `POST /v1/app/terminals/{id}/revoke` con verificación de Step-up MFA y publicación de `terminal.revoked`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/device-service]` · `[UC-O03, UC-E13]`
- **Como** dueño de tienda, **quiero** revocar una caja robada o dañada invalidando inmediatamente su capacidad de obtener tokens nuevos y marcándola para bloqueo en el siguiente heartbeat, **para** proteger mi negocio.
```gherkin
Escenario: Terminal revocada no puede obtener nuevos tokens de acceso
  Dado que "CAJA-01" fue marcada como "REVOKED"
  Cuando intenta llamar a "POST /v1/devices/token"
  Entonces recibe "403 TERMINAL_REVOKED"
```

### - [ ] HU-273: `catalog-service` — `GET/POST/PATCH/DELETE /v1/app/categories` y `/v1/app/brands` con borrado lógico (`deleted_at`) y tombstones
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/catalog-service]` · `[UC-I01]`
- **Como** administrador, **quiero** crear, renombrar y eliminar lógicamente categorías (con soporte de subcategorías `parent_id`) y marcas, propagando los *tombstones* a las cajas, **para** organizar mis productos.
```gherkin
Escenario: Borrado lógico de una categoría no elimina los productos asociados sino que los deja sin categoría
  Dado una categoría con 10 productos activos
  Cuando ejecuto "DELETE /v1/app/categories/{id}"
  Entonces la categoría recibe "deleted_at = now()", se publica el tombstone y los 10 productos siguen activos
```

### - [ ] HU-274: `catalog-service` — `GET/POST/PATCH/DELETE /v1/app/taxes` con mapeo opcional `dian_code`
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/catalog-service]` · `[Doc 06 §2]`
- **Como** administrador, **quiero** gestionar los impuestos aplicables a mis productos (porcentuales o de valor fijo por unidad), **para** mantener al día el valor anual del impuesto a las bolsas o tarifas especiales.
```gherkin
Escenario: Actualización del valor anual del impuesto a las bolsas plásticas
  Cuando actualizo la tarifa del impuesto "BOLSA" al nuevo valor anual en pesos
  Entonces se publica "catalog.tax.upserted" y todas las cajas cobran el nuevo valor por bolsa
```

### - [ ] HU-275: `catalog-service` — Presentaciones de venta y factor de conversión de unidades (venta suelta de cajetilla/cubeta/bulto)
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/catalog-service, apps/pos]` · `[Recomendación #4]`
- **Como** tendero de barrio que compra en paca/cubeta/cajetilla pero vende tanto por unidad suelta como por media cubeta o cubeta completa, **quiero** definir presentaciones vinculadas al mismo producto base con su factor de descuento de inventario (`pack_qty` en códigos y presentaciones rápidas: `Huevo Unidad = 1`, `Medio Cartón = 15`, `Cubeta = 30`), **para** llevar un solo inventario en unidades sin tener que hacer "desarmes" manuales cada rato.
```gherkin
Escenario: Venta de 1 Cubeta y de 4 Huevos sueltos descuenta del mismo stock en unidades
  Dado el producto "Huevo AA" cuyo inventario se lleva en unidades (disponibles: 90 huevos)
  Y tiene la presentación rápida "Cubeta x30" ($18.000) y "Huevo Unidad" ($700)
  Cuando se vende 1 "Cubeta x30" y 4 "Huevo Unidad"
  Entonces se descuentan "30 + 4 = 34" unidades del mismo producto "Huevo AA", quedando 56 huevos en stock
```

### - [ ] HU-276: `catalog-service` — Generador de códigos internos EAN-13 (prefijo `29`) e impresión de etiquetas de código de barras para productos propios
- **Meta:** `[Hito 5]` · `[P2]` · `[2 pts]` · `[services/catalog-service, apps/management]` · `[Recomendación #5]`
- **Como** tendero que reempaca granos, dulces o productos sin código de fábrica, **quiero** un botón "Generar código de barras interno" (EAN-13 válido con prefijo `29` sin colisión en mi tienda) y poder descargar un PDF de etiquetas para imprimir, **para** poder escanear todo en la caja.
```gherkin
Escenario: Generación automática de código EAN-13 interno con dígito de control válido
  Dado un producto nuevo que no trae código de barras de fábrica
  Cuando presiono "Generar código interno"
  Entonces el sistema asigna un EAN-13 único con prefijo "29" y su dígito verificador correcto y genera la etiqueta imprimible
```

---

## Desglose Atómico de Casos Borde Individuales (`E01` a `E36`) y Controles OWASP (HU-277 a HU-330)

### - [ ] HU-277: Caso Borde `E01` — Caída brusca de internet a mitad de turno sin interrumpir lectura de escáner ni cobro
- **Meta:** `[Hito 2 / 4]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-E01]`
- **Como** cajero, **quiero** que cuando el módem se apague a mitad de una venta no aparezca ningún modal de error ni se congele la pantalla ni un milisegundo, **para** seguir cobrando como si nada hubiera pasado.
```gherkin
Escenario: Desconexión de interfaz de red mientras se escanean productos
  Dado que el cajero está a mitad de escanear 10 productos
  Cuando se desconecta la red del sistema operativo
  Entonces los 10 productos y el cobro final terminan en menos de 100 ms y el evento queda en "outbox"
```

### - [ ] HU-278: Caso Borde `E02` — Corte de energía eléctrica durante `CompleteSale` (atomicidad WAL + `synchronous=FULL`)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/storage]` · `[UC-E02]`
- **Como** dueño de tienda, **quiero** que si se va la luz en cualquier microsegundo del cobro, al volver la energía la venta esté 100 % completa (con sus líneas, pagos, stock y outbox) o no exista en absoluto, **para** que nunca queden ventas huérfanas ni saltos de consecutivo.
```gherkin
Escenario: Inyección de fallo de escritura antes y después del COMMIT en SQLite
  Dado un test que interrumpe el proceso justo antes del COMMIT de "CompleteSale"
  Cuando se reabre la base de datos SQLite
  Entonces SQLite revierte la transacción incompleta y "next_receipt_number" y "next_terminal_seq" conservan su valor anterior sin huecos
```

### - [ ] HU-279: Caso Borde `E03` — Pérdida de la respuesta HTTP de `/v1/sync/push` después de que el servidor ya hizo COMMIT
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[services/sync-service, apps/pos/sync]` · `[UC-E03]`
- **Como** motor de sincronización, **quiero** que si el servidor procesó el lote pero el Wi-Fi se cayó antes de recibir el `200 OK`, en el siguiente reintento el servidor devuelva `DUPLICATE` para cada evento ya guardado y la caja los marque como `SENT`, **para** que jamás se cuente dos veces una venta, un movimiento de stock ni un cargo de fiado.
```gherkin
Escenario: Reenvío tras timeout de red no duplica ventas ni descuentos de inventario
  Dado un lote de 10 ventas que "sync-service" ya persistió pero cuya respuesta HTTP no llegó a la caja
  Cuando la caja reenvía el mismo lote de 10 ventas
  Entonces recibe "status = DUPLICATE" para las 10, las marca "SENT" y en "sales_db" e "inventory_db" solo existen 10 ventas y 10 descuentos
```

### - [ ] HU-280: Caso Borde `E04` — Dos cajas sin internet venden simultáneamente las últimas unidades del mismo producto
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[services/inventory-service]` · `[UC-E04]`
- **Como** dueño de tienda con 2 cajas, **quiero** que si ambas venden las últimas unidades estando desconectadas, la nube sume ambos descuentos negativos, deje el stock en negativo y me envíe una alerta sugiriendo conteo físico, **para** no rechazar ventas ya entregadas.
```gherkin
Escenario: Suma conmutativa de deltas lleva el stock a negativo y genera alerta
  Dado un stock inicial de 1 unidad donde Caja 1 vende 1 y Caja 2 vende 1 estando offline
  Cuando ambas sincronizan
  Entonces "on_hand" queda en -1 y se crea una fila en "rpt_inventory_alerts" con "kind = NEGATIVE"
```

### - [ ] HU-281: Caso Borde `E06` — Venta offline de un producto que fue eliminado/inactivado en la nube minutos antes
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[services/sales-service, services/inventory-service]` · `[UC-E06]`
- **Como** sistema contable, **quiero** que si una caja offline vendió un producto que el dueño acababa de borrar lógicamente (`deleted_at IS NOT NULL`) en la nube, la venta y su descuento de stock se acepten normalmente usando el snapshot de descripción y precio de la línea, **para** que ninguna venta real sea rechazada por borrar un producto.
```gherkin
Escenario: Producto con deleted_at no nulo acepta movimientos de ventas ocurridas offline
  Dado que el producto "P1" tiene "deleted_at" de las 3:00 p. m. en "catalog_db"
  Cuando llega una venta offline de "P1" ocurrida a las 3:10 p. m.
  Entonces "sales-service" e "inventory-service" aplican la venta y el movimiento sin enviarla a cuarentena
```

### - [ ] HU-282: Caso Borde `E14` — Alerta temprana de disco casi lleno (< 1 GB) y bloqueo seguro (< 100 MB) en la terminal
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos/storage]` · `[UC-E14]`
- **Como** aplicación de caja, **quiero** verificar el espacio libre en disco cada 5 minutos, ejecutar la purga de eventos `SENT` antiguos si baja de 1 GB, alertar en pantalla y en el heartbeat, y detener nuevas escrituras de forma limpia antes de que el disco llegue a 0 bytes y corrompa el sistema operativo, **para** proteger la base local.
```gherkin
Escenario: Purga automática de emergencia cuando el disco baja de 1 GB libre
  Dado que el espacio libre en la partición baja a 800 MB
  Cuando corre el monitor de disco de la caja
  Entonces purga inmediatamente los eventos "SENT" ya confirmados y muestra un aviso para liberar espacio en el PC
```

### - [ ] HU-283: Caso Borde `E17` — Recuperación automática y reconciliación manual ante hueco en `terminal_seq` (`GAP_DETECTED`)
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[services/sync-service, apps/pos/sync]` · `[UC-E17]`
- **Como** motor de sincronización, **quiero** que al recibir `409 GAP_DETECTED { expected_seq: N }` la caja busque en su `outbox` (incluidos los marcados por error como `SENT`) desde `N` y los reenvíe; y si los eventos `N..M` realmente no existen porque se restauró un backup viejo tras dañarse el disco, envíe una solicitud firmada de "Salto por pérdida declarada" que genera alerta crítica al dueño y al super admin, **para** que la caja pueda volver a sincronizar dejando constancia exacta del hueco.
```gherkin
Escenario: Reenvío automático desde expected_seq cuando el evento sí existe en la base local
  Dado que el servidor responde "409 GAP_DETECTED" con "expected_seq = 205" y la caja tiene el evento 205 en su tabla "outbox"
  Cuando la caja procesa la respuesta 409
  Entonces vuelve a poner en "PENDING" desde el 205 en adelante y los sube en orden en el siguiente lote
```

### - [ ] HU-284: Caso Borde `E22` — Cajero desactivado en la nube mientras la caja está offline y revocación inmediata al reconectar
- **Meta:** `[Hito 4]` · `[P1]` · `[2 pts]` · `[apps/pos/sync]` · `[UC-E22]`
- **Como** dueño de tienda que despidió a un cajero, **quiero** que apenas la caja tenga conexión el heartbeat obligue a ejecutar el pull de `users` (`users_version` en licencia / `pull_now: ['users']`) y si el usuario que tiene la sesión abierta en ese instante pasó a `DISABLED`, cierre su sesión de inmediato en pantalla pidiendo el PIN de otro operador activo, **para** cortar su acceso en cuanto haya red.
```gherkin
Escenario: Cierre inmediato de sesión activa cuando el pull informa que el cajero fue desactivado
  Dado que el cajero "Carlos" tiene la sesión abierta en la caja y el dueño lo desactiva en la App de Gestión
  Cuando la caja recibe el pull de "users" con "Carlos.status = DISABLED"
  Entonces bloquea inmediatamente la pantalla de la caja y no le permite volver a entrar con su PIN
```

### - [ ] HU-285: Control OWASP API1/API5 (BOLA / BFLA) — Verificación de pertenencia de `branch_id` y `terminal_id` al `tenant_id` y al alcance del usuario en cada handler
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[packages/service-kit, services/*]` · `[Doc 04 §5]`
- **Como** arquitecto de seguridad, **quiero** que además de RLS en la base de datos, un `BRANCH_ADMIN` asignado a la Sucursal 1 no pueda consultar ni modificar recursos pasando el `branch_id` de la Sucursal 2 de su misma tienda, **para** evitar escalamiento horizontal dentro del mismo tenant.
```gherkin
Escenario: Administrador de la Sucursal 1 intenta ajustar inventario de la Sucursal 2 de la misma tienda
  Dado un usuario con rol "BRANCH_ADMIN" restringido a "branch_id = B1"
  Cuando envía un ajuste de inventario indicando "branch_id = B2"
  Entonces el servicio rechaza la petición con "403 FORBIDDEN_BRANCH_SCOPE"
```

### - [ ] HU-286: Control OWASP — Certificate Pinning (SPKI de la CA intermedia + pin de respaldo) en la App Instalable y en la App de Gestión móvil
- **Meta:** `[Hito 7]` · `[P1]` · `[2 pts]` · `[apps/pos, apps/management]` · `[Doc 04 §4]`
- **Como** ingeniero de seguridad, **quiero** fijar los hashes SPKI de la cadena TLS de `api.tienditaonline.co` (con al menos un pin de respaldo) en el cliente HTTP de Rust y en el build nativo de Expo, **para** impedir ataques Man-in-the-Middle con certificados falsos instalados en el PC de la tienda.
```gherkin
Escenario: Conexión TLS interceptada por un proxy con certificado autofirmado es rechazada
  Dado un PC donde se instaló un certificado raíz de un proxy interceptor (MITM)
  Cuando la App Instalable intenta conectarse a "https://api.tienditaonline.co"
  Entonces el cliente TLS rechaza el handshake porque el SPKI no coincide con los pins autorizados
```

### - [ ] HU-287: Control de carga (*Load Shedding*) en el API Gateway: priorizar `/v1/sync/push` y `/v1/terminals/heartbeat` sobre `/v1/app/reports/*` ante saturación
- **Meta:** `[Hito 7]` · `[P1]` · `[2 pts]` · `[gateway]` · `[Doc 05 §3.2]`
- **Como** SRE, **quiero** que si la latencia o saturación supera el umbral crítico, el gateway responda `503 Service Unavailable` con `Retry-After` en las rutas de reportes y exportaciones manteniendo el 100 % de capacidad para `/v1/sync/push` y heartbeats, **para** que la recepción de ventas de las cajas tenga siempre la máxima prioridad.
```gherkin
Escenario: Priorización de ingesta de sincronización durante pico extremo
  Dado que se activa la política de load shedding por alta carga
  Cuando llegan peticiones a "/v1/sync/push" y a "/v1/app/reports/products"
  Entonces "/v1/sync/push" se procesa normalmente (200 OK) y el reporte pesado recibe "503" con "Retry-After: 30"
```

---

## Desglose Atómico de Repositorios, Migraciones y Lógica Interna por Microservicio (HU-288 a HU-345)

### - [ ] HU-288: `tenant-service` — Repositorio Drizzle de `plans`, `addons` y `coupons` con caché en memoria invalidada por evento
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/tenant-service]` · `[Doc 10 §2]`
- **Como** `tenant-service`, **quiero** consultar planes y add-ons desde caché local invalidada al editarse en la consola, **para** resolver los límites de cualquier plan en microsegundos.
```gherkin
Escenario: Invalidación de caché al actualizar el precio o límites de un plan
  Cuando el super admin actualiza un plan en "PATCH /v1/platform/plans/{code}"
  Entonces la caché de planes se refresca inmediatamente en todas las instancias de "tenant-service"
```

### - [ ] HU-289: `tenant-service` — Repositorio de `tenants`, `subscriptions` y `subscription_addons` con historial en `tenant_status_history`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/tenant-service]` · `[Doc 10 §3.2]`
- **Como** auditor de plataforma, **quiero** que todo cambio de `tenants.status` inserte automáticamente una fila en `tenant_status_history` con `from_status`, `to_status`, `reason` y `actor_id`, **para** conocer la trazabilidad completa de suspensiones y reactivaciones.
```gherkin
Escenario: Cambio de estado de ACTIVE a PAST_DUE registra fila en tenant_status_history
  Cuando el estado de una tienda cambia de "ACTIVE" a "PAST_DUE" por el job de mora
  Entonces se inserta en "tenant_status_history" con "from_status = ACTIVE", "to_status = PAST_DUE" y "reason = DUNNING"
```

### - [ ] HU-290: `tenant-service` — Generador de número consecutivo de factura de suscripción (`billing_invoices.number`) y cálculo de prorrateo en cambio de plan
- **Meta:** `[Hito 6]` · `[P0]` · `[2 pts]` · `[services/tenant-service]` · `[UC-P03, Doc 10 §3.1]`
- **Como** dueño de tienda que sube de plan a mitad de mes, **quiero** que el sistema calcule exactamente los días restantes del ciclo actual (`(precio_nuevo - precio_actual) * dias_restantes / dias_del_mes`), **para** pagar únicamente la diferencia justa.
```gherkin
Escenario: Upgrade de Tendero ($34.900) a Negocio ($79.900) faltando 15 días de un ciclo de 30 días
  Dado que faltan 15 de los 30 días del periodo ya pagado en plan "TENDERO"
  Cuando el dueño sube al plan "NEGOCIO"
  Entonces el cargo prorrateado por los 15 días restantes es exactamente $22.500
```

### - [ ] HU-291: `tenant-service` — Evaluador de fecha efectiva de corte considerando `grace_extensions` (`due_date + SUM(extra_days)`)
- **Meta:** `[Hito 6]` · `[P0]` · `[1 pt]` · `[services/tenant-service]` · `[UC-P04b]`
- **Como** motor de mora, **quiero** que los días de prórroga otorgados a una factura desplacen las fechas de paso a `RESTRICTED` y `SUSPENDED` sin alterar la fecha de corte del mes siguiente, **para** respetar la prórroga prometida al tendero.
```gherkin
Escenario: Factura con 5 días de prórroga pasa a RESTRICTED en D+12 en lugar de D+7
  Dado una factura vencida hace 8 días que tiene una prórroga activa de "extra_days = 5"
  Cuando corre "dunning-scheduler"
  Entonces la tienda permanece en "PAST_DUE" y no pasa a "RESTRICTED" sino hasta el día 12
```

### - [ ] HU-292: `identity-service` — Servicio de hashing Argon2id parametrizado (`m=64 MB, t=3, p=1`) y validador de fortaleza de PIN y contraseña
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/identity-service]` · `[Doc 04 §2.1]`
- **Como** oficial de seguridad, **quiero** que toda contraseña y todo PIN se hasheen con Argon2id y sal criptográfica única de 16 bytes, **para** que incluso ante una filtración de base de datos sea inviable revertirlos.
```gherkin
Escenario: Dos usuarios con el mismo PIN producen hashes Argon2id completamente distintos
  Cuando dos usuarios en distintas tiendas configuran el PIN "5839"
  Entonces sus columnas "pin_hash" son diferentes gracias a la sal aleatoria única
```

### - [ ] HU-293: `identity-service` — Consumidor de `tenant.entitlements_changed` y validación de `allowed_roles` y `max_users`
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/identity-service]` · `[Doc 10 §2.3]`
- **Como** `identity-service`, **quiero** actualizar mi réplica local cuando cambia el plan de una tienda y bloquear la creación de usuarios o asignación de roles fuera de `allowed_roles`, **para** hacer cumplir los límites del plan.
```gherkin
Escenario: Subir de plan Tendero a Negocio habilita inmediatamente asignar el rol SUPERVISOR
  Dado que una tienda acaba de subir de "TENDERO" a "NEGOCIO"
  Cuando "identity-service" consume "tenant.entitlements_changed"
  Entonces permite asignar el rol "SUPERVISOR" sin error
```

### - [ ] HU-294: `identity-service` — Emisor y validador de sesiones temporales de soporte JIT (`support-access`, TTL 30 min, solo lectura)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/identity-service]` · `[UC-P07]`
- **Como** agente de soporte autorizado por el dueño, **quiero** un token temporal con `actor_kind = SUPPORT`, expiración máxima de 30 minutos y bloqueo de cualquier método distinto de `GET`, **para** ayudar al cliente sin poder alterar sus datos.
```gherkin
Escenario: Token de soporte JIT expira a los 30 minutos y rechaza cualquier escritura
  Dado un token de soporte emitido con vigencia de 30 minutos
  Cuando el agente intenta hacer un "POST" o "PATCH" con ese token
  Entonces el gateway y el servicio lo rechazan con "403 READ_ONLY_SUPPORT_SESSION"
```

### - [ ] HU-295: `device-service` — Servicio de firma de licencias SaaS y licencias de Edición Local mediante AWS KMS (`Sign` / `GetPublicKey` con `Ed25519`)
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/device-service]` · `[Doc 04 §2.3, Doc 10 §4.3]`
- **Como** arquitecto de seguridad, **quiero** que `device-service` invoque la operación `Sign` de AWS KMS (nunca teniendo la llave privada en memoria ni en disco del contenedor), **para** que nadie pueda robar la llave maestra que firma licencias.
```gherkin
Escenario: Firma de licencia realizada dentro de KMS sin exportar la llave privada
  Cuando "device-service" emite un "license_token" o una licencia local
  Entonces envía el digest a AWS KMS con el "KeyId" vigente y recibe los 64 bytes de firma Ed25519
```

### - [ ] HU-296: `device-service` — Consumidor de `tenant.status_changed` y `tenant.entitlements_changed` para actualizar la licencia en el próximo heartbeat
- **Meta:** `[Hito 3 / 6]` · `[P0]` · `[2 pts]` · `[services/device-service]` · `[Doc 10 §2.3, §3.3]`
- **Como** `device-service`, **quiero** marcar las cajas de un tenant para reemisión inmediata de `license_token` apenas cambie su estado de pago o su plan, **para** que en el siguiente heartbeat (< 60 s) la caja reciba su nuevo estado (`ACTIVE` o `SUSPENDED`) y sus nuevas features.
```gherkin
Escenario: Pago de factura actualiza la licencia devuelta en el siguiente heartbeat de la caja
  Dado que "device-service" consume "tenant.status_changed" pasando a "ACTIVE"
  Cuando la caja envía su siguiente heartbeat
  Entonces la respuesta incluye un nuevo "license_token" con "status = ACTIVE" y "exp" extendido
```

### - [ ] HU-297: `catalog-service` — Creación automática del producto reservado de sistema `GENERIC_ITEM` (`track_stock = false`) en cada tienda nueva
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/catalog-service]` · `[UC-V07, HU-038]`
- **Como** `catalog-service`, **quiero** crear un producto interno reservado `SKU = __GENERIC__` con `track_stock = false` al inicializarse cada tienda, **para** que las ventas de artículos genéricos tengan siempre un `product_id` válido en `sale_lines`.
```gherkin
Escenario: El producto de sistema __GENERIC__ existe en toda tienda y no se puede borrar desde la UI
  Dado una tienda recién creada
  Cuando alguien intenta ejecutar "DELETE /v1/app/products/{id_generic}"
  Entonces el servicio responde "400 SYSTEM_PRODUCT_CANNOT_BE_DELETED"
```

### - [ ] HU-298: `catalog-service` — Consumidor de `sales.recorded` para poblar `generic_item_sales` cuando una línea usó el producto `__GENERIC__`
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/catalog-service]` · `[UC-I10, HU-082]`
- **Como** `catalog-service`, **quiero** escuchar `sales.recorded` y por cada línea cuyo `product_id` sea el de `__GENERIC__` insertar un registro `PENDING` en `generic_item_sales`, **para** alimentar la bandeja de "Productos por crear" del dueño.
```gherkin
Escenario: Línea vendida como artículo genérico aparece automáticamente en generic_item_sales
  Dado un evento "sales.recorded" que incluye una línea con el producto "__GENERIC__", descripción "Arequipe Vaso" y precio $2.800
  Cuando "catalog-service" lo consume
  Entonces crea la fila en "generic_item_sales" con "status = PENDING"
```

### - [ ] HU-299: `catalog-service` — Worker de importación masiva Excel/CSV con inserción por lotes (`unnest` / batch insert) y publicación agrupada de eventos
- **Meta:** `[Hito 3]` · `[P0]` · `[3 pts]` · `[services/catalog-service]` · `[UC-I02, HU-081]`
- **Como** `catalog-service`, **quiero** importar hasta 20.000 productos desde un archivo Excel validado en menos de 15 segundos usando inserciones por lotes y actualizando el progreso del job en Redis, **para** que la barra de progreso en la App de Gestión sea fluida.
```gherkin
Escenario: Importación de 5.000 productos respeta el límite max_products del plan
  Dado una tienda en plan "TENDERO" ("max_products = 3000") que intenta importar un Excel con 3.500 productos
  Cuando se valida el archivo antes de importar
  Entonces el servicio rechaza la importación con "403 PLAN_PRODUCT_LIMIT_EXCEEDED" indicando el máximo permitido (3.000)
```

### - [ ] HU-300: `sync-service` — Consumidores de eventos de dominio hacia `downstream_changes` con resolución del precio vigente por sucursal
- **Meta:** `[Hito 4]` · `[P0]` · `[3 pts]` · `[services/sync-service]` · `[Doc 02 §8, Doc 03 §7]`
- **Como** `sync-service`, **quiero** transformar cada cambio de producto, código de barras, precio por sucursal, impuesto, promoción, usuario, cliente, saldo de cartera y nivel de stock en filas listas para descargar en `downstream_changes`, **para** que el endpoint `/v1/sync/pull` sea una simple lectura secuencial por índice.
```gherkin
Escenario: Precio específico de la Sucursal 2 solo se envía en el stream prices de la Sucursal 2
  Dado que se actualiza un registro en "branch_prices" para "branch_id = B2"
  Cuando "sync-service" proyecta el evento en "downstream_changes"
  Entonces guarda la fila con "branch_id = B2" para que solo la descarguen las cajas de "B2"
```

### - [ ] HU-301: `sales-service` — Endpoint interno y de BFF `GET /v1/pos-reports/receipts/lookup` para buscar comprobantes de otra caja al hacer una devolución
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/sales-service, services/bff-pos]` · `[UC-V14, Doc 08 §2]`
- **Como** caja POS con conexión a internet, **quiero** buscar el comprobante `C02-000105` emitido en otra caja de mi tienda y obtener sus líneas y cantidades ya devueltas, **para** hacer una devolución exacta aunque la venta se haya hecho en la caja de al lado.
```gherkin
Escenario: Consulta online de comprobante emitido en otra caja de la misma tienda
  Dado que la venta "C02-000105" ya fue sincronizada a "sales-service"
  Cuando "CAJA-01" consulta "GET /v1/pos-reports/receipts/lookup?prefix=C02&number=105"
  Entonces recibe el detalle de la venta y las unidades disponibles para devolución por cada línea
```

### - [ ] HU-302: `cash-service` — Consumidor de `sale.completed`, `sale.voided`, `sale.returned` y `credit.payment.received` para alimentar `cash_movements` en nube
- **Meta:** `[Hito 4]` · `[P0]` · `[2 pts]` · `[services/cash-service]` · `[Doc 02, Doc 07 §C]`
- **Como** `cash-service`, **quiero** registrar cada pago o vuelta en efectivo de una venta, devolución o abono dentro de los movimientos del turno correspondiente en la nube, **para** recalcular `server_expected_cash` de forma independiente a lo que declaró la caja.
```gherkin
Escenario: Detección de discrepancia si expected_cash reportado por la caja no coincide con server_expected_cash
  Dado que las ventas en efectivo recibidas por la nube suman un esperado de $300.000
  Cuando llega "cash.session.closed" donde la caja reportó "expected_cash = $280.000"
  Entonces "cash-service" guarda ambos valores y emite una alerta de integridad en auditoría
```

### - [ ] HU-303: `inventory-service` — Consumidor de `sale.completed` que ignora productos con `track_stock = false` (como bolsas o servicios/genéricos)
- **Meta:** `[Hito 4]` · `[P0]` · `[1 pt]` · `[services/inventory-service]` · `[Doc 02]`
- **Como** `inventory-service`, **quiero** omitir la creación de movimientos de stock para productos marcados con `track_stock = false`, **para** no generar alertas de stock negativo en artículos genéricos o servicios.
```gherkin
Escenario: Venta de artículo genérico con track_stock = false no altera stock_levels
  Cuando "inventory-service" procesa una línea cuyo producto tiene "track_stock = false"
  Entonces no inserta movimiento en "stock_movements" ni genera alerta de stock negativo
```

### - [ ] HU-304: `inventory-service` — Vinculación de recepción de mercancía con pago en efectivo salido de la caja (`paid_from_cash_session`)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/inventory-service, services/cash-service]` · `[UC-C03, UC-I04]`
- **Como** dueño de tienda, **quiero** enlazar la entrada de mercancía del proveedor con la salida de efectivo `SUPPLIER_PAYMENT` que registró el cajero en su turno, **para** verificar que el dinero que salió del cajón corresponde realmente a mercancía que entró al inventario.
```gherkin
Escenario: Enlace entre salida de efectivo de caja y factura de recepción de mercancía
  Dado que el cajero registró una salida "SUPPLIER_PAYMENT" de $85.000 en el turno "S1"
  Cuando el dueño registra la recepción de mercancía de "Panadería El Trigo" por $85.000 y selecciona ese pago de caja
  Entonces ambos registros quedan enlazados evitando salidas de efectivo por "pago a proveedor" sin mercancía recibida
```

### - [ ] HU-305: `customer-service` — Modo de cupo `ALLOCATED`: reparto automático del cupo disponible entre las cajas activas de la tienda y rebalanceo al sincronizar
- **Meta:** `[Hito 6]` · `[P2]` · `[3 pts]` · `[services/customer-service, services/sync-service]` · `[Doc 03 §6]`
- **Como** dueño en plan Negocio+ que elige el modo `ALLOCATED`, **quiero** que si un cliente tiene $300.000 de cupo disponible y tengo 3 cajas activas, cada caja reciba un tope local de $100.000 y se rebalancee al sincronizar, **para** que matemáticamente sea imposible que entre las 3 cajas desconectadas superen los $300.000 sin permiso.
```gherkin
Escenario: División del cupo disponible entre el número de cajas activas
  Dado un cliente con cupo disponible de $300.000 en una tienda con 3 cajas activas y modo "ALLOCATED"
  Cuando las cajas descargan el stream "customer_balances"
  Entonces cada caja recibe un cupo asignado local de $100.000 para ese cliente
```

### - [ ] HU-306: `notification-service` — Adaptadores con Circuit Breaker y proveedor de respaldo para Email (SES), SMS, WhatsApp (Meta Cloud API) y Push (Expo/FCM)
- **Meta:** `[Hito 5]` · `[P0]` · `[3 pts]` · `[services/notification-service]` · `[Doc 05 §3.1]`
- **Como** `notification-service`, **quiero** encapsular cada proveedor externo en un adaptador con su propio circuit breaker y cola de reintento, **para** que una caída de Meta/WhatsApp o de SES nunca bloquee el consumo de eventos ni afecte los demás canales.
```gherkin
Escenario: Apertura del circuit breaker de WhatsApp redirige avisos urgentes al canal de respaldo (SMS/Email)
  Dado que la API de WhatsApp falla 5 veces seguidas y su circuit breaker pasa a "ABIERTO"
  Cuando se debe enviar un aviso crítico de mora o seguridad
  Entonces queda encolado para reintento en WhatsApp y se despacha inmediatamente por Correo/Push
```

---

## Desglose Atómico de la Edición Local: Pantallas, Comandos Rust y Respaldos (HU-307 a HU-350)

### - [ ] HU-307: Extractor de huella de hardware en Rust para Windows (`CPU ID`, `BaseBoard Serial`, `Disk Serial`, `MachineGuid`, `MAC física`) hasheados con SHA-256 + sal fija
- **Meta:** `[Hito L]` · `[P0]` · `[2 pts]` · `[apps/pos/security]` · `[Doc 10 §4.3]`
- **Como** módulo de licencia local, **quiero** leer los 5 identificadores físicos del equipo y hashearlos antes de enviarlos o compararlos, **para** construir la huella tolerante (3 de 5) sin enviar números de serie crudos del hardware.
```gherkin
Escenario: Comparador 3 de 5 aprueba cuando coinciden al menos 3 componentes
  Dado una licencia emitida con los hashes "{ cpu: A, board: B, disk: C, os_guid: D, mac: E }"
  Cuando el equipo actual produce "{ cpu: A, board: B, disk: X, os_guid: D, mac: Y }" (3 coincidencias)
  Entonces la función "matches_machine_tolerance" retorna "true (3/5)"
```

### - [ ] HU-308: Pantalla de Activación Inicial de la Edición Local (ingresar serial, botón "Iniciar prueba de 15 días" y guía visual para compartir internet del celular)
- **Meta:** `[Hito L]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-L02, Doc 10 §4.3]`
- **Como** comprador de la Edición Local cuyo PC de tienda no tiene cable de red, **quiero** una pantalla de activación clara que formatee automáticamente los guiones del serial (`TDL-XXXXX-...`) y me muestre con dibujos cómo compartir internet desde mi celular por USB o Wi-Fi solo por 1 minuto para activar, **para** activar mi licencia sin complicaciones.
```gherkin
Escenario: Activación con serial formatea el texto y muestra confirmación perpetua
  Cuando pego o escribo el serial de 20 caracteres y presiono "Activar ahora"
  Entonces se conecta a "/v1/local-activation/activate", guarda la licencia en "local_license" y muestra "¡Licencia activada a nombre de Tienda Doña Marta! Ya puedes desconectar el internet"
```

### - [ ] HU-309: Autenticación del modo Administración Local con contraseña Argon2id y bloqueo progresivo en `local_admin`
- **Meta:** `[Hito L]` · `[P0]` · `[2 pts]` · `[apps/pos/security]` · `[UC-L04, Doc 10 §4.2]`
- **Como** dueño de la Edición Local, **quiero** que al pulsar "Administración" me pida mi contraseña y tras 5 intentos fallidos se bloquee por 5 minutos crecientes registrando el intento en `local_audit`, **para** que el cajero no pueda adivinar mi clave de administrador.
```gherkin
Escenario: Bloqueo de acceso a Administración Local tras 5 contraseñas incorrectas
  Dado que un usuario ingresa 5 veces seguidas una contraseña errónea en el modal de Administración
  Cuando intenta una sexta vez dentro de los 5 minutos siguientes
  Entonces el núcleo Rust rechaza el intento indicando el tiempo restante de bloqueo
```

### - [ ] HU-310: Reimpresión y verificación del Código de Recuperación desde Administración Local (exigiendo volver a digitar la contraseña actual)
- **Meta:** `[Hito L]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[Doc 10 §4.5.3]`
- **Como** dueño de la Edición Local que perdió el papel donde anotó su código de recuperación pero sí recuerda su contraseña de administrador, **quiero** poder generar un nuevo Código de Recuperación desde Administración (re-cifrando la copia automática actual), **para** no quedarme sin código para mis futuros respaldos `.tdbak`.
```gherkin
Escenario: Regeneración de código de recuperación exige la contraseña actual del administrador
  Dado que el dueño está dentro de Administración Local
  Cuando solicita "Generar nuevo código de recuperación" y confirma su contraseña actual
  Entonces se genera e imprime un nuevo código de 16 caracteres, se actualiza "recovery_hash" y se genera un respaldo ".tdbak" nuevo con ese código
```

### - [ ] HU-311: Implementación de `LocalSqliteDataProvider` en Rust/TS para que `packages/admin-ui` opere sobre las tablas locales sin red
- **Meta:** `[Hito L]` · `[P0]` · `[5 pts]` · `[packages/admin-ui, apps/pos]` · `[Doc 10 §4.2, §4.9]`
- **Como** arquitecto frontend, **quiero** que todos los componentes de `packages/admin-ui` (Catálogo, Precios, Proveedores, Recepciones, Ajustes, Conteos, Usuarios/PIN, Clientes/Cupos) consuman una interfaz `AdminDataProvider` que en la App de Gestión llama a `bff-app` y en la Edición Local invoca comandos IPC sobre SQLite, **para** mantener una sola interfaz de administración para ambos productos.
```gherkin
Escenario: Creación de producto y recepción de compra en Edición Local actualiza stock_levels en SQLite
  Dado la Edición Local operando sin tarjeta de red
  Cuando el administrador crea un producto y registra una compra de 24 unidades en el panel de Administración
  Entonces "stock_levels.on_hand_milli" en SQLite pasa a 24.000 y el producto queda disponible inmediatamente en el modo Caja
```

### - [ ] HU-312: Consultas SQL locales de Reportes en la Edición Local (Ventas del día/mes, por hora, por medio de pago, top productos, rentabilidad, turnos, cartera y auditoría)
- **Meta:** `[Hito L]` · `[P0]` · `[3 pts]` · `[apps/pos/storage]` · `[Doc 10 §4.9]`
- **Como** dueño de la Edición Local, **quiero** ver en el computador exactamente los mismos gráficos y tablas de reportes (y exportarlos a Excel en una carpeta o USB en `LOCAL_PLUS`), calculados directamente sobre SQLite, **para** analizar mi negocio sin internet.
```gherkin
Escenario: Exportación a archivo Excel local desde el computador en edición LOCAL_PLUS
  Dado una licencia "LOCAL_PLUS" con la feature "export"
  Cuando en el reporte de ventas del mes presiono "Exportar a Excel"
  Entonces se abre el diálogo para guardar el archivo ".xlsx" en el disco o memoria USB sin usar internet
```

### - [ ] HU-313: Empaquetador y cifrador del archivo `.tdbak` en Rust (`manifest.json` + SQLite Online Backup + AES-256-GCM + verificación de relectura)
- **Meta:** `[Hito L]` · `[P0]` · `[3 pts]` · `[apps/pos/storage]` · `[Doc 10 §4.5.1, HU-125]`
- **Como** núcleo Rust de la Edición Local, **quiero** empaquetar `manifest.json` (con conteos de productos, clientes, ventas, fecha de última venta, `license_id`, `schema_version` y `sha256`) junto con la copia consistente de SQLite, cifrarlo con AES-256-GCM usando Argon2id sobre el código de recuperación y verificarlo releyéndolo del disco destino, **para** garantizar que ningún `.tdbak` quede corrupto o ilegible.
```gherkin
Escenario: Detección de escritura incompleta si el usuario retira la USB antes de tiempo
  Dado que se está escribiendo el archivo ".tdbak" en una memoria USB
  Cuando la verificación de relectura posterior detecta que el archivo no se puede leer o su hash no coincide
  Entonces muestra error "El respaldo no se guardó correctamente en la USB; vuelve a intentarlo" y NO marca el respaldo como verificado
```

### - [ ] HU-314: Bloqueo de ventas en el PC antiguo cuando `device_transfer.state` es `PENDING_RELEASE` o `TRANSFERRED` (con opción de cancelar antes de activar el PC nuevo)
- **Meta:** `[Hito L]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[Doc 10 §4.5.2, HU-126]`
- **Como** dueño que ejecutó la "Solicitud de cambio de equipo", **quiero** que el computador viejo quede en modo solo lectura (`TRANSFERRED`) para que ningún cajero registre ventas allí después de haber sacado el archivo `.tdbak` (pero permitiéndome revertir el traslado si todavía no he activado el PC nuevo), **para** que nunca queden ventas divididas entre dos computadores.
```gherkin
Escenario: Intento de vender en el PC viejo después de generar el respaldo de cambio de equipo
  Dado que "device_transfer.state" en el PC viejo es "TRANSFERRED"
  Cuando un cajero intenta abrir turno o registrar una venta
  Entonces el sistema lo impide mostrando "Este equipo fue trasladado a otro computador; solo puedes consultar o volver a descargar el respaldo .tdbak"
```

### - [ ] HU-315: Asistente de exportación de la Edición Local hacia TienditaOnline Cloud (`UC-L10`) e importador en la Consola del Super Admin
- **Meta:** `[Hito L]` · `[P2]` · `[3 pts]` · `[apps/pos, apps/platform-console]` · `[UC-L10, Doc 10 §4.7]`
- **Como** cliente de la Edición Local que creció y contrató un plan en la nube, **quiero** generar un paquete de migración y que el super admin lo importe en mi nueva tienda SaaS conservando todos mis productos, códigos, clientes, saldos de fiado e inventario actual, **para** pasarme a la nube sin empezar de cero.
```gherkin
Escenario: Importación de paquete de Edición Local en una tienda SaaS nueva
  Dado un archivo de migración generado desde la Edición Local con 1.200 productos y 40 clientes con saldo de fiado
  Cuando el super admin lo importa en la tienda SaaS recién creada
  Entonces los 1.200 productos, sus existencias y los 40 clientes con sus saldos quedan cargados en los microservicios correspondientes y la licencia local pasa a "MIGRATED_TO_CLOUD"
```

---

## Desglose Atómico de BFFs (`bff-app`, `bff-pos`, `bff-platform`), Agregación, Caché y Resiliencia (HU-316 a HU-350)

### - [ ] HU-316: `bff-app` — Agregador de vista inicial de sesión (`/v1/app/bootstrap`: perfil del usuario, permisos, tienda, plan, estado de mora y sucursales)
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/bff-app]` · `[Doc 01 §6]`
- **Como** App de Gestión, **quiero** una única llamada inicial al abrir la app que devuelva el usuario, sus permisos efectivos, el estado de la tienda (`ACTIVE`, `PAST_DUE`, `RESTRICTED`), el uso de cupos del plan y la lista de sucursales, **para** renderizar el menú y los banners de estado sin hacer 5 llamadas separadas.
```gherkin
Escenario: Carga de contexto completo de sesión en una sola petición
  Cuando la App de Gestión llama a "GET /v1/app/bootstrap" tras iniciar sesión
  Entonces "bff-app" consulta en paralelo con circuit breakers a "tenant-service" e "identity-service" y responde en menos de 120 ms
```

### - [ ] HU-317: `bff-app` — Degradación parcial por widget cuando un microservicio secundario tiene el circuit breaker abierto
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/bff-app]` · `[Doc 05 §3.1]`
- **Como** dueño de tienda, **quiero** que si un servicio secundario falla temporalmente, el resto de la App de Gestión siga funcionando y solo la tarjeta afectada muestre "En actualización — Reintentar", **para** que un fallo aislado no tumbe toda la aplicación.
```gherkin
Escenario: Falla de audit-service no impide usar Catálogo, Inventario ni el Dashboard de ventas
  Dado que el circuit breaker hacia "audit-service" está en estado "ABIERTO"
  Cuando el dueño navega por "Catálogo", "Inventario" y "Dashboard" en la App de Gestión
  Entonces todas las pantallas cargan y guardan normalmente y solo la pestaña "Auditoría" informa indisponibilidad temporal
```

### - [ ] HU-318: `bff-app` — Caché corta en Redis (TTL 15–60 s) para consultas de reportes con invalidación al recibir eventos de venta o catálogo
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/bff-app]` · `[Doc 01 §7]`
- **Como** `bff-app`, **quiero** cachear en Redis por `tenant_id + query_hash` las respuestas de reportes frecuentes e invalidar la llave del día actual cuando llega `sales.recorded`, **para** absorber refrescos repetidos del dueño en su celular sin golpear la base de datos.
```gherkin
Escenario: Invalidación automática de la caché del día cuando llega una nueva venta
  Dado que la respuesta de "/v1/app/reports/dashboard" está en Redis para "tenant_A"
  Cuando se publica "sales.recorded" para "tenant_A"
  Entonces la clave de caché del día actual se invalida y la siguiente lectura trae el total actualizado
```

### - [ ] HU-319: `bff-app` — Emisor de eventos `*.admin_action` hacia `audit-service` en toda escritura administrativa
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/bff-app, services/bff-platform]` · `[Doc 04 §8]`
- **Como** auditor, **quiero** que un interceptor en `bff-app` y `bff-platform` publique un evento de auditoría con `actor_id`, `ip`, `action`, `entity_type`, `entity_id` y el diff antes/después en cada `POST`/`PATCH`/`DELETE` exitoso, **para** auditar cambios hechos desde la web o el celular igual que los de la caja.
```gherkin
Escenario: Cambio de precio en la App de Gestión queda registrado en audit_log con valor anterior y nuevo
  Dado un producto con precio anterior de $2.500
  Cuando el dueño cambia el precio a $2.800 en la App de Gestión
  Entonces "audit_log" recibe un registro con "action = catalog.price.updated" y "data = { old: 2500, new: 2800 }"
```

### - [ ] HU-320: `bff-pos` — Verificación combinada de Token de Dispositivo (`pos-device`) + PIN del usuario solicitante para `/v1/pos-reports/*`
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/bff-pos]` · `[Doc 04 §2, Doc 08 §0]`
- **Como** `bff-pos`, **quiero** exigir que toda consulta a `/v1/pos-reports/*` venga de una caja activa enrolada, pertenezca únicamente a la `branch_id` de esa caja y el usuario activo tenga permiso `reports.view`, **para** que desde una caja de la Sucursal 1 jamás se puedan consultar los reportes de la Sucursal 2.
```gherkin
Escenario: Forzado automático del filtro branch_id según el claim del token de la caja
  Dado una petición a "/v1/pos-reports/sales" desde "CAJA-01" (que pertenece a "branch_id = B1") intentando pasar "?branch_id=B2"
  Cuando "bff-pos" procesa la solicitud
  Entonces ignora el parámetro "B2" y consulta exclusivamente "branch_id = B1"
```

---

## Desglose Atómico de Micro-Interacciones, Validaciones y Vistas UI (HU-321 a HU-385)

### - [ ] HU-321: Formateador e input de moneda en Pesos Colombianos (`$ 12.500`) con separador de miles en todos los formularios
- **Meta:** `[Hito 2 / 3]` · `[P0]` · `[1 pt]` · `[packages/ui-reports, apps/pos, apps/management]` · `[UX Colombia]`
- **Como** tendero colombiano, **quiero** que mientras escribo un precio o un monto en efectivo el campo muestre automáticamente los puntos de miles (`$ 50.000`) sin decimales innecesarios y convierta internamente a centavos enteros, **para** no confundir `$5.000` con `$50.000`.
```gherkin
Escenario: Formateo en vivo con puntos de miles al digitar un monto en pesos
  Cuando escribo los dígitos "50000" en cualquier campo de precio o efectivo recibido
  Entonces el input muestra "$ 50.000" en pantalla y entrega el entero "5000000" (en centavos) al comando de negocio
```

### - [ ] HU-322: Sonidos diferenciados en la caja para lectura exitosa (*beep* corto agudo) y lectura con error / producto no encontrado (*tono grave doble*)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-V01, UC-E20]`
- **Como** cajero que mira las bolsas mientras pasa productos por el lector, **quiero** que la caja emita un sonido distinto e inconfundible cuando un producto no existe o hay un error, **para** darme cuenta sin tener que mirar el monitor en cada código.
```gherkin
Escenario: Alerta sonora inmediata al escanear un código desconocido
  Dado que los sonidos de caja están habilitados
  Cuando escaneo un código que no existe en la base local
  Entonces suena el tono grave de error y se abre el modal de "Producto no encontrado / Vender como genérico"
```

### - [ ] HU-323: Edición rápida en línea de cantidad (`+`, `-`, o clic sobre el número) y nota por línea en el carrito de la caja
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-V01]`
- **Como** cajero, **quiero** aumentar o disminuir la cantidad de cualquier fila del carrito con un clic o con las teclas `+` y `-`, **para** corregir cantidades sin borrar y volver a escanear.
```gherkin
Escenario: Disminuir cantidad de 1 unidad pregunta si desea eliminar el ítem (con auditoría)
  Dado una línea en el carrito con cantidad 1
  Cuando presiono "-" sobre esa línea
  Entonces pregunta si deseo quitar el ítem del carrito y al confirmar registra el evento de auditoría correspondiente
```

### - [ ] HU-324: Selector rápido de cliente frecuente en el carrito (`F4`) mostrando alerta si tiene deuda vencida o cupo bloqueado
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-V04, UC-K04]`
- **Como** cajero, **quiero** que al seleccionar a un cliente en la caja me muestre en color rojo si tiene el crédito bloqueado o cuánto debe actualmente, **para** informarle amablemente o recibirle un abono en el mismo momento.
```gherkin
Escenario: Aviso visual al seleccionar un cliente con crédito bloqueado por mora
  Dado que "Don Pedro" tiene "credit_enabled = false" y saldo pendiente de $80.000
  Cuando lo selecciono en la caja con "F4"
  Entonces muestra la etiqueta roja "Fiado bloqueado — Saldo pendiente: $ 80.000 (Solo venta de contado o abono)"
```

### - [ ] HU-325: Cobro combinado "Venta + Abono a deuda anterior en una sola entrega de dinero" en la caja
- **Meta:** `[Hito 2]` · `[P1]` · `[2 pts]` · `[apps/pos]` · `[UC-V01, UC-K03]`
- **Como** tendero cuando un vecino lleva un mercado de $12.000, me entrega un billete de $50.000 y me dice *"cóbrese lo de hoy y abóneme $20.000 a la cuenta"*, **quiero** registrar la venta de $12.000 + el abono de $20.000 y saber que debo devolverle $18.000 de cambio, **para** atender el caso más común del fiado de barrio en un solo paso.
```gherkin
Escenario: Venta de contado más abono a cartera con un mismo billete de $50.000
  Dado que "Doña Marta" lleva hoy $12.000 de contado, desea abonar $20.000 a su deuda y entrega un billete de $50.000
  Cuando el cajero activa "Agregar abono a la cuenta ($20.000)" en el modal de cobro
  Entonces el total a recibir es $32.000, el cambio a devolver es $18.000 y se registran tanto la venta como el abono de cartera
```

### - [ ] HU-326: Vista de "Detalle del Turno Actual" en la caja (para el cajero: solo sus movimientos y conteo de ventas sin mostrar el efectivo teórico esperado)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-C05, UC-R00]`
- **Como** dueño de tienda, **quiero** que durante el turno el cajero pueda ver la lista de los gastos/salidas que ha registrado y sus ventas para reimprimir tiquetes, pero **sin mostrar la suma de efectivo en gaveta**, **para** que no pueda calcular el esperado antes del arqueo ciego.
```gherkin
Escenario: Pantalla de turno actual oculta la suma de efectivo esperado al rol CASHIER
  Dado un usuario con rol "CASHIER" en un turno abierto
  Cuando abre la pestaña "Mi turno"
  Entonces ve la hora de apertura, la base inicial y el listado de movimientos, pero el total de "Efectivo esperado en caja" solo es visible si un usuario con permiso "cash.session.view_expected" ingresa su PIN
```

### - [ ] HU-327: Envío digital del comprobante por WhatsApp o correo electrónico al sincronizar la venta (`UC-V17`)
- **Meta:** `[Hito 5]` · `[P2]` · `[2 pts]` · `[apps/pos, services/notification-service]` · `[UC-V17]`
- **Como** cliente que prefiere el recibo en su celular (o cuando la impresora se quedó sin papel), **quiero** que el cajero marque "Enviar comprobante al celular/correo del cliente" y que apenas la caja sincronice la venta me llegue el resumen de mi compra, **para** ahorrar papel y tener copia digital.
```gherkin
Escenario: Envío automático del comprobante digital al procesarse sale.completed en la nube
  Dado una venta donde el cliente "Doña Marta" (con consentimiento de datos) solicitó comprobante digital
  Cuando la venta se sincroniza y se publica "sales.recorded" con "send_digital_receipt = true"
  Entonces "notification-service" le envía el detalle del comprobante al canal registrado
```

### - [ ] HU-328: Escáner continuo con cámara en la App de Gestión móvil (modo ráfaga con vibración háptica al leer cada código)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/management]` · `[UC-I04, UC-I06]`
- **Como** tendero haciendo inventario o recibiendo un pedido con mi celular, **quiero** que la cámara no se cierre después de leer un código sino que vibre, sume `+1` al producto leído y siga abierta para escanear el siguiente, **para** contar un estante entero sin tocar la pantalla entre producto y producto.
```gherkin
Escenario: Modo ráfaga en conteo físico suma +1 en cada lectura con pausa anti-rebote de 1.2 segundos
  Dado que activo "Escaneo continuo" en la pantalla de conteo físico del celular
  Cuando paso 5 latas de atún frente a la cámara una tras otra
  Entonces el celular vibra en cada lectura y acumula 5 unidades de "Atún Lata" sin cerrar el visor de la cámara
```

### - [ ] HU-329: Descarga de plantilla Excel de ejemplo e instrucciones dentro de la pantalla de Importación de Productos en la App de Gestión y Edición Local
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[packages/admin-ui]` · `[UC-I02]`
- **Como** dueño de tienda, **quiero** un botón "Descargar plantilla Excel de ejemplo" con las columnas exactas (`Código de barras`, `Nombre`, `Categoría`, `Costo`, `Precio de venta`, `Impuesto`, `Existencia inicial`) y 5 filas de ejemplo, **para** llenarla sin equivocarme en los nombres de las columnas.
```gherkin
Escenario: Descarga de plantilla Excel lista para diligenciar
  Cuando hago clic en "Descargar plantilla Excel" en la pantalla de importación
  Entonces se descarga el archivo "Plantilla_Productos_TienditaOnline.xlsx" con validaciones de lista desplegable en la columna de Impuesto
```

### - [ ] HU-330: Alerta y bloqueo de cierre de pestaña o ventana cuando hay cambios sin guardar en formularios de la App de Gestión
- **Meta:** `[Hito 3]` · `[P2]` · `[1 pt]` · `[packages/admin-ui]` · `[UX]`
- **Como** administrador que está llenando una recepción de 30 productos, **quiero** que si presiono "Atrás" o intento cerrar la pestaña por accidente la aplicación me pregunte "¿Salir sin guardar los cambios?", **para** no perder media hora de digitación.
```gherkin
Escenario: Confirmación antes de abandonar un formulario con cambios pendientes
  Dado un formulario de recepción de mercancía con 5 líneas agregadas sin guardar
  Cuando el usuario intenta navegar hacia otra pantalla
  Entonces aparece el diálogo de confirmación impidiendo perder los datos por accidente
```

---

## Desglose Atómico de Pruebas de Integración, Contratos Pact, Infraestructura y Seguridad (HU-331 a HU-418)

### - [ ] HU-331: Suite de pruebas de integración con Testcontainers para `tenant-service` (saga de alta, planes, add-ons, mora, prórrogas y RLS)
- **Meta:** `[Hito 3 / 6]` · `[P0]` · `[2 pts]` · `[services/tenant-service/test]` · `[DoD]`
- **Como** desarrollador backend, **quiero** pruebas automatizadas contra PostgreSQL 16 y Redpanda reales en Testcontainers para todos los casos de `tenant-service`, **para** validar RLS y el calendario de mora antes de desplegar.
```gherkin
Escenario: Cobertura >= 80 % y aislamiento RLS verificado en tenant-service
  Cuando ejecuto "pnpm --filter tenant-service test:integration"
  Entonces todas las pruebas de saga, planes, facturación, dunning y aislamiento entre tenants pasan en verde
```

### - [ ] HU-332: Suite de pruebas de integración con Testcontainers para `identity-service` (OIDC, MFA, Argon2id, roles por plan y RLS)
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/identity-service/test]` · `[DoD]`
- **Como** desarrollador backend, **quiero** probar en Testcontainers la creación de usuarios, activación de cuenta, reseteo de PIN, límites de plan y aislamiento de membresías, **para** blindar la autenticación y autorización.
```gherkin
Escenario: Ejecución de pruebas de integración de identity-service
  Cuando ejecuto "pnpm --filter identity-service test:integration"
  Entonces se verifican todos los permisos sembrados y el rechazo de roles no permitidos por el plan
```

### - [ ] HU-333: Suite de pruebas de integración con Testcontainers para `device-service` (enrolamiento concurrente, licencias KMS mock, heartbeat y licencias locales)
- **Meta:** `[Hito 3 / L]` · `[P0]` · `[2 pts]` · `[services/device-service/test]` · `[DoD]`
- **Como** desarrollador backend, **quiero** probar en Testcontainers el enrolamiento de cajas, la revocación remota y todo el ciclo de licencias perpetuas de la Edición Local (activación, bloqueo en segundo PC, huella 3/5, cambio de equipo y restablecimiento), **para** evitar fallos en licenciamiento.
```gherkin
Escenario: Ejecución de pruebas de integración de device-service
  Cuando ejecuto "pnpm --filter device-service test:integration"
  Entonces pasan todos los escenarios de cajas SaaS y de licencias de Edición Local
```

### - [ ] HU-334: Suite de pruebas de integración con Testcontainers para `catalog-service` (CRUD, control optimista `409`, códigos únicos, precios programados, importación y genéricos)
- **Meta:** `[Hito 3 / 5]` · `[P0]` · `[2 pts]` · `[services/catalog-service/test]` · `[DoD]`
- **Como** desarrollador backend, **quiero** probar en Testcontainers todas las reglas del catálogo y su aislamiento RLS, **para** asegurar que ningún cambio rompa la distribución de precios o productos.
```gherkin
Escenario: Ejecución de pruebas de integración de catalog-service
  Cuando ejecuto "pnpm --filter catalog-service test:integration"
  Entonces pasan las pruebas de concurrencia optimista, unicidad de códigos de barras e importación masiva
```

### - [ ] HU-335: Suite de pruebas de integración con Testcontainers para `sync-service` (push idempotente, `GAP_DETECTED`, conflicto de hash, `downstream_changes` y pull `xid8`)
- **Meta:** `[Hito 4]` · `[P0]` · `[3 pts]` · `[services/sync-service/test]` · `[DoD]`
- **Como** desarrollador backend, **quiero** probar con transacciones concurrentes reales en PostgreSQL 16 que el cursor `xid8` con `pg_snapshot_xmin` jamás pierda ni una sola fila modificada, **para** certificar el motor de sincronización.
```gherkin
Escenario: Prueba de estrés de transacciones concurrentes durante lecturas de pull por xid8
  Dado un test que lanza 50 escrituras concurrentes de longitud variable en "downstream_changes" mientras un cliente hace pulls sucesivos
  Cuando finalizan todas las transacciones y el último pull
  Entonces el cliente ha recibido exactamente el 100 % de los cambios sin omitir ninguno
```

### - [ ] HU-336: Suite de pruebas de integración con Testcontainers para `sales-service`, `cash-service`, `inventory-service`, `customer-service`, `reporting-service`, `audit-service` y `notification-service`
- **Meta:** `[Hito 4 / 5]` · `[P0]` · `[5 pts]` · `[services/*/test]` · `[DoD]`
- **Como** equipo backend, **quiero** que cada uno de los 7 servicios consumidores tenga su suite de Testcontainers verificando `inbox.once`, idempotencia ante reentrega de Kafka, proyecciones y RLS, **para** cumplir el DoD en todos los microservicios.
```gherkin
Escenario: Reentrega triple de cada evento de pos.events en los 7 servicios consumidores
  Cuando el test de integración envía 3 veces el mismo evento a cada consumidor
  Entonces el efecto en base de datos en los 7 servicios es idéntico a haberlo enviado 1 sola vez
```

### - [ ] HU-337: Pruebas de contrato Pact (`Consumer-Driven Contracts`) entre `bff-app` / `bff-pos` / `bff-platform` y los microservicios
- **Meta:** `[Hito 3 / 5]` · `[P1]` · `[2 pts]` · `[services/bff-*]` · `[Doc 05 §8, Doc 08 §7]`
- **Como** desarrollador, **quiero** que si un microservicio cambia la respuesta de un endpoint que consume un BFF, la verificación de Pact falle en el CI antes de desplegar, **para** poder desplegar cada microservicio de forma independiente sin romper los frontends.
```gherkin
Escenario: Ruptura de contrato entre catalog-service y bff-app es detectada en el PR
  Dado el contrato Pact publicado por "bff-app"
  Cuando un cambio en "catalog-service" renombra una propiedad esperada por "bff-app"
  Entonces el test de verificación de proveedor falla en el pipeline de CI
```

### - [ ] HU-338: Pruebas End-to-End con Playwright para la App de Gestión Web y la Consola del Super Admin
- **Meta:** `[Hito 5 / 6]` · `[P0]` · `[3 pts]` · `[tests/e2e]` · `[Doc 05 §8]`
- **Como** QA, **quiero** una suite de Playwright que ejecute el recorrido completo: el super admin crea la tienda en la consola → el dueño activa su cuenta → crea productos y cajero → el simulador de caja se enrola, vende offline y sincroniza → el dueño ve la venta en el Dashboard en vivo y concilia el pago digital, **para** validar todo el sistema integrado en cada release.
```gherkin
Escenario: Flujo E2E completo desde la creación de la tienda hasta la visualización de la venta en el dashboard
  Cuando se ejecuta "pnpm test:e2e" en el entorno de staging o local completo
  Entonces el recorrido de punta a punta finaliza en verde en menos de 3 minutos
```

### - [ ] HU-339: Experimentos de Chaos Testing automatizados (caída de `inventory-service`, reinicio de broker Kafka, latencia en réplica de lectura)
- **Meta:** `[Hito 7]` · `[P1]` · `[3 pts]` · `[infra, tests/chaos]` · `[Doc 05 §7, §9]`
- **Como** SRE, **quiero** ejecutar pruebas de caos en `staging` apagando un microservicio consumidor durante 30 minutos mientras las cajas siguen vendiendo y sincronizando, **para** comprobar que al levantar el servicio procesa el lag acumulado sin perder ni duplicar un solo movimiento.
```gherkin
Escenario: Apagado de inventory-service por 30 minutos no afecta /v1/sync/push y converge al 100 % al volver
  Dado que se detiene el contenedor de "inventory-service" mientras 100 cajas suben ventas a "sync-service"
  Cuando "inventory-service" vuelve a encenderse 30 minutos después
  Entonces todas las cajas recibieron "200 OK" sin demora y "stock_levels" converge al valor exacto en cuanto drena el lag de Kafka
```

### - [ ] HU-340: Simulacro automatizado y documentado de recuperación Point-In-Time (PITR) de Aurora/PostgreSQL y reconstrucción desde el Outbox de las cajas
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[infra, docs]` · `[Doc 05 §7, Doc 09 §6]`
- **Como** SRE, **quiero** ejecutar y medir un simulacro de restauración PITR verificando que el RTO sea menor a 15 minutos y que cualquier evento ocurrido en los últimos segundos se recupere o reenvíe desde las cajas, **para** certificar el plan de recuperación ante desastres antes de producción.
```gherkin
Escenario: Restauración de base de datos a un punto en el tiempo y verificación de integridad
  Cuando se ejecuta el procedimiento de restauración PITR en staging
  Entonces el clúster restaurado pasa las verificaciones de consistencia dentro del RTO objetivo
```

### - [ ] HU-341: Rotación automática de credenciales de bases de datos en AWS Secrets Manager y procedimiento de rotación de llaves de firma (`kid`) en KMS
- **Meta:** `[Hito 7]` · `[P1]` · `[2 pts]` · `[infra/terraform, services/*]` · `[Doc 04 §4]`
- **Como** ingeniero de seguridad, **quiero** que las contraseñas de los roles `*_rw` de cada microservicio roten automáticamente cada 30 días en Secrets Manager recargando el pool de conexiones sin caída, y que el cambio de `kid` de firma de licencias se haga con doble llave pública activa, **para** cumplir las mejores prácticas de gestión de secretos.
```gherkin
Escenario: Rotación de credencial de base de datos sin interrumpir peticiones en curso
  Cuando Secrets Manager rota la contraseña del rol "sales_rw"
  Entonces el pool de conexiones de "sales-service" recarga el nuevo secreto y reconecta sin generar errores 500
```

### - [ ] HU-342: Generación de SBOM (CycloneDX), escaneo de imágenes Docker con Trivy y firma de contenedores con Cosign en el pipeline de release
- **Meta:** `[Hito 7]` · `[P1]` · `[2 pts]` · `[ci]` · `[Doc 04 §5, Doc 05 §8]`
- **Como** ingeniero DevSecOps, **quiero** que cada imagen Docker e instalador genere su lista de materiales de software (SBOM), falle si Trivy detecta vulnerabilidades `CRITICAL` con parche disponible y se firme criptográficamente con Cosign / Authenticode, **para** garantizar la integridad de la cadena de suministro de software.
```gherkin
Escenario: Bloqueo de despliegue de una imagen no firmada o con CVE crítico
  Dado una imagen de contenedor que presenta una vulnerabilidad CRITICAL con fix disponible
  Cuando corre el job de seguridad del release
  Entonces Trivy detiene la publicación y evita desplegar la imagen en producción
```

---

## Desglose Atómico de Periféricos, Plantillas de Tirilla e Instaladores Windows/Android (HU-343 a HU-380)

### - [ ] HU-343: Detección automática en caliente (*hot-plug*) cuando se desconecta o reconecta por USB el lector de código de barras o la impresora térmica
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/devices]` · `[UC-E19]`
- **Como** cajero en un mostrador donde los cables USB se mueven por accidente, **quiero** que si la impresora o el lector se desconecta y se vuelve a enchufar, la caja lo reconozca automáticamente sin reiniciar el programa, **para** no interrumpir el turno.
```gherkin
Escenario: Reconexión en caliente del cable USB de la impresora térmica
  Dado que la impresora térmica se desconectó del puerto USB mostrando el ícono "Impresora desconectada"
  Cuando el cajero vuelve a conectar el cable USB en cualquier puerto del PC
  Entonces en menos de 3 segundos el estado vuelve a "Impresora lista" y se imprime cualquier comprobante que estuviera en la cola local
```

### - [ ] HU-344: Motor de maquetación de tirillas de texto de ancho fijo para 32 columnas (58 mm) y 48 columnas (80 mm) con ajuste de palabra y alineación de montos
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/devices]` · `[HU-048, HU-049]`
- **Como** cliente que recibe el tiquete en papel térmico, **quiero** que los nombres largos de productos se partan en dos renglones sin cortar los precios de la columna derecha, tanto en rollo de 58 mm como de 80 mm, **para** que todos los valores sean legibles.
```gherkin
Escenario: Producto con nombre de 45 caracteres impreso en papel de 58 mm (32 columnas)
  Dado el producto "Detergente Líquido Ariel Concentrado 1.8 Litros" por "$ 24.900"
  Cuando se formatea para ancho de 32 columnas
  Entonces el nombre ocupa las líneas necesarias a la izquierda y "$ 24.900" queda alineado exactamente en la columna 32 sin desbordarse
```

### - [ ] HU-345: Plantilla ESC/POS de Comprobante de Abono de Cartera (con saldo anterior, abono recibido, medio de pago y nuevo saldo)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos/devices]` · `[UC-K03]`
- **Como** vecino que abona a su cuenta de fiado, **quiero** llevarme un recibo impreso que diga cuánto debía antes, cuánto aboné hoy y cuánto me queda por pagar, **para** evitar malentendidos con la tienda.
```gherkin
Escenario: Impresión de recibo de abono con los tres saldos claros
  Dado un abono de $20.000 sobre una deuda anterior de $55.000
  Cuando se confirma el abono
  Entonces el tiquete impreso muestra "SALDO ANTERIOR: $ 55.000 / ABONO RECIBIDO: $ 20.000 / NUEVO SALDO: $ 35.000"
```

### - [ ] HU-346: Plantilla ESC/POS de Tirilla de Movimiento de Caja / Retiro Parcial (*Safe Drop*) con renglón para firma física
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos/devices]` · `[UC-C03, UC-C04]`
- **Como** dueño de tienda, **quiero** que cada vez que salga dinero de la caja para un proveedor o para la caja fuerte se imprima una tirilla con hora, monto, motivo, cajero, aprobador y una línea `"Firma de quien recibe: ____________"`, **para** guardarla dentro del cajón como soporte físico del arqueo.
```gherkin
Escenario: Impresión de soporte físico al registrar salida de efectivo
  Cuando se registra una salida de efectivo o un retiro parcial en la caja
  Entonces se imprime automáticamente la tirilla con el espacio de firma para meterla en la gaveta
```

### - [ ] HU-347: Plantilla ESC/POS de Comprobante de Devolución / Anulación con línea de firma del cliente y del supervisor
- **Meta:** `[Hito 5]` · `[P0]` · `[1 pt]` · `[apps/pos/devices]` · `[UC-V13, UC-V14]`
- **Como** supervisor, **quiero** que toda devolución de dinero o anulación imprima un soporte con el comprobante original referenciado, el motivo y espacio para la firma del cliente, **para** respaldar por qué salió ese dinero de la caja.
```gherkin
Escenario: Impresión de comprobante de devolución referenciando la venta original
  Cuando se confirma una devolución sobre la venta "C01-000042"
  Entonces se imprime el soporte indicando "DEVOLUCIÓN SOBRE COMPROBANTE C01-000042" con los productos devueltos y el medio de reembolso
```

### - [ ] HU-348: Plantilla ESC/POS del Reporte Z de Cierre de Turno (resumen de ventas, impuestos, medios de pago, movimientos, arqueo por denominación y descuadre)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos/devices]` · `[UC-C05, HU-057]`
- **Como** dueño de tienda, **quiero** que al cerrarse el turno la impresora entregue la tirilla completa del Reporte Z con las denominaciones contadas, el esperado, el declarado y la diferencia resaltada, **para** archivar el cierre físico del día.
```gherkin
Escenario: Impresión del Reporte Z al finalizar el arqueo ciego
  Cuando el cajero confirma el cierre del turno
  Entonces se imprime el Reporte Z completo incluyendo el desglose de billetes y monedas contados y el balance final
```

### - [ ] HU-349: Impresión de logotipo monocromático opcional del negocio (bitmap ESC/POS `GS v 0`) en el encabezado del comprobante
- **Meta:** `[Hito 5]` · `[P2]` · `[1 pt]` · `[apps/pos/devices]` · `[UX]`
- **Como** dueño de tienda, **quiero** poder subir el logo en blanco y negro de mi negocio para que salga impreso arriba de cada comprobante, **para** darle buena presentación a mis recibos.
```gherkin
Escenario: Conversión de imagen a bitmap monocromático de 384px (58mm) o 576px (80mm)
  Dado que la tienda tiene un logo configurado
  Cuando se imprime un comprobante
  Entonces el driver envía la trama ESC/POS "GS v 0" centrada en la parte superior del tiquete
```

### - [ ] HU-350: Empaquetado de instalador Windows (`.msi` y `.exe` NSIS en español) con WebView2 Bootstrapper embebido y opción de "Iniciar automáticamente al prender el PC"
- **Meta:** `[Hito 2 / 7]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[Doc 05 §8, Guía 00 §14]`
- **Como** tendero con un computador con Windows 10 u 11, **quiero** un instalador en español de siguiente-siguiente que instale WebView2 si hace falta, cree el acceso directo en el Escritorio y permita que la caja se abra sola cuando prendo el computador por la mañana, **para** que usar el sistema sea tan fácil como prender el PC.
```gherkin
Escenario: Instalación limpia en una máquina virtual con Windows 10 sin herramientas de desarrollo
  Dado una instalación limpia de Windows 10
  Cuando ejecuto "TienditaOnline-Setup.exe"
  Entonces la aplicación se instala sin pedir dependencias externas, crea el ícono en el escritorio y abre en menos de 3 segundos
```

### - [ ] HU-351: Compilación y empaquetado de la App Instalable para Tablets Android (`.apk` / `.aab`) con soporte de impresora Bluetooth/Red y lector USB-OTG/Bluetooth
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[apps/pos]` · `[Doc 01 §1]`
- **Como** tendero que prefiere usar una tablet Android en el mostrador en lugar de un PC, **quiero** instalar la misma aplicación de caja en mi tablet conectada a una impresora térmica Bluetooth o de red y a un lector de código de barras Bluetooth/OTG, **para** ahorrar espacio y energía en el mostrador.
```gherkin
Escenario: Cobro e impresión por Bluetooth desde tablet Android sin internet
  Dado una tablet Android en modo avión vinculada por Bluetooth a una impresora térmica de 58 mm
  Cuando el cajero registra y cobra una venta
  Entonces la venta se guarda en SQLCipher en el almacenamiento seguro de Android y se imprime por Bluetooth
```

### - [ ] HU-352: Protección contra ejecución de múltiples instancias simultáneas de la App Instalable en el mismo PC (*Single Instance Lock*)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-E02]`
- **Como** núcleo de la caja, **quiero** adquirir un bloqueo de instancia única al iniciar y, si el cajero vuelve a hacer doble clic en el ícono del escritorio, traer al frente la ventana que ya estaba abierta en vez de abrir una segunda instancia sobre el mismo archivo SQLite, **para** evitar bloqueos de base de datos o colisiones de puertos de impresora.
```gherkin
Escenario: Segundo clic en el acceso directo enfoca la ventana existente sin abrir otro proceso
  Dado que la App Instalable ya está ejecutándose en el PC
  Cuando el usuario hace doble clic nuevamente en el ícono del escritorio
  Entonces el nuevo proceso detecta el lock activo, restaura y pone al frente la ventana existente y termina inmediatamente
```

---

## Desglose Atómico de Operación Real de Tienda de Barrio en Colombia (HU-353 a HU-385)

### - [ ] HU-353: Control de envases retornables y canastas en préstamo (cerveza, gaseosa retornable y botellones de agua)
- **Meta:** `[Hito 5]` · `[P1]` · `[3 pts]` · `[services/catalog-service, apps/pos]` · `[Retail Colombia]`
- **Como** tendero colombiano que vende cerveza y gaseosa en envase retornable de vidrio o botellón de agua, **quiero** poder marcar si el cliente trajo el envase vacío o si lleva el envase (cobrando el depósito del envase o anotándole los envases pendientes por devolver), **para** que no se me pierdan las botellas ni las canastas de Bavaria/Postobón/Coca-Cola.
```gherkin
Escenario: Venta de líquido retornable cuando el cliente NO trae el envase vacío suma el depósito automáticamente
  Dado el producto "Cerveza Águila 330ml Retornable" ($3.000) vinculado al producto envase "Envase Retornable 330ml" ($1.000)
  Cuando el cajero marca "Cliente no entrega envase (cobrar depósito)" para 6 cervezas
  Entonces se agregan automáticamente 6 unidades de "Envase Retornable 330ml" por $6.000 que son reembolsables cuando traiga los cascos vacíos
```

### - [ ] HU-354: Devolución de cascos/envases vacíos por el cliente en caja con reembolso del depósito o descuento de la compra actual
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/pos]` · `[Retail Colombia]`
- **Como** cajero, **quiero** recibir los envases vacíos que el vecino trae horas después y descontarle ese valor de su nueva compra o entregarle el depósito en efectivo, **para** cerrar el ciclo de los envases retornables en el turno.
```gherkin
Escenario: Cliente devuelve 6 envases vacíos y el valor se descuenta de su compra actual
  Dado que el cliente trae 6 envases retornables de $1.000 y hace una compra nueva de $10.000
  Cuando el cajero registra "Recibir 6 envases retornables (-$6.000)"
  Entonces entran +6 envases vacíos al stock y el neto a cobrar en la cuenta es $4.000
```

### - [ ] HU-355: Lista de "Personas autorizadas para llevar fiado" dentro de la ficha de un cliente titular (ej. hijos o cónyuge en la tienda del barrio)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/customer-service, apps/pos]` · `[Retail Colombia, UC-V04]`
- **Como** dueño de tienda y vecino del barrio, **quiero** que en la ficha de `"Doña Marta"` quede escrito quiénes están autorizados por ella para pedir fiado a su cuenta (ej. `"Solo ella y su hijo Camilo — NO fiarle al sobrino"`) y que al cajero le aparezca esa nota en grande al seleccionar la cuenta e indique quién vino por el mandado, **para** evitar reclamos cuando cobran la cuenta a fin de quincena.
```gherkin
Escenario: Selección de quién retira el pedido fiado e impresión de su nombre en el comprobante
  Dado que la ficha de "Doña Marta" tiene autorizados a "Marta (Titular)" y "Camilo (Hijo)" y la nota "No fiar sin el cuaderno"
  Cuando el cajero la selecciona para una venta a crédito
  Entonces la pantalla muestra la nota de advertencia, pide elegir quién lleva el pedido ("Camilo (Hijo)") y lo deja impreso en el comprobante y en el movimiento de cartera
```

### - [ ] HU-356: Registro opcional de fecha de vencimiento de lote al recibir mercancía perecedera y alerta de "Próximos a vencer en 7 días"
- **Meta:** `[Hito 5]` · `[P2]` · `[2 pts]` · `[services/inventory-service, apps/management]` · `[UC-I04, UC-I05]`
- **Como** tendero que vende lácteos, pan tajado, carnes frías y medicamentos de venta libre, **quiero** anotar opcionalmente la fecha de vencimiento al recibir el pedido y que la App de Gestión me avise 7 días antes de que se venzan, **para** sacarlos en promoción o cambiarlos con el preventista antes de perder la plata.
```gherkin
Escenario: Alerta de productos con lote que vence en los próximos 7 días
  Dado una recepción de "Queso Tajado" donde se registró fecha de vencimiento dentro de 5 días
  Cuando corre la revisión diaria de inventario
  Entonces el dueño recibe la alerta "Tienes productos próximos a vencer en menos de 7 días"
```

### - [ ] HU-357: Calculadora rápida de precio de venta sugerido a partir del precio de la paca/caja y el porcentaje de ganancia deseado
- **Meta:** `[Hito 3]` · `[P1]` · `[1 pt]` · `[packages/admin-ui]` · `[Retail Colombia]`
- **Como** tendero cuando el proveedor me trae una paca de 24 unidades por `$43.200`, **quiero** digitar en la app `"Compré paca de 24 en $43.200 y quiero ganarle el 25 %"` y que me calcule el costo por unidad (`$1.800`) y el precio de venta sugerido redondeado a `$50` (`$2.400`), **para** fijar precios sin usar calculadora aparte.
```gherkin
Escenario: Cálculo automático de costo unitario y precio de venta redondeado a múltiplo de $50
  Dado que ingreso en el asistente de costo: "Valor paca = $43.200", "Unidades por paca = 24" y "Margen deseado = 25 %"
  Entonces el formulario llena automáticamente "Costo unitario = $1.800" y sugiere "Precio de venta = $2.400"
```

### - [ ] HU-358: Actualización masiva de precios por categoría o por proveedor/marca (en porcentaje o valor fijo, redondeado a $50 COP) con vista previa y Step-up MFA
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/catalog-service, apps/management]` · `[UC-I03, HU-097]`
- **Como** dueño de tienda cuando una marca sube toda su lista un 8 %, **quiero** seleccionar la marca o categoría, aplicar `+8 % redondeado a $50`, ver la tabla del antes y después de todos los productos afectados y confirmar con mi MFA, **para** actualizar 100 precios en 30 segundos.
```gherkin
Escenario: Vista previa y confirmación con MFA de aumento del 8 % en toda una marca
  Dado que selecciono la marca "Alpina" (40 productos) y elijo "Aumentar 8 % redondeando al múltiplo de $50 más cercano"
  Cuando reviso la vista previa y confirmo con mi código MFA
  Entonces los 40 productos se actualizan en una sola transacción y se publican hacia las cajas
```

### - [ ] HU-359: Vista "Resumen de Cierre del Día para el Dueño" en una sola pantalla (cuánto se vendió, cuánto entró en efectivo neto, cuánto en Nequi/billeteras, cuánto se fió, cuánto abonaron, cuánto se pagó a proveedores desde caja y cuál fue la ganancia estimada)
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/reporting-service, apps/management]` · `[UC-R01]`
- **Como** dueño de tienda de barrio a las 9:00 p. m., **quiero** una pantalla sencilla llamada **"El Cuadre de Hoy"** que me responda en lenguaje cotidiano cuánto efectivo debe haber después de restar lo que se les pagó a proveedores y dejar la base de mañana, **para** hacer las cuentas del día en 1 minuto.
```gherkin
Escenario: Visualización de El Cuadre de Hoy con flujo real de efectivo del día
  Cuando abro "El Cuadre de Hoy" al terminar la jornada
  Entonces veo el balance exacto de Efectivo recibido, Pagos a proveedores desde caja, Retiros a caja fuerte, Base para mañana y Efectivo libre del día, junto con la utilidad bruta estimada
```

### - [ ] HU-360: Impresión de comprobante de "Estado de Cuenta de Fiado" en la impresora térmica de la caja para entregárselo en mano al vecino
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos/devices]` · `[UC-K04]`
- **Como** cajero o tendero cuando un vecino viene a preguntar *"¿cuánto le debo y de qué es?"*, **quiero** imprimir en la tirilla térmica sus últimos movimientos de compras fiadas y abonos con su saldo actual, **para** entregárselo en papel ahí mismo en el mostrador.
```gherkin
Escenario: Impresión de extracto corto de cartera en tirilla térmica
  Dado que busco a "Doña Marta" en la sección Clientes de la caja
  Cuando presiono "Imprimir estado de cuenta"
  Entonces la impresora térmica imprime los últimos movimientos registrados localmente y el saldo estimado a la fecha
```

---

## Desglose Atómico de Operación SaaS, Cumplimiento Legal Colombia, Soporte y FinOps (HU-361 a HU-420)

### - [ ] HU-361: Versionado y aceptación obligatoria de Términos del Servicio, Política de Datos (Ley 1581) y Contrato de Encargo de Tratamiento (DPA) por el dueño de tienda
- **Meta:** `[Hito 3 / 7]` · `[P0]` · `[2 pts]` · `[services/tenant-service, apps/management]` · `[Doc 06 §3]`
- **Como** empresa operadora de TienditaOnline (Encargado del tratamiento), **quiero** guardar la versión exacta del documento legal, fecha/hora, IP y usuario cuando el dueño acepta los Términos, la Política de Privacidad y el DPA, **para** tener prueba auditable del contrato ante la SIC.
```gherkin
Escenario: Registro inmutable de aceptación de términos y DPA al activar la tienda
  Cuando el dueño marca las casillas de aceptación legal en la activación de su cuenta
  Entonces se registra la versión del texto legal, timestamp e IP y se bloquea el avance si no están marcadas
```

### - [ ] HU-362: Contrato de Licencia de Usuario Final (EULA) de la Edición Local con cláusula explícita de custodia local de datos y respaldos `.tdbak`
- **Meta:** `[Hito L]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[Doc 10 §4.5, §4.9]`
- **Como** proveedor de la Edición Local (donde ningún dato de negocio sube a la nube), **quiero** que antes de activar la licencia el comprador acepte en pantalla el EULA donde consta que él es el único responsable y custodio de su computador y de sus copias `.tdbak`, **para** delimitar claramente la responsabilidad legal.
```gherkin
Escenario: Aceptación obligatoria del EULA antes de activar la Edición Local
  Dado el primer inicio de la Edición Local
  Cuando el usuario intenta activar su serial o iniciar la prueba de 15 días
  Entonces debe aceptar primero el EULA y la aceptación queda firmada en el request de activación
```

### - [ ] HU-363: Flujo completo de Derechos ARCO (Conocer, Actualizar, Rectificar y Suprimir) para titulares de datos en cada tienda (`Doc 06 §3`)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/customer-service, apps/management]` · `[Doc 06 §3, UC-K07]`
- **Como** dueño de tienda (Responsable del tratamiento de datos de sus vecinos), **quiero** un botón en la ficha del cliente para descargar en PDF/JSON toda la información personal almacenada de ese vecino (derecho de acceso) o corregirla/suprimirla, **para** responder cualquier solicitud de Habeas Data dentro de los plazos de la Ley 1581.
```gherkin
Escenario: Descarga de ficha ARCO de un cliente con su constancia de autorización
  Cuando el dueño selecciona "Exportar datos personales (Habeas Data)" en la ficha de un cliente
  Entonces se descarga un documento con sus datos registrados, la fecha "data_consent_at" y el historial de modificaciones
```

### - [ ] HU-364: Registro auditable de contador de contactos semanales por deudor y filtro de días festivos colombianos en `notification-service` (Ley 2300 de 2023)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/notification-service]` · `[Doc 06 §3, HU-109]`
- **Como** `notification-service`, **quiero** mantener el calendario de festivos de Colombia (Ley Emiliani) y un contador de contactos de cobranza por cliente por semana, impidiendo enviar mensajes de cobro domingos, festivos, fuera de horario (lunes a viernes 7 a. m.–7 p. m., sábados 8 a. m.–3 p. m.) o más de una vez por semana una vez establecido contacto directo, **para** cumplir estrictamente la Ley 2300 de 2023.
```gherkin
Escenario: Bloqueo de segundo mensaje de cobro en la misma semana para el mismo cliente
  Dado que el martes ya se entregó un recordatorio de cobro a "Don Pedro"
  Cuando el dueño intenta enviarle otro recordatorio el jueves de la misma semana
  Entonces el servicio rechaza el envío informando el límite semanal de contacto de la Ley 2300 de 2023
```

### - [ ] HU-365: Configuración por tienda del texto de política de cambios y garantías impreso en el comprobante (Ley 1480 de 2011 — Estatuto del Consumidor)
- **Meta:** `[Hito 2 / 3]` · `[P1]` · `[1 pt]` · `[services/tenant-service, apps/pos]` · `[Doc 06 §4]`
- **Como** dueño de tienda, **quiero** configurar el texto de condiciones de cambio y garantía que se imprime al pie del comprobante y el plazo máximo en días para devoluciones sin autorización especial, **para** cumplir con la información al consumidor.
```gherkin
Escenario: Advertencia en caja cuando se intenta devolver una venta fuera del plazo de cambios de la tienda
  Dado que la tienda configuró 8 días para cambios y se busca una venta de hace 15 días
  Cuando se intenta registrar la devolución
  Entonces la caja advierte "Venta fuera del plazo de cambios (15 días)" y exige motivo de garantía y PIN de supervisor/dueño
```

### - [ ] HU-366: Emisión de la factura electrónica propia de TienditaOnline SAS al cobrar la suscripción o licencia local a cada tendero (`Doc 06 §7`)
- **Meta:** `[Hito 6]` · `[P1]` · `[3 pts]` · `[services/tenant-service]` · `[Doc 06 §7]`
- **Como** empresa propietaria del SaaS en Colombia, **quiero** que cada vez que un tendero pague su mensualidad o compre una licencia local (`billing_payments.status = APPROVED`), el sistema envíe los datos del pago al software contable/facturador de TienditaOnline (Alegra / Siigo API) para emitirle automáticamente su factura electrónica por el servicio de software, **para** llevar nuestra propia facturación legal sin trabajo manual.
```gherkin
Escenario: Pago de suscripción dispara emisión de factura del SaaS al cliente
  Dado un pago aprobado de $34.900 en "billing_payments"
  Cuando se procesa el evento de pago confirmado
  Entonces se invoca el webhook/API contable de TienditaOnline para timbrar y enviar por correo la factura del servicio al dueño de la tienda
```

### - [ ] HU-367: Centro de ayuda integrado con videos cortos de 60 segundos ("Cómo vender", "Cómo hacer el arqueo", "Cómo fiar y abonar") y botón directo a WhatsApp de Soporte
- **Meta:** `[Hito 5 / 7]` · `[P1]` · `[2 pts]` · `[apps/pos, apps/management]` · `[Doc 09 §6, Recomendación #17]`
- **Como** tendero o cajero nuevo, **quiero** un botón de ayuda `?` en cada pantalla que me muestre un video corto o guía visual de 3 pasos y un botón para escribir al WhatsApp de soporte enviando automáticamente el código de mi tienda y versión de la app, **para** resolver dudas en segundos.
```gherkin
Escenario: Botón de soporte por WhatsApp prellena el código de tienda y caja
  Cuando el dueño toca "Hablar con soporte por WhatsApp" en la App de Gestión
  Entonces abre WhatsApp con el mensaje prellenado "Hola, necesito ayuda con mi tienda [Tienda El Sol - CAJA-01 - v1.0.0]"
```

### - [ ] HU-368: Analítica de uso de producto anónima y respetuosa de privacidad (PostHog) para medir tiempos por venta y adopción de funciones
- **Meta:** `[Hito 5]` · `[P2]` · `[2 pts]` · `[apps/pos, apps/management]` · `[Recomendación #13]`
- **Como** equipo de producto, **quiero** medir métricas agregadas de experiencia (cuántos segundos tarda un cajero desde el primer escaneo hasta cobrar, en qué paso abandonan un formulario, qué reportes son los más abiertos) sin enviar nunca nombres de clientes ni montos sensibles, **para** mejorar continuamente la facilidad de uso.
```gherkin
Escenario: Registro de duración de cobro sin incluir datos personales
  Cuando se completa una venta en la caja
  Entonces se registra la métrica "pos_checkout_duration_ms" sin incluir datos del comprador
```

### - [ ] HU-369: Etiquetado FinOps (`cost-center`, `service`, `env`) en todos los recursos de Terraform y métrica mensual de costo de infraestructura por tienda activa
- **Meta:** `[Hito 7]` · `[P2]` · `[1 pt]` · `[infra/terraform]` · `[Doc 05 §10]`
- **Como** fundador del SaaS, **quiero** que todos los recursos de AWS tengan etiquetas de costo por servicio y entorno y ver en la consola cuánto me cuesta en infraestructura cada tienda activa frente a los $34.900 / $79.900 que paga, **para** cuidar el margen bruto del negocio.
```gherkin
Escenario: Validación en CI de que todo recurso Terraform incluye tags obligatorios
  Cuando corre "terraform validate" y "tflint" en el pipeline de CI
  Entonces falla si algún recurso desplegable carece de las etiquetas "service" y "environment"
```

### - [ ] HU-370: Runbook operativo y script automatizado para reprocesar eventos desde `ingested_events` hacia un nuevo consumidor
- **Meta:** `[Hito 4 / 7]` · `[P1]` · `[2 pts]` · `[tools, services/sync-service]` · `[Doc 03 §4, Doc 09 §6]`
- **Como** SRE, **quiero** un comando probado que tome un rango de fechas o un `tenant_id` de `ingested_events` y vuelva a publicar los eventos en Kafka hacia un *consumer group* específico, **para** poblar nuevos microservicios (como `einvoicing-service` o ClickHouse) sin pedir nada a las cajas.
```gherkin
Escenario: Re-publicación controlada de eventos históricos de una tienda
  Cuando ejecuto la herramienta de replay para "tenant_A" sobre las últimas 24 horas
  Entonces los eventos se republicarán en orden de "terminal_seq" y los servicios existentes los ignoran por su tabla "inbox" mientras el nuevo consumidor los procesa
```

### - [ ] HU-371: Runbook y procedimiento de respuesta ante incidentes de seguridad y notificación dentro de los plazos legales a la SIC y a los tenants (Ley 1581)
- **Meta:** `[Hito 7]` · `[P1]` · `[1 pt]` · `[docs, seguridad]` · `[Doc 04 §9, Doc 06 §3]`
- **Como** oficial de seguridad y privacidad, **quiero** un procedimiento operativo estándar con plantillas listas para aislar credenciales comprometidas, revocar tokens masivamente y notificar un incidente de datos personales a la Superintendencia de Industria y Comercio (SIC) y a los dueños afectados, **para** actuar sin improvisación ante cualquier incidente.
```gherkin
Escenario: Comando de emergencia para revocar todos los tokens activos e invalidar sesiones
  Cuando se ejecuta el script de emergencia de rotación de secreto/llave de sesión
  Entonces todos los access tokens y refresh tokens previos quedan invalidados inmediatamente exigiendo nuevo login con MFA
```

---

## Desglose Atómico de Seguridad, Hardening, Certificados y Publicación en Tiendas (HU-372 a HU-415)

### - [ ] HU-372: Cabeceras HTTP de seguridad estrictas en Gateway y Web (`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`)
- **Meta:** `[Hito 3 / 7]` · `[P0]` · `[1 pt]` · `[gateway, apps/management]` · `[Doc 04 §5]`
- **Como** ingeniero de seguridad, **quiero** que todas las respuestas HTTP de la API, de la App de Gestión Web y de la Consola incluyan las cabeceras de seguridad y una CSP sin `unsafe-eval`, **para** prevenir XSS, clickjacking y downgrade de TLS.
```gherkin
Escenario: Verificación automática de cabeceras de seguridad en respuestas HTTP
  Cuando el escáner OWASP ZAP analiza "https://app.tienditaonline.co" y "https://api.tienditaonline.co"
  Entonces no reporta ninguna alerta por cabeceras de seguridad faltantes
```

### - [ ] HU-373: CSP estricta y deshabilitación de acceso directo a Node/FS desde la WebView en `tauri.conf.json` (Capacidades mínimas de Tauri 2)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[Doc 01 §5, Doc 04 §5]`
- **Como** arquitecto de seguridad de la App Instalable, **quiero** configurar las *Capabilities* de Tauri 2 para que la WebView solo pueda invocar la lista blanca de comandos IPC definidos por nosotros y no tenga permiso directo sobre el sistema de archivos ni de red arbitraria, **para** que incluso si hubiera un bug en un componente React no pueda leer ni borrar archivos del PC.
```gherkin
Escenario: Intento de acceso directo al sistema de archivos desde JavaScript en la WebView es bloqueado por Tauri
  Dado el archivo de capacidades de Tauri 2 en producción
  Cuando un script en la WebView intenta usar APIs nativas de archivos no expuestas en nuestros comandos IPC
  Entonces el runtime de Tauri bloquea la llamada con permiso denegado
```

### - [ ] HU-374: Protección contra asignación masiva (*Mass Assignment* / OWASP API3) con `.strict()` o `.strip()` en todos los esquemas Zod de entrada
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[packages/contracts, services/*]` · `[Doc 04 §5]`
- **Como** desarrollador backend, **quiero** que todos los DTOs de entrada ignoren o rechacen propiedades no declaradas (como `tenant_id`, `role`, `status`, `balance` o `paid_until` enviados maliciosamente en el body), **para** impedir que un usuario modifique campos internos.
```gherkin
Escenario: Envío de propiedad prohibida tenant_id o status en un PATCH de perfil es rechazado
  Dado un usuario que envía "PATCH /v1/app/branches/{id}" incluyendo "{ name: 'Centro', tenant_id: 'otro-uuid' }"
  Cuando se valida el cuerpo con el esquema Zod estricto
  Entonces la propiedad no permitida es rechazada o eliminada y jamás llega al repositorio Drizzle
```

### - [ ] HU-375: Control de egress de red (prevención de SSRF / OWASP API7): salida a internet desde los contenedores restringida por lista blanca de dominios/IPs
- **Meta:** `[Hito 7]` · `[P1]` · `[2 pts]` · `[infra/terraform]` · `[Doc 04 §5, §6]`
- **Como** ingeniero de seguridad de red, **quiero** que los microservicios en la subred privada no acepten URLs suministradas por el usuario para hacer peticiones salientes y solo puedan conectarse hacia los endpoints autorizados (pasarela de pagos, SES, Meta WhatsApp, Expo Push, KMS/S3 por VPC Endpoint), **para** eliminar el riesgo de Server-Side Request Forgery (SSRF).
```gherkin
Escenario: Contenedor de catalog-service no tiene salida libre a dominios arbitrarios de internet
  Cuando desde el contenedor de "catalog-service" se intenta abrir una conexión saliente a un dominio externo no autorizado
  Entonces la política de red bloquea la conexión saliente
```

### - [ ] HU-376: Firma digital Authenticode (EV Code Signing) de los ejecutables `.exe`/`.msi` de Windows en el pipeline de GitHub Actions
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[ci, apps/pos]` · `[Doc 04 §5, Guía 00 §2]`
- **Como** tendero descargando el instalador en Windows 10/11, **quiero** que el instalador y el ejecutable estén firmados con un certificado de firma de código válido y sello de tiempo (*timestamp server*), **para** que Windows SmartScreen confíe en el programa y no muestre pantallas azules de "Windows protegió su PC".
```gherkin
Escenario: Verificación de firma Authenticode con signtool en el artefacto compilado
  Cuando termina el workflow de release de la App Instalable para Windows
  Entonces "signtool verify /pa /v TienditaOnline-Setup.exe" devuelve firma válida y sello de tiempo verificado
```

### - [ ] HU-377: Publicación y configuración de la App de Gestión en Google Play Store y Apple App Store con EAS Build / EAS Submit y actualizaciones OTA (EAS Update)
- **Meta:** `[Hito 5 / 7]` · `[P0]` · `[3 pts]` · `[apps/management, ci]` · `[Doc 05 §8]`
- **Como** dueño de tienda, **quiero** instalar la App de Gestión desde Google Play Store (Android) o App Store (iPhone) y recibir mejoras de interfaz al instante por OTA (firmadas con Code Signing de EAS Update), **para** instalarla en mi celular con total confianza.
```gherkin
Escenario: Publicación de parche de interfaz por EAS Update sin esperar revisión de tienda
  Cuando se publica un cambio exclusivamente de JavaScript/UI en la rama de producción con "eas update"
  Entonces los celulares con la versión compatible descargan el bundle firmado en el siguiente inicio
```

### - [ ] HU-378: Publicación de archivo `/.well-known/security.txt` (RFC 9116) y página de estado pública (`status.tienditaonline.co`)
- **Meta:** `[Hito 7]` · `[P2]` · `[1 pt]` · `[infra, docs]` · `[Doc 04 §9]`
- **Como** usuario o investigador de seguridad, **quiero** consultar en `status.tienditaonline.co` si todos los servicios de la nube están operativos y contar con `/.well-known/security.txt` para reportar hallazgos de forma responsable, **para** dar transparencia y canal oficial de seguridad.
```gherkin
Escenario: Consulta de security.txt devuelve contacto y fecha de expiración vigentes
  Cuando se realiza "GET https://api.tienditaonline.co/.well-known/security.txt"
  Entonces responde "200 OK" con los campos obligatorios "Contact" y "Expires" según RFC 9116
```

---

## Desglose Atómico Completo EP-15 (Fase 7 Futura): Facturación Electrónica y Documento Equivalente POS DIAN (HU-379 a HU-415)

### - [ ] HU-379: `einvoicing-service` — Esquema de base de datos `001_schema.sql` (`dian_resolutions`, `terminal_numbering_blocks` con `EXCLUDE USING gist` y `electronic_documents`) y RLS
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[services/einvoicing-service]` · `[Doc 02, Doc 06 §1.4]`
- **Como** `einvoicing-service`, **quiero** garantizar mediante la restricción `EXCLUDE USING gist (resolution_id WITH =, int8range(block_from, block_to, '[]') WITH &&)` en PostgreSQL que sea físicamente imposible asignar dos bloques de numeración que se solapen entre dos cajas, **para** evitar números de factura duplicados ante la DIAN.
```gherkin
Escenario: PostgreSQL rechaza la inserción de un bloque de numeración que se cruza con otro existente
  Dado que "CAJA-01" tiene asignado el bloque "1..5000" de la resolución "R1"
  Cuando se intenta insertar para "CAJA-02" un bloque "4500..9000" sobre la misma resolución "R1"
  Entonces PostgreSQL lanza error de violación de restricción de exclusión e impide el solapamiento
```

### - [ ] HU-380: `einvoicing-service` — Custodia de la Clave Técnica (`technical_key_ref`) y credenciales del Proveedor Tecnológico en AWS Secrets Manager
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[services/einvoicing-service]` · `[Doc 04 §4, Doc 06 §1.3]`
- **Como** oficial de seguridad, **quiero** que la clave técnica de cada resolución DIAN y las credenciales del proveedor tecnológico se guarden exclusivamente en AWS Secrets Manager (guardando en PostgreSQL solo el ARN/referencia `technical_key_ref`), **para** que nunca estén en texto plano en la base de datos.
```gherkin
Escenario: La columna technical_key_ref solo contiene el identificador del secreto en KMS/Secrets Manager
  Cuando el dueño registra su resolución DIAN con su clave técnica
  Entonces el valor sensible se cifra en Secrets Manager y en "dian_resolutions" solo se almacena la referencia
```

### - [ ] HU-381: Alertas preventivas de resolución DIAN próxima a vencer (30, 15 y 5 días antes de `valid_to`) o rango al 80 % / 90 % de agotarse (`UC-E08, UC-E09`)
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[services/einvoicing-service, services/notification-service]` · `[UC-E08, UC-E09]`
- **Como** dueño de tienda obligado a facturar, **quiero** recibir alertas con 30, 15 y 5 días de anticipación antes de que venza la vigencia de mi resolución DIAN o cuando quede menos del 20 % de los números autorizados, **para** tramitar la nueva resolución en el portal MUISCA de la DIAN antes de que se bloquee la caja.
```gherkin
Escenario: Alerta automática a los 30 días del vencimiento de la resolución DIAN
  Dado una resolución activa cuya "valid_to" es dentro de 30 días
  Cuando corre el verificador diario de "einvoicing-service"
  Entonces envía alerta por Push, WhatsApp y Email al dueño indicando los pasos para renovar la resolución en la DIAN
```

### - [ ] HU-382: Implementación en Rust de `DianBlockNumbering` (consumo local del bloque activo, salto automático al bloque `STANDBY` y bloqueo si ambos se agotan o vencen)
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[3 pts]` · `[apps/pos/domain]` · `[Doc 01 §5, UC-E08, UC-E09]`
- **Como** caja POS en modo `DIAN_POS`, **quiero** tomar el siguiente número de mi bloque `ACTIVE` en `numbering_blocks`, pasar automáticamente al bloque `STANDBY` si el activo llega a `block_to` y bloquear el cobro con mensaje claro si no quedan números o si `valid_to` ya venció, **para** no emitir jamás un documento fuera del rango o vigencia autorizados por la DIAN.
```gherkin
Escenario: Transición automática del bloque ACTIVE agotado al bloque de reserva STANDBY sin detener la venta
  Dado que el bloque activo "1..5000" está en el número 5000 y existe un bloque "STANDBY" "10001..15000"
  Cuando se cobra la venta 5000 y luego se cobra la siguiente venta
  Entonces el primer bloque pasa a "EXHAUSTED", el bloque de reserva pasa a "ACTIVE" y la siguiente venta recibe el número "10001"
```

### - [ ] HU-383: Implementación en Rust de `DianPosFiscalDocument` — Cálculo exacto del CUDE/CUFE (SHA-384) y URL del código QR DIAN en la caja offline
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[3 pts]` · `[apps/pos/domain]` · `[ADR-004, Doc 06 §1.3]`
- **Como** caja POS en modo `DIAN_POS`, **quiero** concatenar los campos exigidos por el Anexo Técnico vigente de la DIAN (número, fecha, hora `-05:00`, subtotal, impuestos `01`/`04`, total, NIT emisor, documento adquirente, clave técnica/PIN de software y tipo de ambiente) y calcular su hash `SHA-384` hexadecimal, **para** imprimir el CUDE y el código QR válido en el tiquete térmico aunque no haya internet.
```gherkin
Escenario: El CUDE calculado en Rust coincide carácter por carácter con el validador en la nube
  Dado un conjunto de vectores de prueba oficiales del Anexo Técnico de la DIAN
  Cuando "DianPosFiscalDocument" calcula el CUDE en Rust
  Entonces produce exactamente la misma cadena hexadecimal de 96 caracteres que el generador UBL de "einvoicing-service"
```

### - [ ] HU-384: Impresión gráfica del código QR DIAN en ESC/POS (`GS ( k`) y leyendas obligatorias en la plantilla `receipt.dian_pos.v1`
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[apps/pos/devices]` · `[Doc 06 §1.6]`
- **Como** comprador de la tienda, **quiero** que mi tiquete POS electrónico impreso incluya los datos de la resolución DIAN, la discriminación de impuestos, el CUDE legible, el código QR escaneable y la identificación del software y proveedor tecnológico, **para** consultar mi documento en la DIAN.
```gherkin
Escenario: Impresión de comando nativo QR ESC/POS en el tiquete fiscal
  Cuando se imprime un documento con "receipt.dian_pos.v1"
  Entonces envía los comandos "GS ( k" (o bitmap QR de respaldo si la impresora no soporta QR nativo) con la URL de consulta DIAN
```

### - [ ] HU-385: Selector automático y manual de Factura Electrónica de Venta (`INVOICE`) en caja cuando se supera el tope parametrizable en UVT (`pos_max_uvt * uvt_value`) o el comprador lo exige
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[apps/pos]` · `[Doc 06 §1.5, UC-V03]`
- **Como** cajero, **quiero** un botón "Cliente solicita Factura Electrónica" (y que se active solo si la venta supera el tope en UVT parametrizado) pidiendo el NIT/cédula, nombre, correo y responsabilidades fiscales del comprador, **para** expedir factura electrónica de venta desde la misma caja.
```gherkin
Escenario: Cambio automático a tipo de documento INVOICE cuando el comprador pide factura con NIT
  Cuando el cajero activa "Factura Electrónica" y selecciona un adquirente con NIT y correo electrónico
  Entonces la venta consume consecutivo del bloque de resolución "INVOICE" en lugar de "POS_EQUIVALENT"
```

### - [ ] HU-386: `einvoicing-service` — Generador y validador XSD de XML UBL 2.1 para Documento Equivalente POS, Factura de Venta y Nota Crédito / Nota de Ajuste
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[5 pts]` · `[services/einvoicing-service]` · `[Doc 06 §1.1, §1.3]`
- **Como** `einvoicing-service`, **quiero** transformar cada venta o devolución en su documento XML UBL 2.1 con las tablas de códigos DIAN (unidades UNECE Rec. 20, tributos, medios de pago, responsabilidades fiscales) y validarlo contra los esquemas XSD oficiales antes de enviarlo al proveedor tecnológico, **para** detectar cualquier error de formato antes de transmitir.
```gherkin
Escenario: Validación contra esquema XSD oficial de la DIAN antes de transmitir
  Dado un evento "sales.recorded" de una tienda con "fiscal_mode = DIAN_POS"
  Cuando "einvoicing-service" construye el XML UBL 2.1
  Entonces pasa la validación contra el XSD del Anexo Técnico vigente sin errores
```

### - [ ] HU-387: `einvoicing-service` — Manejo de Contingencia Offline, bandeja de Documentos Rechazados por la DIAN (`UC-R06`, `UC-E27`) y almacenamiento en S3 Object Lock (WORM 10 años)
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[3 pts]` · `[services/einvoicing-service, apps/management]` · `[Doc 06 §1.3, §5, UC-R06, UC-E27]`
- **Como** administrador de una tienda con facturación electrónica activa, **quiero** ver en la App de Gestión el estado de mis documentos (`ACCEPTED`, `PENDING`, `REJECTED`), corregir datos del adquirente y retransmitir si hubo un rechazo por NIT inválido, y que todos los XML firmados y sus `ApplicationResponse` queden guardados en S3 con Object Lock en modo *Compliance* por 10 años, **para** cumplir con la obligación legal de conservación del Código de Comercio y de la DIAN.
```gherkin
Escenario: Corrección de datos del adquirente y retransmisión de un documento rechazado por la DIAN
  Dado un documento en "electronic_documents" con "status = REJECTED" por error en el dígito de verificación o correo del cliente
  Cuando el administrador corrige el dato del cliente en la bandeja de documentos DIAN y presiona "Reintentar envío"
  Entonces "einvoicing-service" regenera el envío, lo transmite al proveedor tecnológico y al ser aceptado archiva el XML y el ApplicationResponse en S3 Object Lock
```

---

## Desglose Atómico Endpoint por Endpoint del Contrato de API (`08-contratos-api.md`) (HU-388 a HU-450)

### - [ ] HU-388: Endpoint `POST /v1/activation/{token}` — Validación de expiración de token de invitación/activación de dueño
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/identity-service]` · `[UC-P01b]`
- **Como** dueño invitado, **quiero** que el endpoint verifique la vigencia del token de un solo uso y devuelva los datos básicos de la tienda por activar, **para** mostrar el nombre de mi negocio en la pantalla de bienvenida.
```gherkin
Escenario: Token de activación vencido devuelve 410 Gone
  Dado un token de activación cuya fecha de expiración ya pasó
  Cuando se llama a "POST /v1/activation/{token}"
  Entonces responde "410 GONE" con código "ACTIVATION_TOKEN_EXPIRED"
```

### - [ ] HU-389: Endpoint `GET /v1/app/products` — Paginación por cursor, búsqueda por nombre/SKU/código y filtros por categoría y estado
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/bff-app, services/catalog-service]` · `[UC-I01]`
- **Como** usuario de la App de Gestión, **quiero** listar productos paginados por cursor con filtros combinables, **para** navegar catálogos de miles de ítems sin lentitud.
```gherkin
Escenario: Paginación por cursor devuelve next_cursor y respeta limit máximo de 100
  Cuando consulto "GET /v1/app/products?limit=50"
  Entonces devuelve hasta 50 productos de mi tienda y el "next_cursor" para la siguiente página
```

### - [ ] HU-390: Endpoint `GET /v1/app/products/by-barcode/{code}` — Búsqueda exacta para el lector de cámara del celular
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/bff-app, services/catalog-service]` · `[UC-I01, HU-100]`
- **Como** App de Gestión móvil, **quiero** consultar un código de barras escaneado con la cámara y recibir el producto y su existencia actual (o `404` si es nuevo), **para** abrir su edición o su creación al instante.
```gherkin
Escenario: Código no registrado responde 404 con el código limpio listo para crear producto
  Cuando consulto "GET /v1/app/products/by-barcode/7709999999991" y no existe
  Entonces responde "404 PRODUCT_NOT_FOUND"
```

### - [ ] HU-391: Endpoint `POST /v1/app/products` — Creación de producto con sus códigos de barras e impuestos asociados en una sola transacción
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/catalog-service]` · `[UC-I01]`
- **Como** administrador, **quiero** crear un producto junto con su arreglo de códigos de barra e impuestos en una sola llamada `POST`, **para** que no queden productos sin código si falla una segunda petición.
```gherkin
Escenario: Creación atómica de producto y sus códigos de barras
  Cuando envío "POST /v1/app/products" con 2 códigos de barras (unidad y paca x12)
  Entonces se insertan el producto y los 2 registros en "product_barcodes" en la misma transacción
```

### - [ ] HU-392: Endpoint `PATCH /v1/app/products/{id}` — Actualización parcial con control optimista obligatorio `If-Match`
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/catalog-service]` · `[UC-I01, UC-E33]`
- **Como** administrador, **quiero** que toda edición de producto exija la cabecera `If-Match: <version>`, **para** impedir sobrescrituras accidentales.
```gherkin
Escenario: Petición PATCH sin cabecera If-Match devuelve 428 Precondition Required
  Cuando envío "PATCH /v1/app/products/{id}" sin la cabecera "If-Match"
  Entonces el servicio responde "428 PRECONDITION_REQUIRED"
```

### - [ ] HU-393: Endpoint `DELETE /v1/app/products/{id}` — Borrado lógico (`deleted_at = now()`) y emisión de tombstone hacia las cajas
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/catalog-service]` · `[UC-I01, UC-E06]`
- **Como** administrador, **quiero** eliminar un producto marcándolo con `deleted_at` sin borrar su fila física, **para** que las ventas históricas sigan intactas y las cajas lo retiren del buscador.
```gherkin
Escenario: Producto eliminado lógicamente genera tombstone en downstream_changes
  Cuando ejecuto "DELETE /v1/app/products/{id}"
  Entonces "deleted_at" se llena y en "downstream_changes" queda registrado "op = delete" para ese producto
```

### - [ ] HU-394: Endpoints `POST /v1/app/products/import` y `GET /v1/app/jobs/{id}` — Subida de Excel/CSV y consulta de estado del trabajo asíncrono
- **Meta:** `[Hito 3]` · `[P0]` · `[2 pts]` · `[services/catalog-service]` · `[UC-I02]`
- **Como** administrador, **quiero** subir mi archivo de productos y consultar el avance (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` con reporte de filas erróneas), **para** saber cuándo terminó la carga.
```gherkin
Escenario: Consulta de job completado entrega resumen de creados, actualizados y rechazados
  Cuando consulto "GET /v1/app/jobs/{id}" de una importación finalizada
  Entonces devuelve el conteo de filas procesadas y el enlace al CSV de errores si hubo filas rechazadas
```

### - [ ] HU-395: Endpoints `GET /v1/app/generic-items` y `POST /v1/app/generic-items/{id}/create-product` — Resolución de artículos genéricos
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[services/catalog-service]` · `[UC-I10]`
- **Como** administrador, **quiero** listar los artículos genéricos pendientes y crear el producto formal asociándolo al registro original, **para** vaciar la bandeja de pendientes.
```gherkin
Escenario: Marcar un artículo genérico como ignorado cuando fue una venta única irrepetible
  Cuando envío "POST /v1/app/generic-items/{id}/ignore"
  Entonces el registro pasa a "status = IGNORED" y sale de la lista de pendientes
```

### - [ ] HU-396: Endpoints `GET/POST /v1/app/branches/{id}/prices` — Gestión de lista de precios por sucursal y precios con vigencia programada
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[services/catalog-service]` · `[UC-I03]`
- **Como** dueño, **quiero** consultar y guardar precios específicos por sucursal con `valid_from` y `valid_to`, **para** diferenciar precios por local o por fecha.
```gherkin
Escenario: Precio de sucursal prevalece sobre base_price del producto
  Dado que un producto tiene "base_price = $3.000" y un precio vigente en "branch_prices" de "$3.200" para la Sucursal 1
  Cuando "sync-service" calcula el precio para las cajas de la Sucursal 1
  Entonces envía "$3.200"
```

### - [ ] HU-397: Endpoints `GET/POST/PATCH/DELETE /v1/app/promotions` — Gestión de reglas de promoción validando feature `promotions` del plan
- **Meta:** `[Hito 6]` · `[P2]` · `[1 pt]` · `[services/catalog-service]` · `[UC-V09]`
- **Como** dueño en plan Negocio+, **quiero** crear y desactivar promociones validando que mi plan tenga `features.promotions = true`, **para** impulsar ventas en días específicos.
```gherkin
Escenario: Tienda en plan Tendero recibe 403 al intentar crear una promoción
  Dado una tienda en plan "TENDERO" ("features.promotions = false")
  Cuando intenta llamar a "POST /v1/app/promotions"
  Entonces recibe "403 FEATURE_NOT_IN_PLAN"
```

### - [ ] HU-398: Endpoints `GET/POST/PATCH /v1/app/customers` — Gestión de clientes validando límite `max_credit_customers` al activar `credit_enabled`
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/customer-service]` · `[UC-K02, Doc 10 §2.1]`
- **Como** `customer-service`, **quiero** permitir crear clientes ilimitados de contado en cualquier plan, pero validar el tope `max_credit_customers` (50 en plan Tendero) cuando se activa `credit_enabled = true`, **para** aplicar el límite comercial del plan Tendero.
```gherkin
Escenario: Bloqueo al intentar habilitar el cliente número 51 con cupo de fiado en el plan Tendero
  Dado una tienda en plan "TENDERO" ("max_credit_customers = 50") que ya tiene 50 clientes con "credit_enabled = true"
  Cuando intenta activar "credit_enabled = true" en el cliente 51
  Entonces recibe "403 CREDIT_CUSTOMERS_LIMIT_REACHED"
```

### - [ ] HU-399: Endpoint `PATCH /v1/app/customers/{id}/credit` y `POST /v1/app/customers/{id}/write-off` — Cambio de cupo/modo y castigo de cartera con Step-up MFA
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[services/customer-service]` · `[UC-K02, UC-K06]`
- **Como** dueño de tienda, **quiero** modificar el cupo de crédito de un cliente o castigar una deuda incobrable exigiendo Step-up MFA y motivo obligatorio, **para** proteger los saldos de cartera.
```gherkin
Escenario: Castigo de cartera deja el saldo en cero e inserta movimiento WRITE_OFF auditado
  Dado un cliente con saldo de $60.000
  Cuando el dueño ejecuta "POST /v1/app/customers/{id}/write-off" con MFA reciente y motivo "Cliente se mudó de ciudad"
  Entonces se inserta un movimiento "WRITE_OFF" por -$60.000, el saldo pasa a $0 y se audita la operación
```

### - [ ] HU-400: Endpoints `GET/POST/PATCH/DELETE /v1/app/suppliers` y `POST /v1/app/inventory/receipts` — Proveedores y entradas de almacén
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/inventory-service]` · `[UC-I04, HU-089]`
- **Como** administrador, **quiero** gestionar mi directorio de proveedores y registrar entradas de mercancía con número de remisión/factura, **para** alimentar las existencias y costos.
```gherkin
Escenario: Registro de entrada de mercancía suma existencias en la bodega de la sucursal
  Cuando envío "POST /v1/app/inventory/receipts" con 3 líneas de productos para la Sucursal 1
  Entonces se insertan 3 movimientos "RECEIPT" en la bodega principal de la Sucursal 1 y se publican los nuevos niveles de stock
```

### - [ ] HU-401: Endpoints `POST /v1/app/inventory/adjustments` y `POST /v1/app/inventory/counts` — Ajustes y conteos validando feature `inventory_full`
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/inventory-service]` · `[UC-I05, UC-I06]`
- **Como** dueño en plan Negocio+, **quiero** registrar mermas y conteos físicos desde la App de Gestión validando el permiso `inventory.manage` y la feature `inventory_full`, **para** mantener mi inventario exacto.
```gherkin
Escenario: Rechazo de ajuste sin motivo o con cantidad cero
  Cuando se envía un ajuste en "POST /v1/app/inventory/adjustments" con cantidad 0 o sin justificación
  Entonces responde "400 VALIDATION_ERROR"
```

### - [ ] HU-402: Endpoints `GET/POST /v1/app/inventory/transfers` y `POST /v1/app/inventory/transfers/{id}/receive` — Traslados entre sucursales (plan Multi-tienda)
- **Meta:** `[Hito 6]` · `[P2]` · `[2 pts]` · `[services/inventory-service]` · `[UC-I07, HU-092]`
- **Como** administrador en plan Multi-tienda, **quiero** crear un traslado en tránsito y confirmarlo en la sucursal destino, **para** mover mercancía entre mis locales sin perder trazabilidad.
```gherkin
Escenario: Confirmación de recepción de traslado suma unidades en la bodega destino
  Dado un traslado en estado "IN_TRANSIT" hacia la bodega "W2"
  Cuando el administrador de la sucursal destino invoca "POST /v1/app/inventory/transfers/{id}/receive"
  Entonces se insertan los movimientos "TRANSFER_IN" en "W2" y el estado cambia a "RECEIVED"
```

### - [ ] HU-403: Endpoints `GET /v1/app/payments/reconciliation` y `POST /v1/app/payments/reconciliation/batch` — Conciliación de pagos digitales
- **Meta:** `[Hito 5]` · `[P0]` · `[1 pt]` · `[services/sales-service]` · `[UC-V20, HU-085]`
- **Como** dueño de tienda, **quiero** filtrar los pagos digitales por estado (`PENDING`, `CONFIRMED`, `FAILED`), fecha, caja y método, y actualizar su estado en lote, **para** conciliar rápido mis billeteras digitales.
```gherkin
Escenario: Actualización en lote de 10 pagos a CONFIRMED
  Cuando envío "POST /v1/app/payments/reconciliation/batch" con 10 IDs de pago y "status = CONFIRMED"
  Entonces los 10 registros se actualizan en una sola transacción y se audita el cambio
```

### - [ ] HU-404: Endpoints `GET /v1/app/quarantine` y `POST /v1/app/quarantine/{id}/resolve` — Bandeja y resolución de cuarentena de sincronización
- **Meta:** `[Hito 4 / 5]` · `[P1]` · `[1 pt]` · `[services/sync-service]` · `[Doc 08 §3, HU-067]`
- **Como** administrador, **quiero** inspeccionar cualquier evento puesto en cuarentena y marcarlo como `RESOLVED` (reaplicándolo con la corrección) o `DISCARDED` con justificación, **para** cerrar anomalías de sincronización.
```gherkin
Escenario: Resolución de un evento en cuarentena cambia su estado y registra auditoría
  Dado un registro en "sync_quarantine" con "status = OPEN"
  Cuando ejecuto "POST /v1/app/quarantine/{id}/resolve"
  Entonces pasa a "RESOLVED" y se registra quién lo resolvió en "audit-service"
```

### - [ ] HU-405: Endpoints de Consola Super Admin para Gestión de Tiendas: `GET /v1/platform/tenants`, `GET /v1/platform/tenants/{id}`, `POST /v1/platform/tenants/{id}/suspend` y `/reactivate`
- **Meta:** `[Hito 3 / 6]` · `[P0]` · `[2 pts]` · `[services/bff-platform, services/tenant-service]` · `[UC-P04c, UC-P06]`
- **Como** super admin, **quiero** listar y filtrar todas las tiendas de la plataforma y poder suspender o reactivar manualmente una tienda indicando el motivo obligatorio, **para** administrar el ciclo de vida de cada cliente.
```gherkin
Escenario: Suspensión manual desde la consola registra motivo y notifica a device-service
  Cuando el super admin invoca "POST /v1/platform/tenants/{id}/suspend" con motivo "Solicitud temporal del cliente por remodelación"
  Entonces el tenant pasa a "SUSPENDED", se guarda en "tenant_status_history" y se registra en "audit_log"
```

### - [ ] HU-406: Endpoints de Consola Super Admin para Cobros y Prórrogas: `GET /v1/platform/billing/invoices`, `POST .../payments`, `POST .../retry-charge` y `POST /v1/platform/tenants/{id}/grace-extensions`
- **Meta:** `[Hito 6]` · `[P0]` · `[2 pts]` · `[services/bff-platform, services/tenant-service]` · `[UC-P04b, Doc 08 §4]`
- **Como** super admin, **quiero** consultar facturas vencidas, registrar pagos manuales, reintentar un cobro automático o conceder una prórroga validando el máximo de 2 prórrogas anuales por tienda, **para** gestionar la facturación del SaaS.
```gherkin
Escenario: Rechazo de una tercera prórroga en el mismo año salvo confirmación de override de super admin
  Dado una tienda que ya recibió 2 prórrogas en los últimos 12 meses
  Cuando se intenta otorgar una tercera prórroga estándar
  Entonces el servicio advierte que se alcanzó el límite anual de 2 prórrogas
```

### - [ ] HU-407: Endpoints de Activación de Edición Local: `POST /v1/local-activation/deactivate`, `POST /v1/local-activation/refresh`, `POST /v1/local-activation/admin-reset` y `GET /v1/local-activation/admin-reset/{id}`
- **Meta:** `[Hito L]` · `[P0]` · `[2 pts]` · `[services/device-service]` · `[Doc 08 §3c, Doc 10 §4]`
- **Como** equipo con Edición Local, **quiero** que todas las peticiones de desactivación, refresco de `updates_until` y solicitud de restablecimiento de clave vayan firmadas criptográficamente con la llave privada Ed25519 del equipo y un timestamp de ±5 minutos, **para** que nadie pueda desactivar ni pedir reset de una licencia ajena.
```gherkin
Escenario: Solicitud de desactivación con firma inválida o timestamp antiguo es rechazada
  Dado una petición a "POST /v1/local-activation/deactivate" cuya firma no corresponde a "device_pubkey" de la activación activa
  Cuando "device-service" la verifica
  Entonces responde "401 INVALID_DEVICE_SIGNATURE" y mantiene la activación intacta
```

---

## Desglose Atómico de Infraestructura Terraform, Alertas, Runbooks y Operación en Producción (HU-408 a HU-445)

### - [ ] HU-408: Módulo Terraform `network` — VPC multi-AZ (3 AZ en `us-east-1`), subredes públicas, privadas de aplicación y privadas aisladas de datos, NAT Gateways y VPC Endpoints (S3, KMS, Secrets Manager, ECR)
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[infra/terraform/network]` · `[Doc 04 §6, Doc 05 §1]`
- **Como** ingeniero de infraestructura, **quiero** que las subredes de datos no tengan ruta hacia Internet Gateway ni NAT Gateway y que los servicios consuman S3, KMS y Secrets Manager por VPC Endpoints privados, **para** aislar las bases de datos y reducir costos de transferencia.
```gherkin
Escenario: Subred de datos carece de ruta hacia internet público
  Cuando se inspecciona la tabla de enrutamiento de las subredes "private-data-*" en Terraform
  Entonces solo contiene rutas locales dentro de la VPC y ninguna ruta "0.0.0.0/0"
```

### - [ ] HU-409: Módulo Terraform `database` — Clúster Aurora PostgreSQL 16 Multi-AZ (Writer + Reader), cifrado KMS, backups automáticos (35 días), Performance Insights y Parameter Group con `pg_partman`
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[infra/terraform/database]` · `[Doc 05 §1, §7]`
- **Como** DBA, **quiero** desplegar Aurora PostgreSQL 16 con cifrado en reposo KMS, `deletion_protection = true`, retención PITR de 35 días y réplica de lectura dedicada para `reporting-service`, **para** cumplir los objetivos de RPO ≈ 0 y RTO < 5 minutos ante caída de una zona de disponibilidad.
```gherkin
Escenario: Protección contra borrado accidental y cifrado KMS activos en producción
  Cuando se valida el plan de Terraform del módulo "database" para producción
  Entonces "storage_encrypted", "deletion_protection" y "skip_final_snapshot = false" están activos
```

### - [ ] HU-410: Módulo Terraform `messaging_cache` — Clúster Redpanda / Amazon MSK (TLS + autenticación IAM/SASL) y ElastiCache Redis 7 Multi-AZ con cifrado en tránsito y en reposo
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[infra/terraform/messaging_cache]` · `[Doc 04 §4, Doc 05 §1]`
- **Como** SRE, **quiero** aprovisionar Kafka/Redpanda con factor de replicación 3 (`min.insync.replicas = 2`) y ACLs por servicio, junto con Redis 7 con failover automático, **para** que la pérdida de un nodo no detenga la mensajería ni el rate limiting.
```gherkin
Escenario: Cada microservicio solo tiene permiso ACL para escribir en sus propios tópicos de Kafka
  Dado el usuario IAM/SASL de "catalog-service"
  Cuando intenta publicar por error en el tópico "pos.events" (propiedad exclusiva de "sync-service")
  Entonces el broker rechaza la escritura con "TopicAuthorizationException"
```

### - [ ] HU-411: Módulo Terraform `storage_kms` — Buckets S3 privados (`bootstrap`, `exports`, `billing-receipts`, `audit-worm`, `einvoicing-worm` futuro) con bloqueo de acceso público, cifrado KMS y ciclo de vida a Glacier
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[infra/terraform/storage_kms]` · `[Doc 02 §6, Doc 04 §4]`
- **Como** oficial de seguridad, **quiero** que todos los buckets S3 tengan `block_public_acls = true`, `block_public_policy = true`, versionado activo, replicación cross-region para los críticos y Object Lock en modo *Compliance* para auditoría y documentos fiscales, **para** impedir fugas por buckets públicos o borrado de soportes.
```gherkin
Escenario: Bloqueo total de acceso público en todos los buckets S3
  Cuando se ejecuta un escaneo de configuración AWS (tfsec / Checkov) sobre el módulo S3
  Entonces todos los buckets tienen los 4 controles de "aws_s3_bucket_public_access_block" en "true"
```

### - [ ] HU-412: Módulo Terraform `edge_cloudflare` — DNS, TLS 1.3, HSTS, WAF (OWASP Core Rule Set + reglas para `/v1/sync/*` y `/v1/local-activation/*`), Bot Management y *Authenticated Origin Pulls*
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[infra/terraform/edge]` · `[Doc 04 §6, Doc 05 §2]`
- **Como** ingeniero de seguridad, **quiero** gestionar en Terraform todas las reglas de Cloudflare WAF, bloqueo de tráfico no TLS 1.2/1.3 y certificados mutuos con el ALB de origen, **para** filtrar ataques DDoS e inyecciones antes de que lleguen a AWS.
```gherkin
Escenario: Petición con payload de inyección SQL en query string es bloqueada en el borde por Cloudflare WAF
  Cuando un cliente externo envía una petición con patrones SQLi a "https://api.tienditaonline.co"
  Entonces Cloudflare WAF la bloquea con código 403 en el borde sin llegar al API Gateway
```

### - [ ] HU-413: Despliegue automatizado Canary / Blue-Green con rollback automático si la tasa de errores 5xx supera el 1 % o la latencia `p95` se duplica durante los primeros 10 minutos
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[ci, infra]` · `[Doc 05 §1]`
- **Como** SRE, **quiero** que cada despliegue a producción envíe primero el 10 % del tráfico a la versión nueva durante 5 minutos, evalúe las métricas de Prometheus y haga rollback automático si suben los errores, **para** desplegar de forma continua sin afectar a las tiendas.
```gherkin
Escenario: Rollback automático de versión canary que introduce errores 500
  Dado un despliegue canary al 10 % cuya nueva versión empieza a devolver 3 % de respuestas 500
  Cuando el controlador evalúa la métrica de tasa de error
  Entonces aborta inmediatamente el rollout y devuelve el 100 % del tráfico a la versión estable anterior
```

---

## Desglose Atómico de Experiencia de Usuario, Estados de Pantalla, Resiliencia y Validaciones Finales (HU-414 a HU-505)

### - [ ] HU-414: Caja POS — Atajo rápido de teclado para cambiar el medio de pago en el modal de cobro (`1` Efectivo, `2` Nequi, `3` Daviplata, `4` Bre-B, `5` Datáfono, `6` Fiado, `7` Mixto)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-V01, UC-V02]`
- **Como** cajero, **quiero** elegir el medio de pago presionando una sola tecla numérica cuando se abre el modal de cobro, **para** cobrar por Nequi o Fiado sin usar el ratón.
```gherkin
Escenario: Selección de Nequi con tecla rápida en el modal de cobro
  Dado que abro el modal de cobro con "F10"
  Cuando presiono la tecla "2"
  Entonces se selecciona el medio de pago "NEQUI" y el foco pasa al campo de referencia
```

### - [ ] HU-415: Caja POS — Calculadora integrada de "Desglose por peso o por valor" (cuando el cliente pide *"deme $2.000 de salchichón"* o *"deme $3.000 de queso"*)
- **Meta:** `[Hito 2]` · `[P0]` · `[2 pts]` · `[apps/pos]` · `[UC-V05, Retail Colombia]`
- **Como** tendero colombiano cuando un cliente no pide por gramos sino por plata (*"deme $3.000 de mortadela"*), **quiero** digitar `$3.000` en el producto por peso y que la caja calcule automáticamente cuántos gramos debo cortarle (`3000 / precio_kilo`) y descuente esos gramos exactos del inventario, **para** atender la forma más común de comprar en tiendas de barrio.
```gherkin
Escenario: Venta de producto por peso ingresando el valor en pesos que pide el cliente
  Dado el producto "Salchichón Cervecero" con precio de $20.000/kg
  Cuando el cajero elige "Vender por valor en $" y digita "$3.000"
  Entonces la caja muestra "Entregar al cliente: 150 gramos", agrega 0,150 kg por $3.000 al carrito y descuenta 150 g del stock
```

### - [ ] HU-416: Caja POS — Alerta cuando el efectivo digitado como "Recibido" parece un error de digitación (ej. digitar `$500.000` en lugar de `$50.000` para una compra de `$4.000`)
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[UC-V01]`
- **Como** cajero, **quiero** que si para una venta de $4.000 digito por error que me entregaron $500.000 (un cero de más), la caja me pida confirmar `"¿Recibiste $ 500.000? El cambio sería $ 496.000"`, **para** no dañar el registro de efectivo recibido y cambio entregado del turno.
```gherkin
Escenario: Confirmación preventiva cuando el efectivo recibido supera el billete de mayor denominación ($100.000) y el cambio es mayor a $100.000
  Dado una venta por $4.000
  Cuando el cajero digita en efectivo recibido "$500.000"
  Entonces aparece la advertencia pidiendo confirmar si el monto recibido es correcto antes de cerrar la venta
```

### - [ ] HU-417: Caja POS — Vista rápida de "Consultar Precio" (`F3`) sin agregar el producto al carrito
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos]` · `[UC-V01]`
- **Como** cajero cuando un cliente se acerca solo a preguntar *"¿a cómo está este aceite?"*, **quiero** presionar `F3 Consultar precio` y escanear el producto para ver su precio en letras gigantes sin ensuciar el carrito que estoy cobrando ni generar un registro de "ítem eliminado del carrito", **para** no activar falsas alarmas de auditoría por consultas de precio.
```gherkin
Escenario: Consulta de precio con F3 no modifica el carrito actual ni dispara auditoría de ítem borrado
  Dado que tengo una venta en curso en el carrito
  Cuando presiono "F3" y escaneo un producto
  Entonces muestra en grande el nombre y el precio del producto durante 5 segundos (o hasta presionar Esc) sin agregarlo al carrito
```

### - [ ] HU-418: Caja POS — Impresión opcional de "Tiquete de Regalo / Cambio sin precios"
- **Meta:** `[Hito 5]` · `[P2]` · `[1 pt]` · `[apps/pos/devices]` · `[UC-V01]`
- **Como** cajero en una papelería, miscelánea o tienda de barrio, **quiero** poder imprimir una tirilla de cambio que muestre el consecutivo, la fecha y los productos con sus cantidades pero sin los precios, **para** cuando el cliente compra un detalle para regalar.
```gherkin
Escenario: Impresión de comprobante de cambio ocultando los valores en pesos
  Cuando selecciono "Imprimir tiquete de cambio (sin precios)" al finalizar una venta
  Entonces se imprime el comprobante con el consecutivo y las unidades sin mostrar los montos
```

### - [ ] HU-419: Caja POS — Validación de que el monto de un retiro parcial (*Safe Drop*) o salida de efectivo no supere el saldo teórico disponible en gaveta
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos/cash]` · `[UC-C03, UC-C04]`
- **Como** sistema de control de efectivo, **quiero** impedir que se registre una salida de efectivo de caja por $300.000 si en la gaveta solo hay $120.000 teóricos en el turno, **para** evitar que registren salidas irreales que distorsionen el arqueo.
```gherkin
Escenario: Rechazo de salida de efectivo mayor al dinero disponible en el turno
  Dado un turno donde el efectivo teórico actual en gaveta es $120.000
  Cuando se intenta registrar una salida "CASH_OUT" por $200.000
  Entonces el núcleo Rust rechaza la operación indicando que supera el efectivo disponible en caja
```

### - [ ] HU-420: Caja POS — Recordatorio al cerrar turno si existen carritos en espera (`parked_carts`) sin cobrar
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[UC-C05, UC-V11]`
- **Como** cajero que va a cerrar su turno, **quiero** que la caja me avise si dejé carritos suspendidos en espera y me permita cobrarlos o descartarlos antes de pasar al arqueo ciego, **para** no dejar cuentas olvidadas.
```gherkin
Escenario: Aviso de carritos en espera antes de iniciar el arqueo de cierre
  Dado que existen 2 registros en "parked_carts"
  Cuando el cajero presiona "Cerrar turno"
  Entonces el sistema le muestra los 2 carritos en espera para que decida recuperarlos o descartarlos
```

### - [ ] HU-421: App de Gestión — Clonación rápida de un producto existente ("Duplicar producto" cambiando solo sabor/tamaño y código de barras)
- **Meta:** `[Hito 3]` · `[P1]` · `[1 pt]` · `[packages/admin-ui]` · `[UC-I01]`
- **Como** tendero que vende la misma gaseosa o paquete de papas en 6 sabores al mismo precio y costo, **quiero** un botón "Duplicar producto" que copie categoría, marca, precio, costo e impuestos y solo me pida cambiar el sabor en el nombre y escanear el código del nuevo sabor, **para** crear familias de productos 5 veces más rápido.
```gherkin
Escenario: Duplicación de producto copia atributos comerciales y limpia el código de barras
  Dado el producto "Papas Margarita Pollo 25g" con precio $2.200 y costo $1.650
  Cuando toco "Duplicar"
  Entonces se abre un formulario nuevo con precio $2.200, costo $1.650, misma categoría e impuestos, dejando vacío el código de barras para escanear el nuevo sabor
```

### - [ ] HU-422: App de Gestión — Buscador de productos con filtro de "Margen negativo o precio menor al costo"
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[packages/admin-ui]` · `[UC-I01, UC-R07]`
- **Como** dueño de tienda, **quiero** que cuando sube el costo de compra en una recepción de mercancía y queda mayor o muy cercano al precio de venta actual, el sistema me resalte en rojo ese producto y me ofrezca actualizar el precio de venta ahí mismo, **para** no vender a pérdida sin darme cuenta.
```gherkin
Escenario: Alerta automática en recepción cuando el nuevo costo de compra supera el precio de venta actual
  Dado un producto cuyo precio de venta actual es $2.500
  Cuando en una recepción de mercancía ingreso que el nuevo costo unitario de compra es $2.600
  Entonces la línea muestra la alerta "¡Atención! El costo ($2.600) supera el precio de venta actual ($2.500)" y permite ajustar el nuevo precio de venta en el mismo paso
```

### - [ ] HU-423: App de Gestión — Historial de movimientos de inventario (Kardex) por producto con filtro por fecha y tipo de movimiento
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/inventory-service, packages/admin-ui]` · `[Doc 02, UC-I05]`
- **Como** dueño de tienda cuando no me cuadra la cantidad de un producto, **quiero** abrir el **Kardex** de ese producto y ver en orden cronológico cada entrada de proveedor, cada venta, cada devolución, cada ajuste por merma y cada conteo físico con fecha, hora y usuario responsable, **para** encontrar exactamente dónde estuvo la diferencia.
```gherkin
Escenario: Consulta del Kardex completo de un producto
  Cuando abro la pestaña "Movimientos (Kardex)" dentro de la ficha de un producto
  Entonces veo la lista paginada de "stock_movements" mostrando cantidad con signo, tipo de movimiento, usuario y saldo resultante
```

### - [ ] HU-424: App de Gestión — Historial de cambios de precio de un producto (quién lo cambió, cuándo y de qué valor a qué valor)
- **Meta:** `[Hito 5]` · `[P2]` · `[1 pt]` · `[services/audit-service, packages/admin-ui]` · `[UC-R04]`
- **Como** dueño de tienda, **quiero** ver dentro de la ficha de un producto el historial de sus cambios de precio recientes, **para** auditar cuándo subió o bajó y quién hizo el cambio.
```gherkin
Escenario: Visualización de los últimos cambios de precio en la ficha del producto
  Cuando abro "Historial de precios" en un producto
  Entonces muestra las entradas de auditoría "catalog.price.updated" con fecha, usuario, precio anterior y precio nuevo
```

### - [ ] HU-425: App de Gestión — Exportación e impresión de lista de precios y códigos rápidos para pegar en el mostrador
- **Meta:** `[Hito 5]` · `[P2]` · `[1 pt]` · `[packages/admin-ui]` · `[Retail Colombia]`
- **Como** tendero, **quiero** generar un PDF de una hoja con los productos sin código de barras (frutas, verduras, panadería, sueltos) y sus precios/códigos cortos para plastificarlo al lado de la caja, **para** facilitar el trabajo de un cajero nuevo.
```gherkin
Escenario: Generación de hoja PDF de consulta rápida para el mostrador
  Cuando presiono "Imprimir tabla de productos rápidos para mostrador"
  Entonces se genera un PDF limpio agrupado por categoría con nombre, código corto y precio vigente
```

---

## Desglose Atómico de Alertas Prometheus, Runbooks, Pruebas de Carga y Validaciones de Lanzamiento (HU-426 a HU-505)

### - [ ] HU-426: Regla de alerta Prometheus `SyncPushHighLatency` y `SyncPushErrorRate` (`p99 > 800 ms` o `5xx > 0.5 %` por 5 min)
- **Meta:** `[Hito 7]` · `[P0]` · `[1 pt]` · `[infra/monitoring]` · `[Doc 05 §6]`
- **Como** SRE en guardia, **quiero** una alerta crítica si la ingesta de sincronización se degrada, **para** proteger el SLO de 99,9 % de `/v1/sync/push`.
```gherkin
Escenario: Disparo de alerta cuando el p99 de /v1/sync/push supera 800 ms durante 5 minutos
  Dado que la métrica "http_request_duration_seconds_bucket{route='/v1/sync/push'}" supera 0.8 s en el percentil 99 por 5 minutos
  Cuando Alertmanager evalúa la regla
  Entonces envía alerta crítica con enlace directo al dashboard de "sync-service"
```

### - [ ] HU-427: Regla de alerta Prometheus `KafkaConsumerLagHigh` (lag > 5 minutos en `pos.events` para cualquier grupo consumidor)
- **Meta:** `[Hito 7]` · `[P0]` · `[1 pt]` · `[infra/monitoring]` · `[Doc 05 §5, §6]`
- **Como** SRE, **quiero** que si algún consumidor (`sales`, `inventory`, `cash`, `customer`, `reporting`) se atrasa más de 5 minutos procesando `pos.events`, se escale automáticamente y me avise si no baja, **para** cumplir el SLO de frescura de reportes (< 60 s).
```gherkin
Escenario: Alerta por atraso en el grupo consumidor de reporting-service
  Dado que el lag estimado del consumer group de "reporting-service" supera los 300 segundos
  Entonces se dispara la alerta "KafkaConsumerLagHigh" indicando el servicio afectado
```

### - [ ] HU-428: Regla de alerta Prometheus `OutboxBacklogGrowing` (filas con `published_at IS NULL` > 1.000 o con más de 2 minutos de antigüedad en cualquier servicio)
- **Meta:** `[Hito 7]` · `[P0]` · `[1 pt]` · `[infra/monitoring]` · `[Doc 05 §5]`
- **Como** SRE, **quiero** detectar de inmediato si el `OutboxRelay` de cualquier microservicio deja de publicar hacia Kafka, **para** actuar antes de que se retrasen los eventos de dominio.
```gherkin
Escenario: Alerta cuando se acumulan eventos sin publicar en la tabla outbox de un servicio
  Dado que en "catalog_db.outbox" hay filas con "published_at IS NULL" creadas hace más de 2 minutos
  Entonces se dispara la alerta "OutboxBacklogGrowing" para "catalog-service"
```

### - [ ] HU-429: Regla de alerta Prometheus `AuditChainIntegrityBroken` si el verificador nocturno detecta alteración en la cadena SHA-256 de `audit_log`
- **Meta:** `[Hito 7]` · `[P0]` · `[1 pt]` · `[services/audit-service, infra/monitoring]` · `[Doc 04 §8]`
- **Como** oficial de seguridad, **quiero** que el job nocturno que recalcula la cadena `prev_hash -> hash` de `audit_log` dispare una alerta de severidad máxima si un solo hash no coincide, **para** detectar cualquier intento de manipulación interna o externa.
```gherkin
Escenario: Detección inmediata de ruptura en la cadena de hashes de auditoría
  Dado que el verificador nocturno encuentra una fila cuyo "hash" no coincide con "SHA256(prev_hash || data)"
  Entonces expone la métrica "audit_chain_errors_total > 0" y dispara alerta crítica de seguridad
```

### - [ ] HU-430: Regla de alerta Prometheus `SecurityHashConflictInSync` cuando `sync-service` detecta el mismo `event_id` con distinto `payload_hash`
- **Meta:** `[Hito 7]` · `[P0]` · `[1 pt]` · `[services/sync-service, infra/monitoring]` · `[Doc 03 §4, UC-E18]`
- **Como** oficial de seguridad, **quiero** una alerta inmediata si una terminal envía un evento con un `event_id` ya registrado pero cuyo contenido fue modificado, **para** investigar posible manipulación de una terminal.
```gherkin
Escenario: Alerta de seguridad ante conflicto de payload_hash
  Cuando "sync-service" responde con "CONFLICT" por diferencia de "payload_hash"
  Entonces incrementa "sync_payload_hash_conflict_total" y notifica en la consola del super admin
```

### - [ ] HU-431: Runbook documentado RB-01 — "Qué hacer cuando el lag de Kafka en `pos.events` sube o un microservicio consumidor cae"
- **Meta:** `[Hito 7]` · `[P1]` · `[1 pt]` · `[docs]` · `[Doc 09 §6]`
- **Como** ingeniero de guardia, **quiero** un runbook con los comandos exactos para diagnosticar el consumidor lento, verificar bloqueos en PostgreSQL, escalar réplicas y validar que el lag drene, **para** resolver el incidente sin dudar.
```gherkin
Escenario: Validación del runbook RB-01 durante el simulacro de Chaos Testing
  Cuando un ingeniero sigue los pasos del runbook RB-01 durante una prueba de caída de consumidor
  Entonces restablece el servicio y verifica la convergencia de datos en menos de 15 minutos
```

### - [ ] HU-432: Runbook documentado RB-02 — "Inspección, corrección y reprocesamiento de mensajes en Dead Letter Topics (`*.dlt`)"
- **Meta:** `[Hito 7]` · `[P1]` · `[1 pt]` · `[docs]` · `[Doc 09 §6]`
- **Como** ingeniero de guardia, **quiero** el procedimiento paso a paso para analizar un mensaje en DLT desde la consola, desplegar un fix si fue un bug o moverlo a cuarentena y republicarlo de forma idempotente, **para** que ningún evento de una tienda se pierda jamás.
```gherkin
Escenario: Aplicación del runbook RB-02 deja la bandeja DLT en cero sin duplicar efectos
  Cuando se aplica el procedimiento RB-02 sobre un mensaje de prueba en DLT
  Entonces el mensaje se procesa correctamente y el contador de DLT vuelve a 0
```

### - [ ] HU-433: Runbook documentado RB-03 — "Caja con eventos acumulados en Outbox por más de 24 horas o con error `GAP_DETECTED`"
- **Meta:** `[Hito 7]` · `[P1]` · `[1 pt]` · `[docs]` · `[Doc 09 §6, UC-E17]`
- **Como** agente de soporte, **quiero** una guía clara para asistir a un tendero cuya caja lleva más de 24 horas sin sincronizar (verificar red, reloj del PC, estado de licencia y herramienta de reconciliación de secuencia), **para** recuperar la sincronización sin perder sus ventas locales.
```gherkin
Escenario: Resolución guiada de caja sin sincronizar siguiendo RB-03
  Dado un caso de soporte de una caja desconectada por desfase de reloj o red
  Cuando se siguen los pasos de diagnóstico de RB-03 en la ventana "Estado de Sincronización" de la caja
  Entonces el outbox pendiente se transmite por completo y el semáforo de la caja vuelve a verde
```

### - [ ] HU-434: Runbook documentado RB-04 — "Rotación de llaves criptográficas (KMS de licencias, secretos OIDC/JWT y certificados TLS)"
- **Meta:** `[Hito 7]` · `[P1]` · `[1 pt]` · `[docs]` · `[Doc 09 §6]`
- **Como** ingeniero de seguridad, **quiero** el procedimiento probado para agregar un nuevo `kid` de llave pública en las apps antes de cambiar la llave activa de firma en KMS, **para** rotar llaves sin invalidar ni una sola caja offline ni licencia local.
```gherkin
Escenario: Rotación de llave de firma con período de coexistencia de dos kids
  Cuando se rota la llave activa en KMS hacia un "kid" ya distribuido en la lista de llaves públicas de las apps
  Entonces tanto las licencias firmadas con el "kid" anterior como las nuevas son aceptadas sin interrupción
```

### - [ ] HU-435: Runbook documentado RB-05 — "Failover de base de datos Aurora/PostgreSQL y restauración PITR ante desastre"
- **Meta:** `[Hito 7]` · `[P0]` · `[1 pt]` · `[docs]` · `[Doc 05 §7, Doc 09 §6]`
- **Como** SRE, **quiero** el runbook paso a paso para ejecutar un failover controlado o una restauración a un punto en el tiempo (PITR) y verificar la reconciliación automática con el outbox de las cajas, **para** cumplir el RTO y RPO comprometidos.
```gherkin
Escenario: Ejecución de failover de instancia Writer a Reader en menos de 60 segundos
  Cuando se dispara un failover controlado del clúster Aurora en staging
  Entonces PgBouncer y los servicios reconectan al nuevo Writer en menos de 60 segundos y los reintentos de las cajas no pierden ninguna transacción
```

---

## Desglose Atómico de Pruebas de Aceptación por Rol, Plan y Flujo Comercial antes de Salir al Público (HU-436 a HU-505)

### - [ ] HU-436: Certificación E2E del Plan `TENDERO` ($34.900/mes): 1 sucursal, 1 caja, Dueño + 1 Cajero, 3.000 productos, 50 clientes con fiado, autoaprobación del dueño con PIN
- **Meta:** `[Hito 6 / 7]` · `[P0]` · `[2 pts]` · `[tests/e2e]` · `[Doc 10 §2.1]`
- **Como** QA, **quiero** una prueba E2E que certifique todas las reglas del plan `TENDERO` (permite hasta 1 sucursal, 1 caja, 2 usuarios, 3.000 productos y 50 fiados, permite al dueño autoaprobar en caja y bloquea promociones, traslados y roles extra), **para** garantizar que el plan de entrada funcione exactamente como se vende.
```gherkin
Escenario: Verificación integral de límites y capacidades del plan TENDERO
  Dado un tenant activo con el plan "TENDERO"
  Cuando corre la suite de certificación del plan Tendero
  Entonces permite operar todo el flujo de tienda pequeña y rechaza con "403" crear una segunda caja, un tercer usuario o el producto 3.001
```

### - [ ] HU-437: Certificación E2E del Plan `NEGOCIO` ($79.900/mes): 2 cajas, 7 usuarios, rol Supervisor y Contador, inventario completo, conteos con cámara, promociones, auditoría y exportación Excel
- **Meta:** `[Hito 6 / 7]` · `[P0]` · `[2 pts]` · `[tests/e2e]` · `[Doc 10 §2.1]`
- **Como** QA, **quiero** certificar que en el plan `NEGOCIO` dos cajas sincronicen ventas sobre el mismo inventario, el supervisor apruebe anulaciones de los cajeros (`approved_by != requested_by`), funcionen las promociones, los ajustes/conteos y la exportación a Excel, **para** garantizar el plan de minimercados.
```gherkin
Escenario: Certificación completa del plan NEGOCIO con 2 cajas vendiendo concurrentemente
  Dado un tenant activo con el plan "NEGOCIO" y 2 cajas enroladas
  Cuando ambas cajas venden offline y sincronizan
  Entonces el stock, los turnos, la auditoría y los reportes exportables reflejan las operaciones de ambas cajas sin discrepancias
```

### - [ ] HU-438: Certificación E2E del Plan `MULTITIENDA` ($149.900/mes): múltiples sucursales, Admin de Sucursal, traslados entre bodegas, roles personalizados y reportes comparativos
- **Meta:** `[Hito 6 / 7]` · `[P1]` · `[2 pts]` · `[tests/e2e]` · `[Doc 10 §2.1]`
- **Como** QA, **quiero** certificar que en el plan `MULTITIENDA` un `BRANCH_ADMIN` solo vea y administre su sucursal asignada mientras el `OWNER` ve el consolidado y ejecuta traslados entre sucursales, **para** garantizar el aislamiento por sucursal y la consolidación global.
```gherkin
Escenario: Aislamiento de sucursal para BRANCH_ADMIN y vista consolidada para OWNER
  Dado un tenant en plan "MULTITIENDA" con "Sucursal Norte" y "Sucursal Sur"
  Cuando inicia sesión el Admin de "Sucursal Norte" solo ve datos del Norte, y cuando inicia sesión el Dueño ve ambas sucursales y su comparativo
```

### - [ ] HU-439: Certificación E2E de la Edición `LOCAL_ESENCIAL` ($449.000 pago único) y `LOCAL_PLUS` ($749.000 pago único) en PC sin tarjeta de red tras la activación
- **Meta:** `[Hito L / 7]` · `[P0]` · `[3 pts]` · `[tests/e2e]` · `[Doc 10 §4]`
- **Como** QA, **quiero** activar una instancia de `LOCAL_ESENCIAL` y otra de `LOCAL_PLUS`, deshabilitar por completo la interfaz de red de la máquina virtual y ejecutar ventas, arqueos, administración con contraseña, generación de `.tdbak` y restauración completa, verificando que no haya ningún intento de conexión de red en segundo plano, **para** certificar el producto de pago único.
```gherkin
Escenario: Operación de la Edición Local con el adaptador de red deshabilitado tras la activación inicial
  Dado un equipo donde se activó en línea la licencia "LOCAL_PLUS" y luego se deshabilitó el adaptador de red del sistema operativo
  Cuando se operan 5 turnos completos, se administran productos, se exporta un reporte a Excel, se genera un respaldo ".tdbak" y se restaura
  Entonces el 100 % de las funciones operan sin errores y el monitor de red registra 0 paquetes salientes
```

### - [ ] HU-440: Certificación del Ciclo Completo de Mora y Reactivación (Reloj simulado desde D-5 hasta D+60 y reactivación en cada etapa)
- **Meta:** `[Hito 6 / 7]` · `[P0]` · `[2 pts]` · `[tests/e2e]` · `[Doc 10 §3.2]`
- **Como** QA, **quiero** simular día por día desde `D-5` hasta `D+60` verificando cada aviso (`REMINDER`, `NOTICE_1`, `NOTICE_2`, `FINAL`), el paso a `RESTRICTED` en `D+7`, el paso a `SUSPENDED` en `D+15` (tanto en cajas online como en cajas desconectadas), el desbloqueo por prórroga y la reactivación inmediata al pagar, **para** asegurar que el motor de cobro nunca bloquee antes de tiempo ni deje cuentas sin bloquear cuando no pagan.
```gherkin
Escenario: Simulación completa de los 65 días del ciclo de facturación y mora
  Cuando la prueba avanza el reloj del sistema día por día desde D-5 hasta D+60 sin registrar pago
  Entonces cada transición de estado y cada aviso ocurren en el día exacto configurado en "dunning_policies"
```

### - [ ] HU-441: Certificación de Hardware Físico en Laboratorio con el Kit de Referencia de Tienda Colombiana
- **Meta:** `[Hito 2 / 7]` · `[P0]` · `[2 pts]` · `[qa/hardware]` · `[Guía 00 §2, §8]`
- **Como** QA de hardware, **quiero** ejecutar el protocolo físico con la impresora térmica USB de 58 mm y 80 mm, el cajón monedero RJ11, el lector de código de barras 1D/2D y la balanza digital, **para** certificar la lista de hardware recomendado que se les entregará a los tenderos.
```gherkin
Escenario: Impresión continua de 200 comprobantes y 200 aperturas de cajón sin atascos ni pérdida de conexión USB
  Dado el kit de hardware de referencia conectado al PC de pruebas
  Cuando se ejecutan 200 ventas seguidas con impresión y apertura de cajón
  Entonces los 200 comprobantes se imprimen completos con tildes y símbolo "$" correctos y el cajón abre las 200 veces
```

### - [ ] HU-442: Prueba de Usabilidad Cronometrada con 5 Tenderos Reales ("Vender 5 productos en menos de 15 segundos y hacer el arqueo ciego sin ayuda")
- **Meta:** `[Hito 2 / 7]` · `[P0]` · `[2 pts]` · `[producto/ux]` · `[Guía 00 §2, §5]`
- **Como** líder de producto, **quiero** sentar a 5 tenderos reales frente a la caja con una explicación de máximo 5 minutos y medir que puedan abrir turno, vender 5 productos en efectivo, anotar un fiado, recibir un abono y cerrar el turno con arqueo ciego sin bloquearse, **para** corregir cualquier fricción de interfaz antes del lanzamiento.
```gherkin
Escenario: Los 5 tenderos completan las 5 tareas básicas sin intervención del equipo técnico
  Dado un tendero que recibe 5 minutos de introducción básica
  Cuando realiza apertura de turno, venta de 5 ítems, venta fiada, abono y cierre de turno con arqueo ciego
  Entonces completa cada venta en menos de 15 segundos y finaliza el arqueo sin requerir asistencia técnica
```

### - [ ] HU-443: Pentest Externo / Auditoría de Seguridad sobre APIs, Aislamiento Multi-Tenant, App Instalable y Licenciamiento Local con remediación de hallazgos
- **Meta:** `[Hito 7]` · `[P0]` · `[3 pts]` · `[seguridad]` · `[Doc 04 §9, Doc 09 §6]`
- **Como** responsable de seguridad, **quiero** ejecutar pruebas de penetración intentando saltar RLS entre tiendas, falsificar firmas de lotes de sync, manipular el SQLite o el reloj de la caja, clonar una licencia de Edición Local en otro PC y escalar privilegios de `CASHIER` a `OWNER`/`SUPER_ADMIN`, cerrando cualquier hallazgo crítico, alto o medio antes de salir a producción, **para** proteger a todos los comercios afiliados.
```gherkin
Escenario: Cero vulnerabilidades críticas o altas abiertas antes del Go-Live
  Cuando concluye la auditoría de seguridad y pentest y se re-verifican las correcciones aplicadas
  Entonces el informe final reporta 0 vulnerabilidades de severidad Crítica o Alta abiertas
```

### - [ ] HU-444: Operación del Piloto Controlado durante 4 semanas con 5 a 10 tiendas de barrio reales (mezcla de plan SaaS y Edición Local)
- **Meta:** `[Hito 7]` · `[P0]` · `[5 pts]` · `[operacion]` · `[Doc 09 §2, Guía 00 §12]`
- **Como** fundador de TienditaOnline, **quiero** acompañar durante 4 semanas continuas a 5–10 tiendas reales (tiendas de barrio, minimercados, cigarrerías/papelerías) verificando diariamente que todas sus ventas, arqueos, inventarios y fiados cuadren al centavo y midiendo el tiempo de respuesta de soporte, **para** validar el producto en condiciones reales de calle en Colombia.
```gherkin
Escenario: Cuatro semanas de operación real sin pérdida de ventas ni descuadres atribuibles al software
  Dado el grupo de tiendas del piloto operando todos los días durante 4 semanas
  Cuando se auditan los cierres de turno y la sincronización al finalizar la semana 4
  Entonces el 100 % de las ventas registradas en las cajas coinciden con la nube y la satisfacción de los tenderos permite pasar a lanzamiento comercial abierto
```

### - [ ] HU-445: Checklist Final de Go-Live y Apertura Comercial de TienditaOnline (DNS, WAF, backups verificados, pasarela en producción, plantillas de WhatsApp aprobadas, instaladores firmados publicados y soporte activo)
- **Meta:** `[Hito 7]` · `[P0]` · `[2 pts]` · `[lanzamiento]` · `[Doc 09 §6]`
- **Como** fundador y super administrador, **quiero** verificar cada punto de la lista de salida a producción (ambiente `prod` activo, alertas probadas, copias PITR verificadas, pasarela de pagos en modo producción, instaladores firmados de edición Cloud y Local disponibles para descarga, apps publicadas en tiendas móviles y canal de WhatsApp de soporte atendiendo), **para** empezar a vender suscripciones y licencias al público en toda Colombia.
```gherkin
Escenario: Verificación de humo en producción con la primera tienda comercial real
  Dado que todos los ítems del Checklist de Salida a Producción están completados
  Cuando creo la primera tienda comercial en "platform-console", el dueño activa su cuenta, enrola su caja, registra su primera venta y realiza su primer pago de suscripción
  Entonces todo el flujo comercial y técnico en producción opera de extremo a extremo sin errores
```







---

## Desglose Atómico de Migración desde Cuaderno/Excel, Operación Diaria de Mostrador y Cierre del Backlog (HU-446 a HU-505)

### - [ ] HU-446: Importador de Clientes y Saldos Iniciales de Fiado ("Pasar el cuaderno de fiados al sistema") desde Excel o formulario rápido
- **Meta:** `[Hito 3 / 5]` · `[P0]` · `[2 pts]` · `[services/customer-service, packages/admin-ui]` · `[Recomendación #7, UC-K01]`
- **Como** tendero que lleva años anotando los fiados en un cuaderno de papel, **quiero** una pantalla especial de "Cargar saldos iniciales del cuaderno" donde pueda escribir en una tabla continua el nombre/alias del vecino, su celular, su cupo y **cuánto me debe hoy** (generando un movimiento `INITIAL_BALANCE`), **para** pasar mi cuaderno al sistema en media hora el primer día.
```gherkin
Escenario: Carga rápida de clientes con su saldo inicial del cuaderno de fiados
  Dado que ingreso en la tabla rápida a "Doña Marta" con saldo inicial de "$42.000" y cupo de "$100.000"
  Cuando presiono "Guardar saldos iniciales"
  Entonces se crea la clienta y un movimiento "INITIAL_BALANCE" por +$42.000 dejando su saldo en $42.000 en nube y caja
```

### - [ ] HU-447: Importador de Existencias y Costos Iniciales por escaneo o Excel en el arranque de la tienda
- **Meta:** `[Hito 3 / 5]` · `[P0]` · `[2 pts]` · `[services/inventory-service, packages/admin-ui]` · `[UC-I02]`
- **Como** dueño de tienda recién creada, **quiero** cargar las unidades iniciales que tengo hoy en mi estantería junto con su costo unitario inicial (`INITIAL_STOCK`), **para** que el inventario arranque cuadrado desde el día 1.
```gherkin
Escenario: Registro de inventario inicial genera movimientos INITIAL_STOCK
  Cuando confirmo el inventario inicial de un producto con 24 unidades a $1.800 de costo
  Entonces se inserta el movimiento "INITIAL_STOCK" por +24 y "on_hand" queda en 24 con "avg_cost = $1.800"
```

### - [ ] HU-448: Normalización de búsqueda sin tildes, mayúsculas/minúsculas ni caracteres especiales en Caja y App de Gestión
- **Meta:** `[Hito 2 / 3]` · `[P0]` · `[1 pt]` · `[apps/pos, services/catalog-service]` · `[UC-V01]`
- **Como** cajero o tendero, **quiero** que buscar `"atun"`, `"jabon"` o `"dona marta"` encuentre `"Atún"`, `"Jabón"` y `"Doña Marta"`, **para** que las tildes o la `ñ` nunca impidan encontrar un producto o cliente.
```gherkin
Escenario: Búsqueda insensible a tildes y mayúsculas
  Dado el producto "Café Águila Roja 250g" y el cliente "José Ángel Peña"
  Cuando busco "cafe aguila" o "jose angel"
  Entonces ambos aparecen como primer resultado
```

### - [ ] HU-449: Anulación de un Abono de Cartera registrado por error en el turno actual (con PIN de supervisor y motivo)
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/pos/customers, services/customer-service]` · `[UC-K03]`
- **Como** supervisor, **quiero** poder revertir un abono que el cajero le anotó por equivocación al vecino que no era o por un monto erróneo, exigiendo mi PIN y motivo obligatorio, **para** restaurar el saldo del cliente y descontar ese efectivo del esperado del turno.
```gherkin
Escenario: Reverso de un abono en efectivo restaura la deuda del cliente y ajusta la caja del turno
  Dado que se registró por error un abono de $30.000 en efectivo a "Doña Marta"
  Cuando el supervisor autoriza "Anular abono" con motivo "Se registró al cliente equivocado"
  Entonces se inserta un movimiento compensatorio "+$30.000" en la cartera de "Doña Marta", baja el esperado de efectivo del turno en $30.000 y se audita la acción
```

### - [ ] HU-450: Anulación de un Movimiento de Caja (`CASH_IN` / `CASH_OUT`) digitado por error en el turno actual (con PIN de supervisor)
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[apps/pos/cash, services/cash-service]` · `[UC-C02, UC-C03]`
- **Como** supervisor, **quiero** anular con mi PIN una entrada o salida de efectivo mal digitada en el turno abierto (insertando el movimiento inverso referenciado y sin borrar el original), **para** que un error de dedo en un gasto no dañe el arqueo de la noche.
```gherkin
Escenario: Movimiento de salida anulado genera contrapartida compensatoria auditada
  Dado que el cajero registró por error una salida de $500.000 en vez de $50.000
  Cuando el supervisor anula ese movimiento de caja e ingresa el motivo
  Entonces se inserta el movimiento compensatorio en "cash_movements" y el esperado del turno vuelve al valor correcto
```

### - [ ] HU-451: Corte parcial informativo del turno ("Reporte X") exclusivo para el Dueño o Supervisor con permiso `cash.session.view_expected`
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[apps/pos/cash]` · `[Doc 04 §3]`
- **Como** dueño o supervisor a mitad de la tarde, **quiero** ingresar mi PIN en la caja y ver o imprimir un corte parcial ("Reporte X") con lo vendido y el efectivo esperado hasta ese minuto sin cerrar el turno del cajero, **para** hacer una revisión sorpresa de gaveta.
```gherkin
Escenario: Impresión de Reporte X exige permiso cash.session.view_expected y queda auditada
  Dado un turno abierto atendido por un cajero
  Cuando el dueño selecciona "Corte parcial (Reporte X)" e ingresa su PIN con permiso "cash.session.view_expected"
  Entonces se imprime el corte parcial a la hora actual sin cerrar el turno y se registra "cash.session.x_report" en auditoría
```

### - [ ] HU-452: Modo "Entrenamiento / Práctica de Cajero" en la App Instalable (claramente marcado en pantalla y en el tiquete, sin afectar inventario, caja ni nube)
- **Meta:** `[Hito 5]` · `[P2]` · `[2 pts]` · `[apps/pos]` · `[Recomendación #17]`
- **Como** dueño que acaba de contratar un cajero nuevo, **quiero** activar por 15 minutos el "Modo Práctica" (sobre una base SQLite temporal en memoria con borde naranja en toda la pantalla y leyenda `"*** TIQUETE DE PRÁCTICA SIN VALOR ***"`), **para** enseñarle a escanear, cobrar, fiar y hacer el arqueo sin ensuciar las ventas ni el inventario real de mi tienda.
```gherkin
Escenario: Ventas hechas en Modo Práctica no tocan la base de datos real ni el outbox
  Dado que el dueño activa el "Modo Práctica" para entrenar a un cajero nuevo
  Cuando el cajero registra 10 ventas de prueba y cierra un turno de práctica
  Entonces los tiquetes salen marcados como "*** PRÁCTICA ***" y al salir del modo práctica "sales" y "outbox" de la base real no tienen ningún registro de esas pruebas
```

### - [ ] HU-453: Soporte de Cajón Monedero conectado por adaptador USB-Serial directo al PC (para tiendas que no usan impresora o cuya impresora no tiene puerto RJ11)
- **Meta:** `[Hito 5]` · `[P2]` · `[1 pt]` · `[apps/pos/devices]` · `[Doc 04.1]`
- **Como** tendero cuyo cajón monedero se conecta por USB-Serial en vez de ir conectado detrás de la impresora, **quiero** elegir en configuración `"Cajón por puerto COM"` además de `"Cajón por impresora RJ11"`, **para** que el cajón abra igual al cobrar en efectivo.
```gherkin
Escenario: Apertura de cajón enviando pulso por puerto serial configurado
  Dado que el cajón está configurado en modo "USB-Serial (COM4)"
  Cuando se confirma una venta en efectivo
  Entonces el driver envía el byte de apertura al puerto "COM4"
```

### - [ ] HU-454: Opción "Cobrar sin imprimir comprobante (Ahorro de papel)" configurable por tienda para ventas menores de contado cuando el cliente no pide recibo
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[Retail Colombia]`
- **Como** tendero de barrio que vende un dulce de $500 o una bolsa de leche y no quiere gastar papel térmico en cada compra pequeña (mientras está en `fiscal_mode = NONE`), **quiero** poder configurar si la caja imprime siempre automáticamente, pregunta `"¿Imprimir recibo? (Enter = Sí / Esc = No)"` o solo imprime al presionar el botón, **para** ahorrar rollos de papel térmico.
```gherkin
Escenario: Venta registrada en base de datos y outbox sin gastar papel cuando se elige Cobrar sin imprimir
  Dado que la caja está en "fiscal_mode = NONE" y tiene habilitado el botón "Cobrar sin imprimir (F11)"
  Cuando el cajero cobra con "F11"
  Entonces la venta queda 100 % guardada, numerada y encolada en "outbox", el cajón se abre si es efectivo y no se gasta papel (pudiendo imprimirse después si el cliente lo pide)
```

### - [ ] HU-455: Bloqueo de inicio de sesión simultáneo del mismo cajero en dos cajas distintas de la misma sucursal (salvo configuración expresa)
- **Meta:** `[Hito 5]` · `[P2]` · `[1 pt]` · `[apps/pos, services/cash-service]` · `[UC-O07]`
- **Como** dueño con 2 cajas, **quiero** que cada cajero abra turno en su propia caja asignada y reciba una advertencia si el mismo usuario aparece con turno abierto al mismo tiempo en dos cajas distintas, **para** que la responsabilidad del dinero de cada gaveta sea individual.
```gherkin
Escenario: Alerta cuando el mismo cajero abre turno en dos cajas simultáneamente
  Dado que el cajero "Carlos" tiene un turno abierto en "CAJA-01"
  Cuando abre otro turno simultáneo con el mismo usuario en "CAJA-02"
  Entonces "cash-service" registra una advertencia en el resumen del turno para el dueño
```

---

## Desglose Atómico de Gestión de Cuenta, Soporte en Consola y Cierre del Módulo Fiscal DIAN (HU-456 a HU-505)

### - [ ] HU-456: Cambio de correo electrónico o número de celular del Dueño con verificación de código OTP en el nuevo medio y confirmación MFA
- **Meta:** `[Hito 5]` · `[P1]` · `[2 pts]` · `[services/identity-service, apps/management]` · `[Seguridad]`
- **Como** dueño de tienda que cambió de número de celular o correo, **quiero** actualizarlo confirmando primero mi MFA actual y luego un código de 6 dígitos enviado al nuevo correo/celular, **para** que nadie pueda secuestrar las notificaciones y enlaces de mi tienda.
```gherkin
Escenario: Cambio de correo exige validar código enviado al nuevo correo y notifica al correo anterior
  Cuando el dueño solicita cambiar su correo electrónico y valida su MFA y el código enviado al nuevo correo
  Entonces se actualiza el correo en "identity-service" y "tenant-service" y se envía un aviso de seguridad a la dirección anterior
```

### - [ ] HU-457: Regeneración de códigos de respaldo de MFA (*Backup Recovery Codes*) para el Dueño en la App de Gestión
- **Meta:** `[Hito 3]` · `[P1]` · `[1 pt]` · `[services/identity-service, apps/management]` · `[Doc 04 §2]`
- **Como** dueño de tienda, **quiero** recibir al activar mi MFA un juego de 8 códigos de respaldo de un solo uso para guardar en papel por si se me pierde o roban el celular donde tengo el autenticador, **para** poder entrar a mi cuenta sin depender siempre de soporte.
```gherkin
Escenario: Uso de un código de respaldo de MFA lo consume y permite iniciar sesión una vez
  Dado que el dueño perdió su celular pero tiene sus 8 códigos de respaldo impresos
  Cuando ingresa su contraseña y uno de los códigos de respaldo válidos
  Entonces inicia sesión exitosamente y ese código queda marcado como usado
```

### - [ ] HU-458: Cambio de titularidad / razón social de una tienda o de una licencia de Edición Local desde la Consola del Super Admin (por venta o traspaso del negocio)
- **Meta:** `[Hito 6 / L]` · `[P2]` · `[2 pts]` · `[apps/platform-console, services/tenant-service, services/device-service]` · `[Doc 10 §3.5]`
- **Como** super admin cuando un tendero vende el negocio ("traspaso de tienda") al nuevo propietario, **quiero** un flujo en la consola para registrar el cambio de titularidad adjuntando el soporte firmado, actualizar los datos del dueño y dejar la constancia en `audit_log`, **para** atender traspasos de negocios sin perder la historia de la tienda.
```gherkin
Escenario: Registro de traspaso de titularidad conserva el historial y audita el cambio de propietario
  Cuando el super admin ejecuta el cambio de titularidad en la consola adjuntando el documento de soporte
  Entonces se actualizan los datos del titular, se emite nueva licencia firmada y queda el registro inmutable del titular anterior y el nuevo en "audit_log"
```

### - [ ] HU-459: Registro y límite de exportaciones masivas de datos en `audit-service` (alerta si un usuario descarga todo el catálogo o la base de clientes repetidamente)
- **Meta:** `[Hito 5]` · `[P2]` · `[1 pt]` · `[services/reporting-service, services/audit-service]` · `[Doc 04 §5, §8]`
- **Como** dueño de tienda, **quiero** que cada vez que un usuario con acceso a la App de Gestión exporte un listado a Excel/PDF quede registrado en la auditoría quién lo descargó y desde qué IP, **para** saber quién se llevó copias de mi información comercial.
```gherkin
Escenario: Toda generación de archivo de exportación crea un registro en audit_log
  Cuando cualquier usuario solicita "POST /v1/app/reports/exports"
  Entonces se registra en "audit_log" la acción "reports.export.requested" con el usuario, tipo de reporte y rango de fechas
```

### - [ ] HU-460: `einvoicing-service` (Futuro) — Emisión de Nota de Ajuste del Documento Equivalente POS Electrónico y Nota Crédito de Factura Electrónica al anular o devolver una venta
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[3 pts]` · `[services/einvoicing-service, apps/pos]` · `[Doc 06 §1.5, UC-V13, UC-V14]`
- **Como** tienda con `fiscal_mode = DIAN_POS`, **quiero** que toda anulación o devolución sobre un documento electrónico ya emitido tome consecutivo del bloque de Notas de Ajuste / Notas Crédito, referencie el CUDE/CUFE y fecha del documento original (`BillingReference`) y se transmita a la DIAN, **para** anular o devolver legalmente sin borrar jamás un documento electrónico emitido.
```gherkin
Escenario: Devolución sobre tiquete POS electrónico genera Nota de Ajuste con referencia al CUDE original
  Dado una venta con "cude = CUDE_ORIGINAL" en una tienda con "fiscal_mode = DIAN_POS"
  Cuando se registra un evento "sale.returned" sobre esa venta
  Entonces la caja y "einvoicing-service" generan la Nota de Ajuste referenciando "CUDE_ORIGINAL" y la transmiten al proveedor tecnológico
```

### - [ ] HU-461: `einvoicing-service` (Futuro) — Emisión de Documento Soporte en Adquisiciones Efectuadas a Sujetos No Obligados a Expedir Factura de Venta (y su Nota de Ajuste)
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[3 pts]` · `[services/einvoicing-service, apps/management]` · `[Doc 06 §1.5, UC-C03]`
- **Como** dueño obligado a facturar que le compra mercancía a campesinos o proveedores personas naturales no obligados a facturar, **quiero** generar desde una recepción de mercancía el **Documento Soporte Electrónico** con su propia resolución DIAN y transmitirlo al proveedor tecnológico, **para** poder descontar legalmente ese costo en mi declaración de renta.
```gherkin
Escenario: Generación de Documento Soporte Electrónico desde una recepción de compra a proveedor no obligado
  Dado una recepción de mercancía de un proveedor marcado como "No obligado a facturar"
  Cuando el dueño presiona "Emitir Documento Soporte DIAN" en la App de Gestión
  Entonces "einvoicing-service" toma consecutivo de la resolución "SUPPORT_DOC", calcula el CUDS y transmite el XML UBL 2.1 a la DIAN
```

### - [ ] HU-462: `einvoicing-service` (Futuro) — Empaquetado y envío automático por correo del contenedor `AttachedDocument` (ZIP con XML firmado + `ApplicationResponse` + PDF de representación gráfica) al comprador
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[services/einvoicing-service, services/notification-service]` · `[Doc 06 §1.3, UC-V17]`
- **Como** comprador que pidió Factura Electrónica de Venta con NIT en la tienda, **quiero** recibir en mi correo electrónico el archivo `.zip` reglamentario de la DIAN con el `AttachedDocument` XML y el PDF de representación gráfica apenas la DIAN valide el documento, **para** radicar la factura en mi contabilidad.
```gherkin
Escenario: Envío automático del AttachedDocument tras validación exitosa de la DIAN
  Dado una Factura Electrónica de Venta que pasa a estado "ACCEPTED" con su "ApplicationResponse" de la DIAN
  Cuando "einvoicing-service" recibe la confirmación
  Entonces construye el "AttachedDocument" XML y el PDF, los guarda en S3 Object Lock y envía el ZIP al correo del adquirente
```

### - [ ] HU-463: `einvoicing-service` (Futuro) — Asistente y ejecutor del Set de Pruebas de Habilitación DIAN (`TestSetId`) en ambiente de pruebas
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[services/einvoicing-service, apps/management]` · `[Doc 09 §2 Fase 7]`
- **Como** dueño de tienda activando por primera vez la facturación electrónica, **quiero** ingresar mi `TestSetId` en la App de Gestión y que el sistema envíe automáticamente el conjunto de documentos de prueba exigidos por la DIAN hasta quedar habilitado en producción, **para** superar la habilitación sin trámites manuales.
```gherkin
Escenario: Ejecución automatizada del Set de Pruebas DIAN con TestSetId
  Dado un tenant en proceso de habilitación que ingresa su "TestSetId"
  Cuando presiona "Ejecutar set de pruebas DIAN"
  Entonces "einvoicing-service" genera y transmite los documentos de prueba requeridos y reporta cuando el set queda aceptado al 100 %
```

### - [ ] HU-464: `einvoicing-service` (Futuro) — Activación en caliente de `fiscal_mode = DIAN_POS` por tienda sin perder ni alterar el histórico previo de comprobantes internos (`NONE`)
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[services/tenant-service, services/einvoicing-service, apps/pos]` · `[Doc 06 §0]`
- **Como** tendero que empezó usando TienditaOnline sin facturación electrónica (`fiscal_mode = NONE`) y un año después creció y pasó a estar obligado a facturar, **quiero** activar el add-on `EINVOICING` y que desde el turno siguiente mis cajas usen `DianBlockNumbering` y `DianPosFiscalDocument`, conservando intactas todas mis ventas anteriores como comprobantes internos, **para** evolucionar dentro del mismo sistema sin cambiar de software.
```gherkin
Escenario: Transición limpia de una tienda desde fiscal_mode NONE a DIAN_POS
  Dado una tienda con 10.000 ventas históricas emitidas con "fiscal_mode = NONE"
  Cuando contrata el add-on "EINVOICING", registra su resolución DIAN, las cajas descargan su bloque de numeración y "fiscal_mode" cambia a "DIAN_POS"
  Entonces las 10.000 ventas anteriores permanecen como comprobantes internos sin enviarse a la DIAN y la venta 10.001 se emite con numeración DIAN, CUDE y QR
```

### - [ ] HU-465: Consola Super Admin — Panel de monitoreo del módulo de Facturación Electrónica (documentos pendientes de transmitir, cercanos al plazo legal de contingencia y rechazados por tienda)
- **Meta:** `[Fase 7 Futura]` · `[P3]` · `[2 pts]` · `[apps/platform-console, services/einvoicing-service]` · `[Doc 05 §5, Doc 06 §1.3]`
- **Como** super admin, **quiero** monitorear en mi consola si alguna tienda con facturación electrónica activa tiene documentos en contingencia acercándose al plazo máximo de transmisión o errores con el proveedor tecnológico, **para** asistir proactivamente al cliente antes de cualquier incumplimiento normativo.
```gherkin
Escenario: Alerta en consola cuando un documento electrónico lleva más de 24 horas en estado PENDING o ERROR
  Dado un documento en "electronic_documents" con "status = ERROR" y "issued_at" hace más de 24 horas
  Cuando corre el monitor de "einvoicing-service"
  Entonces aparece destacado en el panel de salud fiscal de la consola y notifica a soporte y al dueño
```

---

## Desglose Atómico de Pruebas de Regresión, Rendimiento Local, Accesibilidad y Empaquetado Final (HU-466 a HU-505)

### - [ ] HU-466: Benchmark automatizado de rendimiento en la Caja POS sobre catálogo de 50.000 productos y 200.000 ventas locales (`p95 < 50 ms` en escaneo y `< 100 ms` en cobro)
- **Meta:** `[Hito 2 / 7]` · `[P0]` · `[2 pts]` · `[apps/pos/benches]` · `[Doc 02 §8, Doc 05 §6]`
- **Como** ingeniero de rendimiento, **quiero** un benchmark en Rust (`criterion`) que llene una base SQLCipher con 50.000 productos y 200.000 ventas y falle en el CI si `cmd_lookup_barcode` supera 20 ms, `cmd_search_products` supera 30 ms o `cmd_complete_sale` supera 100 ms, **para** garantizar que la caja siga siendo instantánea después de un año de uso continuo.
```gherkin
Escenario: Cumplimiento de tiempos de respuesta con base local llena de 1 año de operación
  Dado una base SQLCipher poblada con 50.000 productos, 5.000 clientes y 200.000 ventas
  Cuando se ejecuta el benchmark de comandos críticos
  Entonces "cmd_lookup_barcode" responde en < 20 ms, "cmd_search_products" en < 30 ms y "cmd_complete_sale" en < 100 ms en el percentil 95
```

### - [ ] HU-467: Prueba de estrés de memoria y fugas (*soak test* de 72 horas continuas sin reiniciar la App Instalable)
- **Meta:** `[Hito 2 / 7]` · `[P1]` · `[2 pts]` · `[apps/pos/tests]` · `[Doc 01 §4]`
- **Como** tendero que deja el computador de la caja prendido toda la semana, **quiero** que la aplicación no tenga fugas de memoria (*memory leaks*) ni en el proceso Rust ni en la WebView React tras miles de ventas seguidas, **para** que no se ponga lenta con los días.
```gherkin
Escenario: Consumo de memoria estable tras simular 10.000 ventas continuas en la misma sesión
  Cuando el test automatizado ejecuta 10.000 ciclos de carrito y cobro sin cerrar la ventana
  Entonces el incremento neto de memoria RAM al final de las 10.000 ventas es menor a 30 MB
```

### - [ ] HU-468: Verificación automática de que el binario compilado con `--features local` no contiene símbolos ni llamadas a endpoints de `/v1/sync/*`
- **Meta:** `[Hito L]` · `[P0]` · `[1 pt]` · `[apps/pos, ci]` · `[Doc 10 §4.9]`
- **Como** arquitecto, **quiero** un paso en el CI del build `local` que verifique que el módulo `sync` no fue compilado y que las únicas rutas HTTP presentes en el binario son `/v1/local-activation/*`, **para** garantizar por construcción que la Edición Local nunca intenta sincronizar con la nube.
```gherkin
Escenario: Inspección del binario de Edición Local confirma ausencia de rutas /v1/sync
  Cuando el CI compila el ejecutable con "--no-default-features --features local"
  Entonces el verificador comprueba que no existe ninguna referencia a "/v1/sync/push" ni a "/v1/terminals/heartbeat"
```

### - [ ] HU-469: Verificación automática en CI de que todas las tablas con `tenant_id` en `db/cloud/*/00*.sql` tienen `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[db/cloud, ci]` · `[Doc 02 §4]`
- **Como** arquitecto de seguridad, **quiero** una prueba en CI que consulte `pg_class` y `pg_tables` después de correr las migraciones y falle si algún desarrollador creó una tabla con columna `tenant_id` (salvo excepciones explícitas documentadas como `users` y `tenants`) olvidando llamar a `app.enable_tenant_rls()`, **para** que jamás se cuele una tabla sin RLS.
```gherkin
Escenario: El test de seguridad de esquema falla si una tabla nueva con tenant_id no tiene RLS forzado
  Dado todas las bases de datos migradas en el job de CI
  Cuando corre la consulta de auditoría sobre "pg_class.relrowsecurity" y "pg_class.relforcerowsecurity"
  Entonces el 100 % de las tablas multi-tenant tienen ambos flags en "true"
```

### - [ ] HU-470: Verificación automática en CI de que el rol `audit_rw` no posee privilegios `UPDATE`, `DELETE` ni `TRUNCATE` sobre `audit_log`
- **Meta:** `[Hito 4]` · `[P0]` · `[1 pt]` · `[db/cloud/audit-service, ci]` · `[Doc 04 §8]`
- **Como** auditor, **quiero** que el CI verifique en `information_schema.role_table_grants` que el usuario de base de datos de `audit-service` solo tiene `INSERT` y `SELECT`, **para** asegurar que la inmutabilidad de la bitácora no se pierda en ninguna migración futura.
```gherkin
Escenario: Inspección de privilegios de audit_rw en PostgreSQL
  Cuando se consultan los permisos de "audit_rw" sobre la tabla "audit_log"
  Entonces aparecen únicamente "INSERT" y "SELECT" y no existen "UPDATE", "DELETE" ni "TRUNCATE"
```

### - [ ] HU-471: Manejo de desconexión y reconexión automática del stream Server-Sent Events (`/dashboard/stream`) con *Last-Event-ID* y fallback a polling de 30 s en la App de Gestión
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[apps/management, services/bff-app]` · `[Doc 01 §6]`
- **Como** dueño de tienda en una red móvil o corporativa que corta conexiones largas, **quiero** que si el stream SSE se interrumpe se reconecte automáticamente o caiga de forma transparente a polling cada 30 segundos, **para** que el Dashboard siga actualizándose siempre.
```gherkin
Escenario: Fallback automático a polling cuando un proxy intermedio bloquea SSE
  Dado que la conexión a "/v1/app/reports/dashboard/stream" falla 2 veces seguidas
  Entonces el cliente en la App de Gestión activa automáticamente el refresco por polling cada 30 segundos
```

### - [ ] HU-472: Compresión y redimensionamiento automático en el cliente antes de subir fotos de comprobantes de pago o soportes de gasto (máx. 1200px, WebP/JPEG < 300 KB)
- **Meta:** `[Hito 5 / 6]` · `[P2]` · `[1 pt]` · `[apps/management, apps/platform-console]` · `[UC-C03, HU-114]`
- **Como** usuario subiendo una foto tomada con un celular moderno (que pesa 8 MB), **quiero** que la app la redimensione y comprima a menos de 300 KB antes de enviarla, **para** que suba en 1 segundo con datos móviles y no gaste almacenamiento innecesario en S3.
```gherkin
Escenario: Imagen de 8 MB tomada con la cámara se comprime a menos de 300 KB antes del upload
  Dado una fotografía de un recibo de 8 MB seleccionada en el celular
  Cuando se adjunta al formulario
  Entonces el cliente la comprime localmente a < 300 KB conservando legibilidad del texto antes de subirla
```

### - [ ] HU-473: Generación de códigos QR en modo offline (SVG nativo sin servicios externos) tanto para enrolamiento como para llaves Bre-B/Nequi y tiquetes
- **Meta:** `[Hito 2 / 3]` · `[P0]` · `[1 pt]` · `[apps/pos, apps/management]` · `[Doc 04 §5]`
- **Como** desarrollador, **quiero** que todos los códigos QR se generen localmente en Rust/TypeScript sin llamar nunca a APIs externas de generación de imágenes QR, **para** funcionar sin internet y no filtrar datos a terceros.
```gherkin
Escenario: Generación de QR 100 % local sin peticiones de red
  Cuando se renderiza cualquier código QR en la caja o en la App de Gestión
  Entonces se genera en memoria local en menos de 5 ms con 0 llamadas a dominios externos
```

### - [ ] HU-474: Sanitización estricta de entradas y salidas en tirillas ESC/POS (prevención de inyección de comandos de control ESC/POS en nombres de productos o clientes)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[apps/pos/devices]` · `[Seguridad Hardware]`
- **Como** ingeniero de seguridad, **quiero** que el motor de impresión filtre cualquier byte de control (`0x00–0x1F` como `ESC 0x1B` o `GS 0x1D`) que pudiera venir dentro del nombre de un producto, cliente o motivo antes de enviarlo a la impresora, **para** que un texto malicioso jamás pueda inyectar el comando de abrir el cajón monedero al imprimir un texto.
```gherkin
Escenario: Nombre de cliente o producto con bytes ESC/POS embebidos es limpiado antes de imprimir
  Dado un texto que contiene la secuencia de bytes de apertura de cajón "\x1b\x70\x00"
  Cuando el formateador construye el buffer de impresión de texto
  Entonces elimina todos los caracteres de control no imprimibles del texto de usuario y jamás ejecuta el comando inyectado
```

### - [ ] HU-475: Validación de rangos numéricos seguros (prevención de *Integer Overflow* en multiplicación `qty_milli * unit_price_cents` usando enteros de 128 bits `i128` / `BigInt`)
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[packages/tax-engine, apps/pos/domain]` · `[Seguridad Matemática]`
- **Como** desarrollador del motor de ventas e impuestos, **quiero** realizar todas las multiplicaciones intermedias en `i128` (Rust) y `BigInt` (TypeScript) y acotar la cantidad máxima por línea a `999.999,000` y el precio unitario máximo a `$999.999.999,00`, **para** que jamás ocurra un desbordamiento aritmético que vuelva negativo el total de una cuenta.
```gherkin
Escenario: Multiplicación de cantidades y precios altos usa aritmética de 128 bits sin desbordamiento
  Dado un precio unitario de $50.000.000 (5.000.000.000 centavos) y cantidad de 100 unidades (100.000 milésimas)
  Cuando el motor calcula el subtotal de la línea
  Entonces realiza la operación en 128 bits y rechaza cualquier valor que supere los topes máximos configurados
```

### - [ ] HU-476: Protección contra bloqueo de cuenta del Dueño (*Account Lockout DoS*): tras 5 fallos de login por contraseña se exige captcha + verificación por correo/MFA en vez de bloquear indefinidamente al dueño
- **Meta:** `[Hito 3]` · `[P1]` · `[1 pt]` · `[services/identity-service]` · `[Doc 04 §5]`
- **Como** dueño de tienda, **quiero** que si alguien en internet intenta adivinar mi contraseña varias veces, el sistema bloquee la IP atacante y exija captcha + mi MFA sin dejarme a mí bloqueado indefinidamente fuera de mi negocio, **para** evitar denegación de servicio sobre mi cuenta.
```gherkin
Escenario: Bloqueo por IP atacante permite al dueño legítimo entrar desde su celular con MFA
  Dado que una IP externa falló 10 veces la contraseña del correo del dueño
  Cuando el dueño inicia sesión desde su propio dispositivo con su contraseña correcta y su código MFA
  Entonces puede acceder a su cuenta mientras la IP atacante sigue bloqueada por rate limit
```

### - [ ] HU-477: Alerta de seguridad al Dueño por correo/Push cuando se inicia sesión en la App de Gestión desde un dispositivo o navegador nuevo
- **Meta:** `[Hito 3]` · `[P1]` · `[1 pt]` · `[services/identity-service, services/notification-service]` · `[Doc 04 §2]`
- **Como** dueño de tienda, **quiero** recibir una notificación inmediata cuando mi cuenta inicie sesión en un teléfono o computador nuevo, con un botón para cerrar todas las sesiones si no fui yo, **para** detectar cualquier acceso no autorizado al instante.
```gherkin
Escenario: Notificación de inicio de sesión en navegador nuevo
  Cuando la cuenta del dueño inicia sesión desde un User-Agent / dispositivo no visto anteriormente
  Entonces se envía notificación Push y correo con la fecha, ciudad aproximada y enlace "Cerrar todas mis sesiones"
```

### - [ ] HU-478: Pantalla "Mis Sesiones y Dispositivos Activos" en la App de Gestión con botón "Cerrar sesión en este o en todos los dispositivos"
- **Meta:** `[Hito 3]` · `[P1]` · `[1 pt]` · `[services/identity-service, apps/management]` · `[Doc 04 §2]`
- **Como** dueño de tienda, **quiero** ver en qué celulares o computadores está abierta mi sesión de la App de Gestión y poder cerrarla remotamente si dejé mi cuenta abierta en otro PC, **para** mantener el control de mi acceso.
```gherkin
Escenario: Revocación remota de una sesión abierta en otro navegador
  Cuando selecciono "Cerrar sesión" sobre uno de los dispositivos listados en "Mis sesiones"
  Entonces se revoca su familia de refresh tokens y su access token queda en lista negra de Redis hasta expirar
```

### - [ ] HU-479: Verificador de salud de dependencias al arrancar cada microservicio (*Fail-Fast Startup Validation* de variables de entorno y esquemas con Zod)
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/service-kit]` · `[Doc 05 §3.2]`
- **Como** SRE, **quiero** que cada microservicio valide con Zod todas sus variables de entorno obligatorias al arrancar y falle en el primer segundo con un mensaje claro si falta alguna configuración, **para** no desplegar contenedores mal configurados que fallen horas después en mitad de una petición.
```gherkin
Escenario: Arranque abortado inmediatamente si falta una variable de entorno requerida
  Dado un contenedor iniciado sin la variable "DATABASE_URL" o "KAFKA_BROKERS"
  Cuando inicia el proceso Node.js
  Entonces imprime exactamente qué variables faltan y termina con código de salida 1 en menos de 1 segundo
```

### - [ ] HU-480: Apagado elegante (*Graceful Shutdown* en `SIGTERM`) en todos los microservicios: dejar de recibir tráfico, terminar transacciones HTTP/Kafka en curso, hacer flush de OTel y cerrar conexiones
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/service-kit]` · `[Doc 05 §1]`
- **Como** SRE durante un despliegue o autoescalado, **quiero** que al recibir `SIGTERM` el contenedor marque `/health/ready` en `503`, espere a que terminen las peticiones y mensajes de Kafka en vuelo (hasta 25 s), envíe las trazas pendientes y cierre limpiamente el pool de PostgreSQL, **para** que los despliegues nunca corten una petición a la mitad.
```gherkin
Escenario: Petición en vuelo termina con 200 OK cuando el contenedor recibe SIGTERM
  Dado que una petición "/v1/sync/push" lleva 100 ms ejecutándose cuando el contenedor recibe la señal "SIGTERM"
  Entonces el contenedor espera a que la transacción haga COMMIT y devuelva "200 OK" antes de apagar el proceso
```

### - [ ] HU-481: Enmascaramiento automático de datos sensibles en errores enviados a Sentry (`beforeSend` scrubbing de tokens, PINs, cédulas, teléfonos y correos)
- **Meta:** `[Hito 1]` · `[P0]` · `[1 pt]` · `[packages/service-kit, apps/pos, apps/management]` · `[Doc 04 §4]`
- **Como** oficial de privacidad, **quiero** que el hook `beforeSend` de Sentry en todos los servicios y frontends elimine cabeceras `Authorization`, cookies, PINs, contraseñas y datos personales del cuerpo antes de enviar el reporte de error, **para** diagnosticar fallos sin enviar PII a Sentry.
```gherkin
Escenario: Reporte de excepción enviado a Sentry tiene cabeceras y campos sensibles redactados
  Dado un error inesperado ocurrido durante una petición que incluía "Authorization", "pin" y "phone"
  Cuando el SDK de Sentry construye el evento
  Entonces el hook "beforeSend" reemplaza esos valores por "[REDACTED]" antes de salir por red
```

### - [ ] HU-482: Validador de formato y dígito de control al generar o leer códigos de barras `EAN-13`, `EAN-8` y `UPC-A` en común para caja y nube
- **Meta:** `[Hito 2]` · `[P0]` · `[1 pt]` · `[packages/contracts]` · `[UC-E20]`
- **Como** sistema, **quiero** una función compartida que valide dígitos verificadores GS1 (`EAN-13`, `EAN-8`, `UPC-A`) permitiendo también códigos internos alfanuméricos (`CODE-128`) cuando el tendero los usa, **para** advertir cuando un código EAN tiene un número mal digitado.
```gherkin
Escenario: Advertencia al digitar manualmente un código de 13 dígitos con dígito verificador erróneo
  Cuando el administrador escribe manualmente un código numérico de 13 dígitos cuyo último dígito no cumple el módulo 10 de EAN-13
  Entonces el formulario le advierte "Parece haber un dígito mal escrito en el código EAN-13; verifica el empaque"
```

### - [ ] HU-483: Manejo de huso horario fijo `America/Bogota` (`UTC-5`, sin cambio de hora) en todos los cortes diarios, cierres y reportes independientemente de la zona horaria del servidor en AWS
- **Meta:** `[Hito 1 / 4]` · `[P0]` · `[1 pt]` · `[packages/service-kit, services/reporting-service]` · `[Doc 02 §1, UC-C09]`
- **Como** tendero en Colombia que vende a las 10:30 p. m. hora local (que en UTC ya es las 03:30 a. m. del día siguiente), **quiero** que todas las agrupaciones por día en `rpt_daily_sales` y en mis reportes usen siempre la fecha en zona horaria `America/Bogota` (o la de la sucursal), **para** que las ventas hechas entre las 7:00 p. m. y las 11:59 p. m. nunca aparezcan sumadas en el día siguiente.
```gherkin
Escenario: Venta realizada a las 10:30 p. m. en Colombia se contabiliza en el mismo día local y no en el día siguiente UTC
  Dado una venta con "issued_at = 2026-10-31T22:30:00-05:00" (que equivale a "2026-11-01T03:30:00Z" en UTC)
  Cuando "reporting-service" acumula la venta en "rpt_daily_sales"
  Entonces la suma en "day = 2026-10-31" y no en "2026-11-01"
```

### - [ ] HU-484: Exportación de Comprobante de Cierre de Turno (Reporte Z) en PDF desde la App de Gestión para compartir por WhatsApp o archivar
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[services/reporting-service, apps/management]` · `[UC-C05, UC-R03]`
- **Como** dueño de tienda que no está en el local cuando cierran, **quiero** abrir el turno cerrado en mi celular y descargar o compartir por WhatsApp el Reporte Z en formato PDF idéntico al que salió en la tirilla térmica, **para** revisarlo y guardarlo desde mi teléfono.
```gherkin
Escenario: Descarga de Reporte Z en PDF desde el detalle del turno en el celular
  Cuando abro un turno cerrado en la App de Gestión y toco "Descargar Reporte Z (PDF)"
  Entonces se genera el PDF con todos los datos del arqueo, denominaciones, ventas por medio de pago y diferencia
```

### - [ ] HU-485: Buscador global de comprobantes emitidos (`GET /v1/app/sales?prefix=&number=&customer_id=&from=&to=`) con vista del tiquete completo en la App de Gestión
- **Meta:** `[Hito 5]` · `[P0]` · `[2 pts]` · `[services/sales-service, apps/management]` · `[UC-R01]`
- **Como** dueño de tienda, **quiero** buscar cualquier comprobante por su número (`C01-000042`), por cliente o por fecha/monto en mi celular y ver la representación exacta del tiquete con sus productos, quién lo atendió, a qué hora y cómo se pagó, **para** auditar cualquier venta desde donde esté.
```gherkin
Escenario: Búsqueda de un comprobante por su consecutivo muestra el tiquete completo en el celular
  Cuando escribo "C01-42" en el buscador de ventas de la App de Gestión
  Entonces abre la vista completa del comprobante "C01-000042" con sus líneas, impuestos, pagos y devoluciones asociadas
```

### - [ ] HU-486: Filtro y reporte de "Descuentos Otorgados y Cambios de Precio en Caja" por cajero y supervisor en la App de Gestión
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[services/reporting-service, apps/management]` · `[UC-V08, UC-V10]`
- **Como** dueño de tienda, **quiero** un reporte que me sume cuánto dinero se dio en descuentos o rebajas de precio en caja durante la semana y quién los aprobó, **para** controlar que no estén dando descuentos indebidos a conocidos.
```gherkin
Escenario: Listado de todas las ventas que tuvieron descuento o cambio de precio manual
  Cuando abro el reporte "Descuentos y rebajas en caja"
  Entonces veo el total descontado en el periodo y el detalle de cada comprobante con cajero y aprobador
```

### - [ ] HU-487: Filtro y reporte de "Mermas, Averías, Vencidos y Consumo Interno" valorizado al costo en la App de Gestión
- **Meta:** `[Hito 5]` · `[P1]` · `[1 pt]` · `[services/reporting-service, apps/management]` · `[UC-I05]`
- **Como** dueño de tienda en plan Negocio+, **quiero** ver cuánto dinero (al costo de compra) perdí este mes por productos vencidos, dañados o consumidos en la tienda, **para** reducir las pérdidas de mercancía.
```gherkin
Escenario: Resumen mensual de mermas valorizado en pesos al costo promedio
  Cuando consulto el reporte de "Mermas y ajustes" del mes
  Entonces veo las unidades y el valor en pesos por cada causa ("EXPIRED", "DAMAGE", "SHRINKAGE", "INTERNAL_USE")
```

### - [ ] HU-488: Alerta automática en la Consola del Super Admin cuando una tienda en periodo de prueba (`TRIAL`) está a 3 días de vencer y ya ha registrado más de 20 ventas
- **Meta:** `[Hito 6]` · `[P1]` · `[1 pt]` · `[services/tenant-service, apps/platform-console]` · `[Doc 10 §3.2, §3.5]`
- **Como** super admin comercial, **quiero** que mi consola me destaque las tiendas en `TRIAL` que sí están usando activamente la caja y cuya prueba vence en 3 días, con botón directo para escribirles por WhatsApp y cerrar la venta de su suscripción, **para** maximizar la conversión de pruebas gratis a clientes pagos.
```gherkin
Escenario: Identificación de tiendas en TRIAL con uso activo próximas a vencer
  Dado una tienda en "TRIAL" que vence en 3 días y ha sincronizado 50 ventas
  Cuando abro la pestaña "Conversiones de Prueba" en la consola
  Entonces aparece destacada como "Alta probabilidad de cierre" con enlace directo al WhatsApp del dueño
```

### - [ ] HU-489: Paso automático de `TRIAL` a `SUSPENDED` tras vencer los 15 días de prueba (+3 días de cortesía) si no se ha registrado pago, conservando todos sus datos listos para cuando pague
- **Meta:** `[Hito 6]` · `[P0]` · `[1 pt]` · `[services/tenant-service]` · `[Doc 10 §3.2]`
- **Como** plataforma SaaS, **quiero** que si una tienda termina sus 15 días de prueba y 3 días de cortesía sin pagar, pase a `SUSPENDED` (impidiendo abrir nuevos turnos en la caja) y se reactive al instante con todos sus datos intactos en cuanto realice su primer pago, **para** automatizar el cierre del periodo de prueba.
```gherkin
Escenario: Vencimiento de prueba sin pago suspende apertura de nuevos turnos y reactiva al pagar
  Dado una tienda en "TRIAL" cuyo periodo de prueba + 3 días venció ayer sin pagos registrados
  Cuando corre el job diario de suscripciones
  Entonces la tienda pasa a "SUSPENDED" y al registrarse el pago del primer mes pasa a "ACTIVE" conservando todo lo que hizo en la prueba
```

### - [ ] HU-490: Generación de Recibo/Comprobante de Pago de Suscripción o de Licencia Local en PDF desde la Consola del Super Admin
- **Meta:** `[Hito 6 / L]` · `[P1]` · `[1 pt]` · `[services/tenant-service, apps/platform-console]` · `[Doc 10 §3.5]`
- **Como** super admin cuando registro el pago de un tendero, **quiero** que el sistema genere y envíe automáticamente al correo/WhatsApp del dueño su comprobante de pago con el periodo cubierto (`paid_until`) o los datos de su licencia local, **para** darle tranquilidad inmediata de que su pago quedó aplicado.
```gherkin
Escenario: Envío automático de comprobante de pago al registrar un pago manual o por pasarela
  Cuando un pago de suscripción pasa a "APPROVED"
  Entonces el dueño recibe por correo y WhatsApp la confirmación de pago indicando su nueva fecha de vigencia "paid_until"
```

### - [ ] HU-491: Asistente de diagnóstico integrado en la App Instalable ("Diagnóstico de Caja": verifica base de datos, keystore, espacio en disco, reloj, conexión TLS a la nube, impresora y cajón)
- **Meta:** `[Hito 2 / 4]` · `[P1]` · `[2 pts]` · `[apps/pos]` · `[Soporte]`
- **Como** tendero o agente de soporte cuando algo falla en el computador, **quiero** abrir la pantalla "Diagnóstico del sistema" y que en 5 segundos revise los 7 puntos críticos con un check verde `✔` o una `✖` explicando qué hacer (y un botón "Copiar resumen para soporte"), **para** diagnosticar cualquier problema en 1 minuto por WhatsApp.
```gherkin
Escenario: Ejecución de autodiagnóstico completo de la caja
  Cuando presiono "Ejecutar diagnóstico" en la caja
  Entonces verifica SQLite, Keystore, Espacio libre, Desfase de reloj, Alcance a "api.tienditaonline.co", Impresora y Licencia, mostrando el resultado claro de cada punto
```

### - [ ] HU-492: Modo de "Recuperación de Emergencia" al iniciar la App Instalable manteniendo presionada una combinación de teclas (o desde el menú de Windows) para restaurar un snapshot local o enviar logs
- **Meta:** `[Hito 2]` · `[P1]` · `[1 pt]` · `[apps/pos]` · `[UC-E16]`
- **Como** agente de soporte asistiendo a una tienda cuyo archivo principal tuvo un problema de disco en Windows, **quiero** que la app tenga una ventana de arranque de recuperación que permita elegir entre las últimas 30 copias automáticas locales y verificar la base antes de abrir la caja, **para** recuperar un equipo sin reinstalar Windows ni usar consola de comandos.
```gherkin
Escenario: Apertura del menú de recuperación para restaurar snapshot local verificado
  Cuando se inicia la aplicación con el argumento "--recovery" desde el acceso directo de soporte
  Entonces muestra la lista de snapshots locales con su fecha, hora y última venta permitiendo restaurar con autorización
```

### - [ ] HU-493: Compresión y envío bajo demanda de paquete de logs de diagnóstico anonimizados desde la Caja hacia S3 cuando soporte lo solicita
- **Meta:** `[Hito 4]` · `[P2]` · `[1 pt]` · `[apps/pos, services/device-service]` · `[Doc 04 §4, Doc 05 §5]`
- **Como** ingeniero de soporte investigando un fallo raro de una impresora o de red en una tienda, **quiero** que el tendero pueda pulsar "Enviar reporte técnico a soporte" en la pantalla de Diagnóstico para subir los últimos archivos de log rotados de `tracing` (sin PII ni tokens) a S3 asociados a su `terminal_id`, **para** ver los logs del equipo desde la consola sin conectarme por escritorio remoto.
```gherkin
Escenario: Subida de paquete de logs de diagnóstico firmada por la terminal
  Cuando el usuario presiona "Enviar diagnóstico a soporte" con conexión a internet
  Entonces la caja comprime los logs locales redactados, los sube mediante URL prefirmada de "device-service" y muestra el código de incidente
```

### - [ ] HU-494: Protección contra borrado o modificación accidental de archivos de la aplicación instalando en ruta protegida y verificando el hash de los recursos al iniciar
- **Meta:** `[Hito 7]` · `[P2]` · `[1 pt]` · `[apps/pos]` · `[Doc 04 §5]`
- **Como** ingeniero de seguridad, **quiero** que la aplicación verifique la integridad de sus recursos empaquetados al arrancar y que la base de datos SQLCipher viva en `%LOCALAPPDATA%\TienditaOnline` separada de los binarios firmados, **para** que una actualización de binarios nunca toque los datos y cualquier corrupción del ejecutable sea detectada.
```gherkin
Escenario: Separación estricta entre carpeta de binarios firmados y carpeta de datos SQLCipher
  Cuando se instala o actualiza la aplicación en Windows
  Entonces los binarios firmados residen en la ruta de programa y la base SQLCipher reside en la ruta de datos de aplicación sin verse afectada por el reemplazo del ejecutable
```

### - [ ] HU-495: Validación de accesibilidad por teclado y lector de pantalla básico en los flujos críticos de la App de Gestión Web (`axe-core` en Playwright sin violaciones críticas)
- **Meta:** `[Hito 5 / 7]` · `[P2]` · `[1 pt]` · `[apps/management, tests/e2e]` · `[Calidad]`
- **Como** usuario de la App de Gestión, **quiero** que todos los botones, campos e íconos tengan etiquetas claras, orden de tabulación lógico (`Tab` / `Shift+Tab`) y contraste suficiente verificados con `axe-core` en las pruebas de Playwright, **para** que la aplicación sea cómoda y accesible en cualquier pantalla.
```gherkin
Escenario: Auditoría automática axe-core en las pantallas principales de la App de Gestión
  Cuando la suite de Playwright ejecuta el análisis "axe-core" sobre Dashboard, Catálogo, Inventario y Clientes
  Entonces reporta 0 violaciones críticas de contraste o de controles sin etiqueta
```

### - [ ] HU-496: Internacionalización y parametrización regional lista en configuración (`es-CO` por defecto, moneda `COP`, huso `America/Bogota`, separadores `.` y `,`)
- **Meta:** `[Hito 1 / 6]` · `[P2]` · `[1 pt]` · `[packages/config, packages/contracts]` · `[Escala Futura]`
- **Como** arquitecto pensando en la expansión futura del SaaS, **quiero** que el formato de moneda, zona horaria, textos de interfaz y reglas de documentos/impuestos se lean de la configuración regional de la tienda (`es-CO` y `COP` por defecto), **para** no tener símbolos ni formatos quemados en mil lugares distintos del código.
```gherkin
Escenario: Formateo centralizado de moneda y fechas a través de utilidades regionales compartidas
  Cuando cualquier pantalla formatea un monto o una fecha
  Entonces utiliza las funciones centralizadas configuradas con "locale = es-CO", "currency = COP" y "timeZone = America/Bogota"
```

### - [ ] HU-497: Documentación OpenAPI 3.1 autogenerada desde los esquemas Zod de `bff-app`, `bff-pos`, `bff-platform`, `sync-service` y `device-service`
- **Meta:** `[Hito 3 / 5]` · `[P1]` · `[1 pt]` · `[packages/contracts, services/*]` · `[Doc 08 §7]`
- **Como** desarrollador frontend o móvil, **quiero** que el documento OpenAPI 3.1 se genere automáticamente desde los mismos esquemas Zod que validan las peticiones en producción, **para** que la documentación de la API nunca mienta ni quede desactualizada respecto al código real.
```gherkin
Escenario: Generación sin errores del archivo openapi.json a partir de los contratos Zod
  Cuando se ejecuta "pnpm contracts:openapi"
  Entonces se generan las especificaciones OpenAPI 3.1 válidas de todos los endpoints expuestos
```

### - [ ] HU-498: Colección de pruebas de humo (*Post-Deploy Smoke Tests*) que se ejecuta automáticamente en `staging` y `prod` tras cada despliegue
- **Meta:** `[Hito 1 / 7]` · `[P0]` · `[1 pt]` · `[ci, tests/smoke]` · `[Doc 05 §8]`
- **Como** pipeline de CD, **quiero** ejecutar automáticamente tras cada despliegue una batería de pruebas de humo contra `/health/ready`, autenticación, un push sintético de una tienda de monitoreo y una lectura de dashboard, disparando rollback inmediato si falla cualquiera, **para** detectar problemas en segundos.
```gherkin
Escenario: Smoke test post-despliegue verifica salud de todos los servicios
  Cuando finaliza un despliegue en staging o producción
  Entonces corre el job "smoke-test" validando "/health/ready" e ingesta sintética en menos de 30 segundos
```

### - [ ] HU-499: Auditoría automatizada de licencias de paquetes Open Source (`license-checker` y `cargo deny`) en el pipeline de CI para impedir dependencias con licencias incompatibles (GPL/AGPL en código propietario)
- **Meta:** `[Hito 1 / 7]` · `[P1]` · `[1 pt]` · `[ci]` · `[Legal / Propiedad Intelectual]`
- **Como** propietario del software TienditaOnline, **quiero** que el CI verifique con `cargo deny check licenses` y `license-checker` que ninguna librería nueva agregada al proyecto tenga una licencia copyleft restrictiva que obligue a liberar el código fuente comercial, **para** proteger la propiedad intelectual del SaaS y de la Edición Local.
```gherkin
Escenario: Rechazo en CI al intentar agregar una dependencia con licencia AGPL
  Dado que un PR agrega un paquete npm o crate de Rust con licencia AGPL-3.0
  Cuando corre el job de verificación de licencias en CI
  Entonces el build falla informando que la licencia no está en la lista permitida (MIT, Apache-2.0, BSD, ISC, MPL-2.0)
```

### - [ ] HU-500: Creación del super usuario inicial (`SUPER_ADMIN` semilla) mediante comando CLI seguro de plataforma con enrolamiento MFA inmediato y sin credenciales por defecto en el código
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[services/identity-service]` · `[Doc 04 §5, Doc 10 §1]`
- **Como** fundador desplegando por primera vez la plataforma en producción, **quiero** un comando de inicialización única que cree mi usuario `SUPER_ADMIN` leyendo mi correo desde una variable segura y generando un enlace de activación + MFA de 10 minutos de vida (sin que exista jamás un usuario `admin/admin` en las migraciones SQL), **para** que la plataforma nazca sin contraseñas por defecto.
```gherkin
Escenario: Ninguna migración SQL crea usuarios con contraseña por defecto y el comando bootstrap-superadmin solo funciona si existen 0 super admins
  Dado una base "identity_db" recién migrada
  Cuando se ejecuta "bootstrap-superadmin" por primera vez crea el enlace de activación para el primer SUPER_ADMIN
  Y si alguien intenta ejecutar "bootstrap-superadmin" una segunda vez cuando ya existe un SUPER_ADMIN, el comando aborta con error "SUPER_ADMIN_ALREADY_INITIALIZED"
```

### - [ ] HU-501: Tablero de Reconciliación Global Nocturna (job que compara por cada tienda y caja: `ventas en sales_db` vs `movimientos SALE en inventory_db` vs `pagos CASH en cash_db` vs `cargos en customer_db` vs `totales en reporting_db`)
- **Meta:** `[Hito 4 / 7]` · `[P0]` · `[2 pts]` · `[services/reporting-service, apps/platform-console]` · `[Calidad Contable]`
- **Como** arquitecto de un sistema distribuido por eventos, **quiero** un verificador nocturno automático que cruce los totales del día entre los microservicios (`sales`, `inventory`, `cash`, `customer` y `reporting`) y me alerte en la consola si alguna tienda tiene siquiera `$1` de diferencia eventual no convergida, **para** tener certeza matemática diaria de que todos los microservicios están 100 % cuadrados.
```gherkin
Escenario: Verificación nocturna confirma cuadre contable cruzado al 100 % entre todos los microservicios
  Cuando corre el job nocturno "cross-service-reconciliation"
  Entonces compara para cada tienda las ventas en "sales_db", los cargos de fiado en "customer_db", los pagos en efectivo en "cash_db" y los totales en "reporting_db", reportando "0 discrepancias" en el panel de salud de la consola
```

### - [ ] HU-502: Descarga de instaladores verificados (con hash SHA-256 publicado) y detección automática de arquitectura (Windows x64 / ARM64 y Android) desde el portal de descarga
- **Meta:** `[Hito 7]` · `[P1]` · `[1 pt]` · `[infra/edge, apps/pos]` · `[UX Instalación]`
- **Como** tendero descargando el programa para mi computador o tablet, **quiero** una página de descarga rápida servida por CDN (Cloudflare R2/S3) que detecte mi sistema y descargue el instalador correcto en segundos mostrando su checksum SHA-256, **para** instalar sin confusiones.
```gherkin
Escenario: Descarga del instalador firmado desde CDN con cabecera de integridad
  Cuando el dueño hace clic en "Descargar aplicación de Caja" desde un PC con Windows 64 bits
  Entonces descarga el instalador firmado para Windows x64 a máxima velocidad desde el CDN de Cloudflare
```

### - [ ] HU-503: Limpieza y cierre seguro de sesión en la App Instalable y App de Gestión (borrado de tokens en memoria y estado sensible al cerrar sesión)
- **Meta:** `[Hito 3]` · `[P0]` · `[1 pt]` · `[apps/pos, apps/management]` · `[Doc 04 §2]`
- **Como** usuario que cierra su sesión en un navegador o dispositivo compartido, **quiero** que al pulsar "Cerrar sesión" se revoque el refresh token en el servidor y se limpien todos los estados en memoria (`TanStack Query cache`, `Zustand`, almacenamiento seguro de sesión), **para** que la siguiente persona que toque el dispositivo no vea ningún dato de mi tienda.
```gherkin
Escenario: Cierre de sesión limpia por completo la caché en memoria y revoca el token en el servidor
  Cuando el usuario presiona "Cerrar sesión" en la App de Gestión
  Entonces se llama al endpoint de revocación de sesión, se vacía toda la caché de consultas en memoria y se redirige a la pantalla de login
```

### - [ ] HU-504: Prueba integral de Aceptación del Caso de Uso de Oro de sincronización multi-caja con desconexión prolongada de 7 días
- **Meta:** `[Hito 4 / 7]` · `[P0]` · `[2 pts]` · `[tests/e2e]` · `[Doc 01, Doc 03, Doc 04 §2.3]`
- **Como** fundador de TienditaOnline, **quiero** una prueba automatizada que simule una tienda con 2 cajas que pierden el internet durante 7 días completos (dentro de los 10 días de gracia), registran 2.000 ventas en efectivo, mixtas y fiadas, 14 aperturas y cierres de turno con arqueo ciego, abonos y devoluciones, y al séptimo día recuperan la conexión y sincronizan todo en lotes ordenados, **para** demostrar con pruebas reales la promesa central de valor del producto.
```gherkin
Escenario: Siete días de operación sin internet en 2 cajas convergen al centavo al reconectar en el día 7
  Dado una tienda con 2 cajas desconectadas de internet durante 7 días simulados con 2.000 ventas, 14 turnos cerrados y 100 movimientos de cartera
  Cuando en el día 7 se restablece la conexión a internet para ambas cajas
  Entonces las 2 cajas suben todos sus lotes en orden, el outbox de ambas llega a 0 pendientes y los saldos de ventas, efectivo de turnos, inventario y cartera en la nube cuadran exactamente al centavo
```

### - [ ] HU-505: Validación Final de Completitud del Backlog (las 505 Historias de Usuario en estado `[x]` garantizan 100 % de cobertura funcional, técnica, de seguridad, legal y operativa para operar al público)
- **Meta:** `[Hito 7]` · `[P0]` · `[1 pt]` · `[proyecto]` · `[Go-Live Público]`
- **Como** equipo de TienditaOnline, **quiero** verificar que al marcar como completadas desde la `HU-001` hasta la `HU-505` todos los casos de uso (`UC-P*`, `UC-O*`, `UC-C*`, `UC-V*`, `UC-K*`, `UC-I*`, `UC-R*`, `UC-L*`) y todos los casos borde (`E01` a `E36`) tienen sus pruebas automatizadas pasando en verde en el pipeline principal, **para** declarar el sistema listo para operar comercialmente al público en Colombia.
```gherkin
Escenario: Cierre del 100 % de las historias de los Hitos 1 a 7 y Hito L habilita la operación comercial pública
  Dado que todas las historias de los Hitos 1, 2, 3, 4, 5, 6, L y 7 están en estado completado ("[x]") y verificadas en CI/CD
  Cuando se ejecuta la suite maestra de validación de release y el Checklist de Producción
  Entonces el 100 % de las pruebas unitarias, golden tests de impuestos, aislamiento RLS, contratos Pact/Schema, casos borde E01-E36, carga k6, chaos testing y flujos E2E finalizan en verde y la plataforma queda abierta al público
```

---

## Matriz de Trazabilidad Completa (Hitos vs. las 505 Historias de Usuario)

| Hito / Fase | Historias de Usuario Incluidas | Total HUs | Resultado Entregable al Completar |
|---|---|---:|---|
| **Hito 1 — Cimientos del Repo** | `HU-001`..`015`, `HU-139`..`155`, `HU-469`, `HU-479`..`481`, `HU-483`, `HU-496`, `HU-498`, `HU-499` | **40** | Monorepo, CI/CD, 12 BDs con RLS verificado, contratos Zod/Rust, `service-kit` completo |
| **Hito 2 — Caja Offline (MVP Local)** | `HU-016`..`022`, `HU-027`..`044`, `HU-048`..`057`, `HU-059`..`062`, `HU-156`..`180`, `HU-198`, `HU-201`..`208`, `HU-210`..`214`, `HU-216`, `HU-217`, `HU-219`..`225`, `HU-258`, `HU-277`, `HU-278`, `HU-282`, `HU-321`..`326`, `HU-343`..`346`, `HU-348`, `HU-350`, `HU-352`, `HU-360`, `HU-365`, `HU-373`, `HU-414`..`417`, `HU-419`, `HU-420`, `HU-441`, `HU-442`, `HU-448`, `HU-454`, `HU-466`, `HU-467`, `HU-473`..`475`, `HU-491`, `HU-492` | **124** | La caja vende 100 % offline, imprime ESC/POS, abre cajón, maneja turnos con arqueo ciego y fiados, probada con tenderos y hardware real |
| **Hito 3 — Núcleo Nube y Admin Básico** | `HU-023`..`026`, `HU-071`..`081`, `HU-096`..`100`, `HU-110`..`112`, `HU-181`..`183`, `HU-188`, `HU-199`, `HU-200`, `HU-226`..`230`, `HU-250`, `HU-251`, `HU-261`..`274`, `HU-285`, `HU-288`, `HU-289`, `HU-292`, `HU-293`, `HU-295`..`297`, `HU-299`, `HU-316`, `HU-319`, `HU-329`..`334`, `HU-357`, `HU-361`, `HU-372`, `HU-374`, `HU-388`..`394`, `HU-405`, `HU-421`, `HU-446`, `HU-447`, `HU-457`, `HU-476`..`478`, `HU-497`, `HU-500`, `HU-503` | **86** | Creas tiendas en tu consola, el dueño activa su cuenta con MFA, carga catálogo/saldos iniciales y enrola su caja con QR |
| **Hito 4 — Sincronización Punta a Punta** | `HU-063`..`070`, `HU-084`, `HU-086`, `HU-088`, `HU-093`, `HU-095`, `HU-103`, `HU-178`, `HU-184`..`187`, `HU-194`, `HU-196`, `HU-218`, `HU-238`, `HU-254`, `HU-259`, `HU-279`..`281`, `HU-283`, `HU-284`, `HU-300`, `HU-302`, `HU-303`, `HU-335`, `HU-336`, `HU-370`, `HU-470`, `HU-493`, `HU-501`, `HU-504` | **41** | Caso de oro completo: las cajas venden 7 días sin internet y al reconectar cuadran ventas, inventario, turnos y cartera al centavo |
| **Hito 5 — App de Gestión y Operación Completa** | `HU-045`..`047`, `HU-058`, `HU-082`, `HU-085`, `HU-087`, `HU-089`..`091`, `HU-094`, `HU-101`, `HU-102`, `HU-104`..`109`, `HU-192`, `HU-193`, `HU-195`, `HU-197`, `HU-209`, `HU-215`, `HU-231`..`236`, `HU-239`, `HU-240`, `HU-242`..`249`, `HU-269`, `HU-275`, `HU-276`, `HU-294`, `HU-298`, `HU-301`, `HU-304`, `HU-306`, `HU-317`, `HU-318`, `HU-320`, `HU-327`, `HU-328`, `HU-337`, `HU-338`, `HU-347`, `HU-349`, `HU-351`, `HU-353`..`356`, `HU-358`, `HU-359`, `HU-363`, `HU-364`, `HU-367`, `HU-368`, `HU-377`, `HU-395`, `HU-396`, `HU-398`..`401`, `HU-403`, `HU-404`, `HU-418`, `HU-422`..`425`, `HU-449`..`453`, `HU-455`, `HU-456`, `HU-459`, `HU-471`, `HU-472`, `HU-484`..`487`, `HU-495` | **104** | Devoluciones, envases retornables, compras, ajustes/conteos con cámara, conciliación de Nequi/Bre-B, reportes en vivo y alertas push/WhatsApp |
| **Hito 6 — Cobro SaaS, Mora, Bloqueo y Escala** | `HU-076`, `HU-083`, `HU-092`, `HU-113`..`118`, `HU-164`, `HU-189`..`191`, `HU-237`, `HU-241`, `HU-252`, `HU-253`, `HU-260`, `HU-265`, `HU-290`, `HU-291`, `HU-305`, `HU-366`, `HU-397`, `HU-402`, `HU-406`, `HU-436`..`438`, `HU-440`, `HU-458`, `HU-488`..`490` | **35** | Facturación de suscripciones, avisos D-5..D+5, `RESTRICTED` D+7, `SUSPENDED` D+15, prórrogas, promociones y multi-tienda |
| **Hito L — Edición Local (Pago Único)** | `HU-119`..`129`, `HU-255`..`257`, `HU-307`..`315`, `HU-362`, `HU-407`, `HU-439`, `HU-468` | **27** | Instalador de pago único con activación en línea única (serial + huella 3/5 + TPM), luego 100 % sin internet, respaldos `.tdbak`, solicitud de cambio de equipo y restauración |
| **Hito 7 — Producción, Carga, Seguridad y Piloto** | `HU-130`..`135`, `HU-286`, `HU-287`, `HU-339`..`342`, `HU-369`, `HU-371`, `HU-375`, `HU-376`, `HU-378`, `HU-408`..`413`, `HU-426`..`435`, `HU-443`..`445`, `HU-494`, `HU-502`, `HU-505` | **39** | Infraestructura AWS con Terraform, Cloudflare WAF, pruebas de carga k6, chaos testing, auto-actualizador firmado, piloto real y salida al público |
| **Fase 7 (Futura) — Facturación Electrónica DIAN** | `HU-136`..`138`, `HU-379`..`387`, `HU-460`..`465` | **18** | `einvoicing-service`, bloques DIAN por caja, CUDE/QR local, UBL 2.1, proveedor tecnológico, contingencia y archivo WORM |
| **TOTAL BACKLOG** | **`HU-001` a `HU-505`** | **505** | **Sistema SaaS + Edición Local 100 % completo y operando al público** |





