# Product Backlog Modular por Épicas y Features (505 Historias de Usuario)

Esta carpeta organiza las **505 Historias de Usuario** (`HU-001` a `HU-505`) en **15 carpetas de Épica** y **42 archivos de Feature** independientes para seguimiento diario por módulo, manteniendo intacto el archivo completo largo en [../11-backlog-historias-usuario.md](../11-backlog-historias-usuario.md).

## Índice General de Épicas

| Épica | Carpeta / Descripción | Hito Principal | Features | HUs | Puntos |
|---|---|---|---:|---:|---:|
| **EP-01** | [ÉPICA 01: Cimientos de Ingeniería, Monorepo, Contratos y Service-Kit](EP-01-cimientos-monorepo-contratos-service-kit/README.md) | Hito 1 | 4 | 46 | 95 |
| **EP-02** | [ÉPICA 02: App Instalable (Tauri) — Base Local, Seguridad de Dispositivo y Autenticación](EP-02-pos-base-local-seguridad-autenticacion/README.md) | Hito 2 / Hito 3 | 4 | 43 | 92 |
| **EP-03** | [ÉPICA 03: App Instalable — Ventas, Carrito, Precios, Medios de Pago y Devoluciones (Offline)](EP-03-pos-ventas-carrito-pagos-devoluciones/README.md) | Hito 2 / Hito 5 | 5 | 54 | 123 |
| **EP-04** | [ÉPICA 04: App Instalable — Periféricos de Mostrador e Impresión ESC/POS](EP-04-pos-perifericos-impresion-escpos/README.md) | Hito 2 | 1 | 16 | 31 |
| **EP-05** | [ÉPICA 05: App Instalable — Control de Turnos, Efectivo y Arqueo Ciego](EP-05-pos-turnos-efectivo-arqueo-ciego/README.md) | Hito 2 | 2 | 19 | 40 |
| **EP-06** | [ÉPICA 06: App Instalable — Clientes y Cartera de Fiados en Caja (Offline)](EP-06-pos-clientes-fiados-cartera-offline/README.md) | Hito 2 | 2 | 12 | 28 |
| **EP-07** | [ÉPICA 07: Motor de Sincronización Offline-First (sync-service + Cliente Rust)](EP-07-sincronizacion-offline-first/README.md) | Hito 4 | 3 | 25 | 71 |
| **EP-08** | [ÉPICA 08: Microservicios de Dominio Core en Nube (tenant, identity, device, catalog)](EP-08-microservicios-core-nube/README.md) | Hito 3 | 4 | 61 | 137 |
| **EP-09** | [ÉPICA 09: Microservicios Operativos en Nube (sales, cash, inventory, customer, audit)](EP-09-microservicios-operativos-nube/README.md) | Hito 4 / Hito 5 | 5 | 38 | 103 |
| **EP-10** | [ÉPICA 10: App de Gestión Web + Móvil (Expo, Siempre Online) y bff-app](EP-10-app-gestion-web-movil-bff-app/README.md) | Hito 3 / Hito 5 | 3 | 42 | 97 |
| **EP-11** | [ÉPICA 11: Reportería CQRS, Dashboard en Vivo y Notificaciones Multicanal](EP-11-reporteria-cqrs-dashboard-notificaciones/README.md) | Hito 4 / Hito 5 | 2 | 29 | 71 |
| **EP-12** | [ÉPICA 12: Consola del Super Admin (platform-console + bff-platform), Facturación SaaS, Mora y Bloqueos](EP-12-consola-super-admin-cobro-mora-bloqueos/README.md) | Hito 3 / Hito 6 | 3 | 31 | 78 |
| **EP-13** | [ÉPICA 13: Edición Local (Pago Único, Activación Online Única y Respaldos .tdbak)](EP-13-edicion-local-pago-unico-respaldos/README.md) | Hito L | 5 | 27 | 87 |
| **EP-14** | [ÉPICA 14: Infraestructura Productiva, Seguridad OWASP, Observabilidad, DR y Lanzamiento](EP-14-infraestructura-seguridad-observabilidad-piloto/README.md) | Hito 7 | 2 | 44 | 92 |
| **EP-15** | [ÉPICA 15 (FUTURA — Mapeada): Facturación Electrónica y Documento Equivalente POS DIAN](EP-15-futuro-facturacion-electronica-dian/README.md) | Fase 7 Futura | 3 | 18 | 59 |
| **TOTAL** | **15 Épicas completas** | **Hitos 1..7 + Hito L + Fase 7** | **42** | **505** | **1204** |

## Árbol Completo de Archivos por Épica y Feature

### [ÉPICA 01: Cimientos de Ingeniería, Monorepo, Contratos y Service-Kit](EP-01-cimientos-monorepo-contratos-service-kit/README.md)
- [Feature 01.1: Monorepo, Configuración Base, Migraciones y Pipeline CI/CD](EP-01-cimientos-monorepo-contratos-service-kit/FT-01.1-monorepo-config-ci-cd.md) — **11 HUs**
- [Feature 01.2: Contratos Compartidos (packages/contracts), Semillas Colombia y Generación de Tipos](EP-01-cimientos-monorepo-contratos-service-kit/FT-01.2-contratos-zod-rust-semillas.md) — **18 HUs**
- [Feature 01.3: packages/service-kit (RLS, Outbox/Inbox, Circuit Breaker, OTel) y Plantilla de Microservicio](EP-01-cimientos-monorepo-contratos-service-kit/FT-01.3-service-kit-rls-outbox-inbox.md) — **13 HUs**
- [Feature 01.4: Motor de Impuestos Determinístico Compartido (packages/tax-engine + Rust)](EP-01-cimientos-monorepo-contratos-service-kit/FT-01.4-motor-impuestos-compartido.md) — **4 HUs**

### [ÉPICA 02: App Instalable (Tauri) — Base Local, Seguridad de Dispositivo y Autenticación](EP-02-pos-base-local-seguridad-autenticacion/README.md)
- [Feature 02.1: Shell Tauri, Almacenamiento Cifrado SQLCipher, Snapshots y Diagnóstico Local](EP-02-pos-base-local-seguridad-autenticacion/FT-02.1-shell-tauri-sqlcipher-respaldos.md) — **17 HUs**
- [Feature 02.2: Enrolamiento de Caja SaaS, Licencia Firmada Ed25519 y Ventana de Gracia Offline](EP-02-pos-base-local-seguridad-autenticacion/FT-02.2-enrolamiento-licencia-gracia-offline.md) — **13 HUs**
- [Feature 02.3: Login Offline por PIN Argon2id, Bloqueo Progresivo y Cambio Rápido de Cajero](EP-02-pos-base-local-seguridad-autenticacion/FT-02.3-login-pin-offline-bloqueo.md) — **9 HUs**
- [Feature 02.4: Autorizaciones en Caja con Supervisor/Dueño, Auditoría SHA-256 y Protección de Reloj](EP-02-pos-base-local-seguridad-autenticacion/FT-02.4-autorizaciones-auditoria-reloj.md) — **4 HUs**

### [ÉPICA 03: App Instalable — Ventas, Carrito, Precios, Medios de Pago y Devoluciones (Offline)](EP-03-pos-ventas-carrito-pagos-devoluciones/README.md)
- [Feature 03.1: Escaneo HID, Búsqueda Instantánea FTS5, Atajos de Teclado y Pantalla de Venta](EP-03-pos-ventas-carrito-pagos-devoluciones/FT-03.1-escaneo-busqueda-carrito-ui.md) — **19 HUs**
- [Feature 03.2: Pesaje, Códigos de Empaque (pack_qty), Artículo Genérico y Envases Retornables](EP-03-pos-ventas-carrito-pagos-devoluciones/FT-03.2-pesaje-empaques-generico-retornables.md) — **7 HUs**
- [Feature 03.3: Descuentos, Cambio de Precio, Redondeo COP, Bolsas y Carritos en Espera](EP-03-pos-ventas-carrito-pagos-devoluciones/FT-03.3-descuentos-redondeo-carritos-espera.md) — **6 HUs**
- [Feature 03.4: Cobro Atómico (CompleteSale), Pagos Mixtos e Idempotencia de Clic](EP-03-pos-ventas-carrito-pagos-devoluciones/FT-03.4-cobro-atomico-pagos-mixtos.md) — **17 HUs**
- [Feature 03.5: Anulaciones, Devoluciones Parciales/Totales y Cambios de Producto](EP-03-pos-ventas-carrito-pagos-devoluciones/FT-03.5-anulaciones-devoluciones-cambios.md) — **5 HUs**

### [ÉPICA 04: App Instalable — Periféricos de Mostrador e Impresión ESC/POS](EP-04-pos-perifericos-impresion-escpos/README.md)
- [Feature 04.1: Impresora Térmica ESC/POS, Plantillas de Tirilla, Cajón Monedero y Balanza](EP-04-pos-perifericos-impresion-escpos/FT-04.1-impresora-escpos-plantillas-cajon-balanza.md) — **16 HUs**

### [ÉPICA 05: App Instalable — Control de Turnos, Efectivo y Arqueo Ciego](EP-05-pos-turnos-efectivo-arqueo-ciego/README.md)
- [Feature 05.1: Apertura de Turno, Movimientos de Efectivo y Retiros Parciales (Safe Drop)](EP-05-pos-turnos-efectivo-arqueo-ciego/FT-05.1-apertura-turno-movimientos-safe-drop.md) — **11 HUs**
- [Feature 05.2: Arqueo Ciego por Denominación COP, Cálculo de Descuadres, Reporte Z y Reapertura](EP-05-pos-turnos-efectivo-arqueo-ciego/FT-05.2-arqueo-ciego-descuadres-reporte-z.md) — **8 HUs**

### [ÉPICA 06: App Instalable — Clientes y Cartera de Fiados en Caja (Offline)](EP-06-pos-clientes-fiados-cartera-offline/README.md)
- [Feature 06.1: Alta Rápida de Cliente en Caja, Autorizados y Consentimiento Habeas Data](EP-06-pos-clientes-fiados-cartera-offline/FT-06.1-alta-rapida-cliente-habeas-data.md) — **6 HUs**
- [Feature 06.2: Venta a Crédito (Fiado), Modos de Cupo, Recepción y Anulación de Abonos](EP-06-pos-clientes-fiados-cartera-offline/FT-06.2-venta-fiada-modos-cupo-abonos.md) — **6 HUs**

### [ÉPICA 07: Motor de Sincronización Offline-First (sync-service + Cliente Rust)](EP-07-sincronizacion-offline-first/README.md)
- [Feature 07.1: Motor Cliente en Rust — Outbox, Compresión, Firma, Backoff y Circuit Breaker](EP-07-sincronizacion-offline-first/FT-07.1-motor-cliente-rust-outbox-breaker.md) — **5 HUs**
- [Feature 07.2: sync-service en Nube — Ingesta Idempotente, Orden terminal_seq, Cuarentena y Fan-out](EP-07-sincronizacion-offline-first/FT-07.2-sync-service-push-idempotencia-orden.md) — **13 HUs**
- [Feature 07.3: Bajada Incremental por xid8, Bootstrap S3 y Heartbeat](EP-07-sincronizacion-offline-first/FT-07.3-pull-xid8-bootstrap-s3-heartbeat.md) — **7 HUs**

### [ÉPICA 08: Microservicios de Dominio Core en Nube (tenant, identity, device, catalog)](EP-08-microservicios-core-nube/README.md)
- [Feature 08.1: tenant-service — Tiendas, Planes, Add-ons, Sucursales y Entitlements](EP-08-microservicios-core-nube/FT-08.1-tenant-service-planes-sucursales.md) — **11 HUs**
- [Feature 08.2: identity-service — OIDC/MFA, Activación de Cuenta, Usuarios, Roles y PIN](EP-08-microservicios-core-nube/FT-08.2-identity-service-oidc-mfa-roles-pin.md) — **20 HUs**
- [Feature 08.3: device-service — Cajas, Códigos de Enrolamiento y Emisión de Licencias KMS](EP-08-microservicios-core-nube/FT-08.3-device-service-cajas-enrolamiento-kms.md) — **8 HUs**
- [Feature 08.4: catalog-service — Productos, Precios, Presentaciones, Importación, Genéricos y Promociones](EP-08-microservicios-core-nube/FT-08.4-catalog-service-productos-precios-promos.md) — **22 HUs**

### [ÉPICA 09: Microservicios Operativos en Nube (sales, cash, inventory, customer, audit)](EP-09-microservicios-operativos-nube/README.md)
- [Feature 09.1: sales-service — Registro de Ventas, Consecutivos Únicos y Conciliación de Pagos Digitales](EP-09-microservicios-operativos-nube/FT-09.1-sales-service-ventas-conciliacion.md) — **8 HUs**
- [Feature 09.2: cash-service — Consolidación de Turnos, Recalculo en Nube y Cierre Forzado Remoto](EP-09-microservicios-operativos-nube/FT-09.2-cash-service-turnos-cierre-remoto.md) — **4 HUs**
- [Feature 09.3: inventory-service — Kardex por Deltas, Proveedores, Recepciones, Ajustes, Conteos y Traslados](EP-09-microservicios-operativos-nube/FT-09.3-inventory-service-deltas-compras-conteos.md) — **15 HUs**
- [Feature 09.4: customer-service — Cartera Consolidada, Cupo ALLOCATED, Castigos y Derechos ARCO](EP-09-microservicios-operativos-nube/FT-09.4-customer-service-cartera-arco.md) — **7 HUs**
- [Feature 09.5: audit-service — Bitácora Inmutable con Cadena SHA-256 y Verificación Nocturna](EP-09-microservicios-operativos-nube/FT-09.5-audit-service-cadena-sha256-worm.md) — **4 HUs**

### [ÉPICA 10: App de Gestión Web + Móvil (Expo, Siempre Online) y bff-app](EP-10-app-gestion-web-movil-bff-app/README.md)
- [Feature 10.1: bff-app, Login OIDC/MFA, Step-up MFA y Guardia de Conectividad Siempre Online](EP-10-app-gestion-web-movil-bff-app/FT-10.1-bff-app-login-mfa-guardia-online.md) — **17 HUs**
- [Feature 10.2: Pantallas de Administración de Sucursales, Cajas y Usuarios](EP-10-app-gestion-web-movil-bff-app/FT-10.2-admin-sucursales-cajas-usuarios.md) — **2 HUs**
- [Feature 10.3: Pantallas de Catálogo con Cámara, Precios, Inventario, Clientes, Conciliación y Suscripción](EP-10-app-gestion-web-movil-bff-app/FT-10.3-admin-catalogo-camara-inventario-clientes.md) — **23 HUs**

### [ÉPICA 11: Reportería CQRS, Dashboard en Vivo y Notificaciones Multicanal](EP-11-reporteria-cqrs-dashboard-notificaciones/README.md)
- [Feature 11.1: reporting-service (CQRS), Stream SSE, Componentes ui-reports y Exportaciones](EP-11-reporteria-cqrs-dashboard-notificaciones/FT-11.1-reporting-service-cqrs-dashboard-export.md) — **23 HUs**
- [Feature 11.2: notification-service — Push, WhatsApp, Correo, SMS y Cumplimiento Ley 2300](EP-11-reporteria-cqrs-dashboard-notificaciones/FT-11.2-notification-service-push-whatsapp-ley2300.md) — **6 HUs**

### [ÉPICA 12: Consola del Super Admin (platform-console + bff-platform), Facturación SaaS, Mora y Bloqueos](EP-12-consola-super-admin-cobro-mora-bloqueos/README.md)
- [Feature 12.1: Consola Interna del Super Admin, Saga de Creación de Tienda, DLT y Soporte JIT](EP-12-consola-super-admin-cobro-mora-bloqueos/FT-12.1-consola-super-admin-saga-tienda-jit.md) — **13 HUs**
- [Feature 12.2: Facturación de Suscripciones, Pasarela de Pagos, Factura Propia SaaS y Pagos Manuales](EP-12-consola-super-admin-cobro-mora-bloqueos/FT-12.2-facturacion-suscripciones-pasarela-pagos.md) — **6 HUs**
- [Feature 12.3: Motor de Avisos de Pago Retrasado (Dunning D-5 a D+60), Prórrogas y Bloqueo Progresivo](EP-12-consola-super-admin-cobro-mora-bloqueos/FT-12.3-motor-mora-dunning-prorrogas-bloqueo.md) — **12 HUs**

### [ÉPICA 13: Edición Local (Pago Único, Activación Online Única y Respaldos .tdbak)](EP-13-edicion-local-pago-unico-respaldos/README.md)
- [Feature 13.1: Build local, Separación Cajero / Administrador con Contraseña y Código de Recuperación](EP-13-edicion-local-pago-unico-respaldos/FT-13.1-build-local-cajero-admin-recuperacion.md) — **6 HUs**
- [Feature 13.2: Activación Online Única con Serial, Huella Tolerante (3 de 5) y Llave en TPM/DPAPI](EP-13-edicion-local-pago-unico-respaldos/FT-13.2-activacion-online-unica-serial-huella-tpm.md) — **9 HUs**
- [Feature 13.3: Administración y Reportes Locales Completos (packages/admin-ui con LocalSqliteDataProvider)](EP-13-edicion-local-pago-unico-respaldos/FT-13.3-administracion-reportes-locales-sqlite.md) — **4 HUs**
- [Feature 13.4: Respaldo Cifrado .tdbak, Solicitud de Cambio de Equipo y Restauración](EP-13-edicion-local-pago-unico-respaldos/FT-13.4-respaldo-tdbak-cambio-equipo-restauracion.md) — **5 HUs**
- [Feature 13.5: Actualizaciones (updates_until), Recuperación de Contraseña y Migración a la Nube](EP-13-edicion-local-pago-unico-respaldos/FT-13.5-actualizaciones-recuperacion-migracion-nube.md) — **3 HUs**

### [ÉPICA 14: Infraestructura Productiva, Seguridad OWASP, Observabilidad, DR y Lanzamiento](EP-14-infraestructura-seguridad-observabilidad-piloto/README.md)
- [Feature 14.1: Infraestructura como Código (Terraform), Edge WAF, Hardening OWASP y Despliegue Canary](EP-14-infraestructura-seguridad-observabilidad-piloto/FT-14.1-terraform-waf-seguridad-hardening.md) — **20 HUs**
- [Feature 14.2: Simulador de Cajas, Pruebas k6/E2E/Chaos, Alertas, Runbooks, Updater y Lanzamiento al Público](EP-14-infraestructura-seguridad-observabilidad-piloto/FT-14.2-carga-k6-chaos-alertas-runbooks-piloto.md) — **24 HUs**

### [ÉPICA 15 (FUTURA — Mapeada): Facturación Electrónica y Documento Equivalente POS DIAN](EP-15-futuro-facturacion-electronica-dian/README.md)
- [Feature 15.1: einvoicing-service, Resoluciones DIAN y Bloques de Numeración por Caja](EP-15-futuro-facturacion-electronica-dian/FT-15.1-einvoicing-resoluciones-bloques-dian.md) — **5 HUs**
- [Feature 15.2: Estrategias Fiscales en Caja (DianBlockNumbering, CUDE/CUFE, QR y Plantilla Fiscal)](EP-15-futuro-facturacion-electronica-dian/FT-15.2-estrategias-fiscales-caja-cude-qr.md) — **5 HUs**
- [Feature 15.3: Transmisión UBL 2.1, Notas de Ajuste/Crédito, Documento Soporte, Contingencia y WORM](EP-15-futuro-facturacion-electronica-dian/FT-15.3-ubl21-proveedor-tecnologico-contingencia-worm.md) — **8 HUs**
