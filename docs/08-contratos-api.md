# 08 — Contratos de API

Base: `https://api.tienditaonline.co` · Versionado en ruta (`/v1`) · JSON UTF-8 · Errores en formato **RFC 9457 (Problem Details)** · Fechas ISO-8601 con zona · Paginación por cursor.

## 0. Enrutamiento en el gateway

| Prefijo | Destino | Cliente | Audiencia del token |
|---|---|---|---|
| `/v1/devices/*`, `/v1/terminals/*` | `device-service` | App Instalable (máquina) | `pos-device` |
| `/v1/sync/*` | `sync-service` | App Instalable (máquina) | `pos-device` |
| `/v1/pos-reports/*` | `bff-pos` → `reporting-service` | App Instalable (Reportes de la sucursal, online) | `pos-device` + PIN del usuario |
| `/v1/app/*` | `bff-app` → servicios dueños y `reporting-service` | App de Gestión (web/iOS/Android): administración + reportes | `mgmt-app` |
| `/v1/activation` | `identity-service` | Enlace de activación del dueño (token de un solo uso) | token de activación |
| `/v1/platform/*` | servicios dueños (vía `bff-platform`) | Consola del super admin (host separado, IP permitidas) | `platform` + MFA |
| `/v1/webhooks/*` | servicio correspondiente | Proveedores externos | firma HMAC |

Los microservicios no se exponen directamente; solo el gateway y los BFF son públicos (internamente, gRPC o HTTP con mTLS).

## 1. Cabeceras comunes

| Cabecera | Uso |
|---|---|
| `Authorization: Bearer <jwt>` | Usuario (OIDC) o dispositivo |
| `X-Request-Id` | Correlación (generado si no viene) |
| `Idempotency-Key` | Obligatorio en todo `POST`/`PATCH`/`DELETE` de `/v1/app/*`; en sync se usa el `event_id` |
| `X-App-Version` | Versión de la App Instalable / App de Gestión |
| `X-Device-Signature` | Firma Ed25519 del cuerpo (solo cajas) |
| `Content-Encoding: gzip` | Lotes de sync |

## 2. Dispositivos y sincronización (terminal)

### `POST /v1/devices/enroll`
```json
// request
{ "enrollment_code": "K7Q2-9XMA", "public_key": "base64-ed25519", "fingerprint": "sha256:…",
  "platform": "windows", "app_version": "1.4.0" }
// 201
{ "terminal_id": "…", "tenant_id": "…", "branch_id": "…", "warehouse_id": "…",
  "license_token": "eyJ…", "bootstrap_url": "https://…presigned…", "server_time": "…" }
```

### `POST /v1/devices/token`
Aserción JWT firmada con la llave del dispositivo (`private_key_jwt`) → access token de 15 min con claims `tid`, `bid`, `term`, `scope=sync`.

### `POST /v1/sync/push`
```json
// request (gzip, máx 1 MB, máx 200 eventos, ordenados por terminal_seq)
{ "terminal_id": "…", "batch_id": "uuidv7", "events": [ { /* envelope, ver 03 §3 */ } ] }
// 200
{
  "results": [
    { "event_id": "…", "terminal_seq": 1, "status": "ACCEPTED" },
    { "event_id": "…", "terminal_seq": 2, "status": "DUPLICATE" },
    { "event_id": "…", "terminal_seq": 3, "status": "CONFLICT" }
  ],
  "ack_up_to_seq": 15234,
  "server_time": "2026-10-03T20:21:10Z",
  "server_time_ms": 1760000000000
}
// 409 GAP_DETECTED  { "error": "GAP_DETECTED", "expected_seq": 15200 }
// 413 PAYLOAD_TOO_LARGE  { "error": "PAYLOAD_TOO_LARGE" }
// 426 UPGRADE_REQUIRED  { "error": "UPGRADE_REQUIRED", "min_version": "1.2.0" }
```

`ACCEPTED` = durable en `sync-service`; la aplicación en cada servicio es atómica o asíncrona. Los eventos `sale.completed` y `sale.created` asientan la venta en `sales-service` y consolidan en tiempo real el Libro Fiscal de Operaciones Diarias (Art. 616 E.T.). Los eventos defectuosos van a `sync_quarantine` y se auditan desde la App de Gestión.

### `GET /v1/sync/pull?stream=catalog&cursor_xid=0`
```json
{
  "stream": "catalog",
  "safe_upto": "105",
  "next_cursor": "105",
  "has_more": false,
  "changes": [
    { "entity_id": "prod-1", "stream": "catalog", "op": "upsert", "source_version": 2, "row_xid": "101", "payload": { "name": "Arroz Diana 1kg", "price_cents": 500000 } }
  ]
}
// 410 RESYNC_REQUIRED → descargar bootstrap S3
{
  "error": "RESYNC_REQUIRED",
  "code": "RESYNC_REQUIRED",
  "bootstrap_url": "https://s3.tiendita.local/bootstrap/...",
  "snapshot_cursor_xid": "500"
}
```
Streams: `catalog`, `prices`, `promotions`, `taxes`, `users`, `customers`, `customer_balances`, `stock_snapshot`, `config` (incluye `fiscal_mode` y features). *Futuro:* `numbering`.

### `POST /v1/terminals/heartbeat` (alias `/v1/sync/heartbeat`)
```json
// request
{
  "tenant_id": "…",
  "branch_id": "…",
  "terminal_id": "…",
  "app_version": "1.4.0",
  "pending_outbox_count": 0,
  "oldest_pending_at_ms": null,
  "local_time_ms": 1760000000000
}
// 200
{
  "server_time": "2026-10-03T20:21:10.000Z",
  "server_time_ms": 1760000000000,
  "clock_skew_warning": null,
  "flags": { "pull_now": ["catalog"] }
}
```
Si el reloj de la máquina difiere en más de 15 minutos respecto a la nube, `clock_skew_warning` alerta al cajero/administrador para evitar inconsistencias en reportes y DIAN.

### `GET /v1/app/quarantine` (alias `/v1/sync/quarantine`)
Lista eventos retenidos en cuarentena para el tenant actual (`terminal.read`).

### `POST /v1/app/quarantine/{id}/resolve` (alias `/v1/sync/quarantine/{id}/resolve`)
Resuelve o descarta un evento en cuarentena con trazabilidad de auditoría (`terminal.manage`).
```json
// request
{ "action": "RESOLVED", "note": "Corregido y reprocesado por soporte" }
// 200
{ "resolved": true, "record": { "id": "…", "status": "RESOLVED", "resolved_by": "…", "resolution_note": "…" } }
```

### `POST /v1/app/sync/project-change`
Permite proyectar cambios reactivos downstream hacia las cajas (`catalog.manage`).
```json
// request
{ "stream": "catalog", "entityId": "prod-100", "op": "upsert", "payload": { "name": "Leche Entera", "price_cents": 450000 } }
// 200
{ "projected": true }
```

### `GET /v1/pos-reports/receipts/lookup?prefix=C02&number=1234`
Búsqueda online de una venta de otra caja de la misma sucursal para devoluciones (si hay red).

## 3. Administración — `bff-app` (App de Gestión web/móvil, siempre online)

Escrituras síncronas contra el servicio dueño. Todo `POST`/`PATCH`/`DELETE` exige `Idempotency-Key`; las ediciones exigen `If-Match: <version>`.

| Método | Ruta | Servicio dueño |
|---|---|---|
| POST | `/v1/activation/{token}` (cambiar contraseña temporal, configurar MFA, aceptar términos) | identity |
| GET/POST/PATCH | `/v1/app/branches` | tenant |
| GET/POST | `/v1/app/subscription` · `/v1/app/subscription/change-plan` · `/v1/app/subscription/payment-method` | tenant |
| GET/POST | `/v1/app/terminals` · `POST …/{id}/enrollment-code` (devuelve código + QR) · `POST …/{id}/revoke` · `POST …/{id}/force-close-session` | device / cash |
| GET/POST/PATCH | `/v1/app/users` · `POST …/{id}/reset-pin` · `POST …/{id}/invite` | identity |
| GET/POST/PATCH | `/v1/app/roles` | identity |
| GET/POST/PATCH/DELETE | `/v1/app/products` · `/categories` · `/brands` · `/taxes` | catalog |
| GET | `/v1/app/products/by-barcode/{code}` (escáner de cámara) | catalog |
| POST | `/v1/app/products/import` → `202` + `GET /v1/app/jobs/{id}` | catalog |
| GET/POST | `/v1/app/generic-items` (vendidos como genéricos) · `POST …/{id}/create-product` | catalog |
| GET/POST | `/v1/app/branches/{id}/prices` · `/v1/app/promotions` | catalog |
| GET/POST/PATCH | `/v1/app/customers` · `PATCH …/{id}/credit` · `POST …/{id}/write-off` · `POST …/{id}/contact-check` · `POST …/{id}/contact-log` · `GET …/{id}/contact-audit` | customer |
| POST | `/v1/app/inventory/receipts` · `/v1/app/inventory/adjustments` · `/v1/app/inventory/counts` · `/v1/app/inventory/transfers` | inventory |
| GET | `/v1/app/inventory/levels?branch_id=` | inventory |
| GET/POST | `/v1/app/payments/reconciliation` | sales |
| GET/POST | `/v1/app/quarantine` · `POST …/{id}/resolve` | sync |
| *Futuro* | `/v1/app/einvoicing/resolutions` · `/v1/app/einvoicing/documents` | einvoicing |

Las operaciones de **caja** (ventas, turnos, movimientos de efectivo, devoluciones, abonos, alta rápida de cliente) **no** tienen endpoint REST: viajan como eventos por `/v1/sync/push`.

## 3b. Reportes — `bff-app` (`/v1/app/reports/*`) y `bff-pos` (`/v1/pos-reports/*`, mismos contratos limitados a la sucursal de la caja)

Solo `GET`. Parámetros comunes: `branch_id`, `terminal_id`, `from`, `to`, `group_by`.

| Ruta (sufijo) | Contenido |
|---|---|
| `/dashboard` | KPIs del día + comparativo; `/dashboard/stream` (SSE) para actualización en vivo |
| `/sales` | Ventas por periodo / sucursal / caja / cajero / medio de pago / hora |
| `/products` | Top vendidos, sin rotación, margen |
| `/shifts` | Turnos y descuadres |
| `/credit` | Cartera y antigüedad |
| `/inventory` | Existencias y alertas |
| `/terminals` | Estado de cajas (heartbeat, pendientes) |
| `/audit` | Auditoría |
| `/taxes` | Impuestos discriminados del periodo |
| `POST /exports` → `202` | Genera Excel/PDF asíncrono y devuelve URL prefirmada de corta vida |
| `/reports/libro-fiscal` | Libro Fiscal de Operaciones Diarias (Art. 616 E.T.) consolidado en centavos |
| `/reports/libro-fiscal/csv` | Descarga de Libro Fiscal tabular CSV homologado para requerimientos DIAN |
| `/reports/libro-fiscal/thermal` | Tirilla de Cierre Fiscal Diario Reporte Z en texto ESC/POS (80 mm / 58 mm) |
| `/reports/accounting-export` | Exportación contable tabular (Siigo / World Office / Alegra) con cuentas PUC |
| `PUT /v1/app/me/notifications` | Preferencias de notificaciones push del usuario |

### 3b. Facturación Electrónica & Documento Equivalente POS DIAN (`/v1/app/einvoicing/*`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/v1/app/einvoicing/resolutions` | Lista resoluciones activas y bloques de folios autorizados por tenant |
| `POST` | `/v1/app/einvoicing/resolutions` | Registra resolución DIAN validando rangos sin solapamiento (GiST) y custodia de clave en AWS Secrets Manager |
| `GET` | `/v1/app/einvoicing/alerts` | Semáforo de vencimiento (<30 días) y agotamiento de rango (<500 folios) |
| `POST` | `/v1/app/einvoicing/cude` | Calcula hash CUDE canónico SHA-384 (96 caracteres) y URL de búsqueda QR en VPFE DIAN |
| `POST` | `/v1/app/einvoicing/ubl-preview` | Construye y previsualiza documento XML oficial en esquema OASIS UBL 2.1 |
| `GET` | `/v1/app/einvoicing/contingency` | Estado de contingencia Tipo 4 y archivo inmutable WORM de 10 años en Amazon S3 |
| `POST` | `/v1/app/einvoicing/test-set` | Ejecuta el Set de Pruebas de Habilitación DIAN con TestSetId oficial (HU-463) |
| `POST` | `/v1/app/einvoicing/fiscal-mode` | Conmuta en caliente el modo fiscal (NONE <-> DIAN_POS) sin alterar comprobantes anteriores (HU-464) |

### 3c. Notificaciones Multicanal, Comprobantes Digitales y Ley 2300 (`/v1/app/notifications/*`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/v1/app/notifications/invoice-receipt` | Envío digital de comprobante de venta o Documento Equivalente Electrónico POS por WhatsApp o Email con CUDE SHA-384 y enlace QR oficial de la DIAN (HU-327) |
| `POST` | `/v1/app/notifications/debt-reminder` | Despacho de recordatorio de cobro de cartera a deudores con verificación previa de horarios legales y generación automática de evidencia auditable ante la SIC (HU-109, HU-364 & Ley 2300 de 2023) |
| `GET` | `/v1/app/notifications` | Historial auditable de notificaciones despachadas y encoladas por el establecimiento |

## 3d. Activación de la Edición Local — `device-service` (`/v1/local-activation/*`)

Públicos (sin sesión), con rate limit estricto (5 intentos/hora por IP y por serial), TLS con *pinning* y respuestas firmadas. Solo se usan cuando el usuario pulsa el botón correspondiente.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/v1/local-activation/activate` | `{serial, machine_hashes, device_pubkey, nonce, app_version}` | `200 {license}` firmada · `409 ALREADY_ACTIVATED` · `403 REVOKED` · `404 INVALID_SERIAL` · `429` |
| POST | `/v1/local-activation/trial` | `{machine_hashes, device_pubkey, nonce}` | Licencia de prueba firmada (15 días) · `409 TRIAL_ALREADY_USED` |
| POST | `/v1/local-activation/deactivate` | `{license_id, activation_id, timestamp}` firmado con la llave del equipo | `200` (libera el serial; la app borra su licencia) |
| POST | `/v1/local-activation/transfer-request` | `{license_id, activation_id, backup_sha256, backup_created_at, backup_counts}` firmado con la llave del equipo | `200` confirmación firmada; libera el serial sin consumir transferencia; el equipo pasa a `TRANSFERRED` |
| POST | `/v1/local-activation/transfer-complete` | `{request_id, new_activation_id, restored_backup_sha256}` firmado por el equipo nuevo | `200` (cierra la solicitud) |
| POST | `/v1/local-activation/restore-check` | `{backup_license_id, backup_sha256}` firmado por el equipo | `200 allowed` · `403 APPROVAL_REQUIRED` (otra licencia) |
| POST | `/v1/local-activation/refresh` | `{license_id, activation_id, nonce}` firmado con la llave del equipo | Licencia con `updates_until` vigente (tras renovar) |
| POST | `/v1/local-activation/admin-reset` | Solicitud firmada con la llave del equipo | `202` pendiente → la app consulta `GET …/admin-reset/{id}` hasta que el super admin apruebe; devuelve permiso de un solo uso |

## 4. Plataforma (super admin) — `bff-platform`

Expuesto solo en un host separado con allow-list de IP y MFA obligatorio. Toda operación queda en auditoría.

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/PATCH | `/v1/platform/tenants` (POST ejecuta la saga: tenant → dueño → sucursal → `CAJA-01` → envío de activación) | Crear y administrar tiendas |
| POST | `/v1/platform/tenants/{id}/suspend` · `/reactivate` · `/grace-extensions` · `/change-plan` | Estado y plan |
| GET/POST/PATCH | `/v1/platform/tenants/{id}/users` · `POST …/{uid}/resend-activation` · `POST …/{uid}/reset-mfa` | Usuarios de cualquier tienda |
| GET/POST/PATCH | `/v1/platform/plans` · `/v1/platform/addons` · `/v1/platform/coupons` | Catálogo comercial |
| GET | `/v1/platform/billing/invoices?status=&overdue=true` | Facturas y morosidad |
| POST | `/v1/platform/billing/invoices/{id}/payments` (pago manual con comprobante) · `…/retry-charge` | Cobros |
| GET/POST | `/v1/platform/local-licenses` (crea licencia y devuelve el serial una sola vez) · `GET …/{id}/activations` · `POST …/{id}/release-activation` · `POST …/{id}/revoke` · `POST …/{id}/renew` · `GET /v1/platform/local-transfers` · `POST /v1/platform/local-restore-approvals` · `GET/POST /v1/platform/local-admin-resets/{id}/approve` | Edición Local |
| GET | `/v1/platform/health` · `/v1/platform/metrics` (MRR, churn, mora, conversiones) | Operación y negocio |
| POST | `/v1/platform/support-access` | Acceso temporal de soporte (JIT) |

### 4.1 Contratos de la Consola del Super Admin (Épica 12)

#### 4.1.1 `POST /v1/platform/tenants` (Saga de Alta Orquestada JIT)
Ejecuta de forma atómica la creación de tienda, sucursal `MAIN`, terminal `CAJA-01`, entitlements por plan y usuario `OWNER` con token de activación.

- **Cabeceras:** `Authorization: Bearer <jwt-platform-super-admin>`
- **Cuerpo (`application/json`):**
```json
{
  "businessName": "Supermercado El Cóndor",
  "documentType": "NIT",
  "documentNumber": "901555888",
  "nitDv": 3,
  "planCode": "NEGOCIO",
  "ownerEmail": "gerencia@elcondor.co",
  "ownerPhone": "+573101234567",
  "trialDays": 15
}
```
- **Validación:** El campo `nitDv` es validado con el algoritmo Módulo 11 oficial de la DIAN (Art. 555-2 E.T.). Si no coincide, retorna `400 INVALID_NIT_DV`.
- **Respuesta 201 Created:**
```json
{
  "tenantId": "01a1a246-a060-7c7c-9063-7024c0619319",
  "mainBranchId": "01a1a246-a060-7c7e-85a0-0d12e345a1b2",
  "terminalCode": "CAJA-01",
  "terminalId": "01a1a246-a060-7c82-a69c-d26ce233525a",
  "activationToken": "act_01a1a246-a060-7c85-98f1-c456a789b0c1",
  "ownerUserId": "usr-01a1a246-a060-7c88-b7d2-e567b890c1d2"
}
```

#### 4.1.2 `POST /v1/platform/local-licenses` (Emisión de Licencia Edición Local)
Genera una licencia perpetua o por suscripción para la Edición Local standalone sin internet.

- **Cuerpo (`application/json`):**
```json
{
  "tenant_id": "01a1a246-a060-7c7c-9063-7024c0619319",
  "edition": "LOCAL_PLUS",
  "terminals_allowed": 3,
  "duration_days": 365
}
```
- **Respuesta 201 Created:**
```json
{
  "license_id": "lic-01a1a246-99aa-88bb",
  "serial_key": "TDL-149C5-86BB3-C0BF9-9278E",
  "serial_last4": "9278E",
  "edition": "LOCAL_PLUS",
  "terminals_allowed": 3,
  "expires_at_iso": "2027-11-03T11:00:00.000Z"
}
```
> **Nota de Seguridad:** La clave `serial_key` completa en texto claro solo se retorna una única vez en la respuesta `201`. Consultas posteriores (`GET /v1/platform/local-licenses`) solo exponen `serial_last4`.

#### 4.1.3 `POST /v1/platform/support-access` (Acceso JIT 30 Minutos)
Autoriza una sesión de soporte técnico con permisos de solo lectura o intervención supervisada durante 30 minutos (1.800 s), exigiendo motivo justificado para estricto cumplimiento con la SIC y Ley 1581 (Habeas Data).

- **Cuerpo (`application/json`):**
```json
{
  "tenant_id": "01a1a246-a060-7c7c-9063-7024c0619319",
  "reason": "Auditoría de discrepancia de sincronización ticket #4812"
}
```
- **Respuesta 200 OK:**
```json
{
  "session_id": "01a1a249-ada0-776b-ad3a-4d0554a31ced",
  "tenant_id": "01a1a246-a060-7c7c-9063-7024c0619319",
  "expires_at_iso": "2026-11-03T11:30:00.000Z",
  "expires_in_seconds": 1800
}
```

### 4.2 Endpoints de Hardware de Periféricos y Abonos de Cartera (`bff-app`)

#### 4.2.1 Abonos a Cartera de Fiado (`POST /v1/app/customers/{id}/payments`)
- **Permiso requerido:** `customer.credit_manage`
- **Cuerpo (JSON):**
```json
{
  "amountCents": 5000000,
  "method": "NEQUI",
  "reference": "NEQ-TRX-20261103"
}
```
- **Respuesta 201 Created:**
```json
{
  "success": true,
  "receiptNumber": "REC-2026-81000",
  "customerId": "cust-02",
  "customerName": "Don Carlos Ramírez (Taller)",
  "previousBalanceCents": 14500000,
  "amountPaidCents": 5000000,
  "newBalanceCents": 9500000,
  "method": "NEQUI",
  "reference": "NEQ-TRX-20261103",
  "receivedBy": "Don Pedro Pérez",
  "occurredAt": "2026-11-03T14:30:00.000Z",
  "legalNotice": "Recibo de abono a cartera expedido de conformidad con la Ley 1581 de 2012 y Art. 616 del E.T."
}
```

#### 4.2.2 Telemetría de Periféricos de Caja (`GET /v1/app/terminals/{id}/diagnostics`)
- **Permiso requerido:** `terminal.read`
- **Respuesta 200 OK:**
```json
{
  "terminalId": "term-01",
  "code": "CAJA-01",
  "status": "ONLINE",
  "peripherals": {
    "printer": {
      "model": "ESC/POS 80mm Direct Thermal",
      "status": "READY",
      "paperLevel": "FULL",
      "cutterOk": true,
      "temperatureC": 38
    },
    "scale": {
      "model": "Systel Croma Serial/USB (Protocolo Dibal)",
      "status": "READY",
      "calibrated": true,
      "tareGrams": 0
    },
    "drawer": {
      "model": "RJ-11 Solenoid Kick 24V",
      "status": "CLOSED",
      "kicksToday": 24
    },
    "scanner": {
      "model": "Zebra DS2208 2D Barcode (USB-HID)",
      "status": "CONNECTED"
    }
  },
  "syncEngine": {
    "outboxPendingCount": 0,
    "circuitBreakerState": "CLOSED",
    "lastSyncAgoSec: 8,
    "averageLatencyMs": 34
  }
}
```

#### 4.2.3 Prueba de Impresión y Cajón Monedero
- `POST /v1/app/terminals/{id}/test-print`: Emite ticket de prueba ESC/POS con código de corte y alineación.
- `POST /v1/app/terminals/{id}/test-drawer`: Emite pulso eléctrico RJ-11 (24V 100ms) al solenoide del cajón.

## 5. Webhooks entrantes

| Origen | Ruta | Validación |
|---|---|---|
| Pasarela de suscripciones | `/v1/webhooks/billing/{provider}` | Firma HMAC del proveedor + timestamp ± 5 min + idempotencia por ID de evento |
| Pagos digitales (fase posterior) | `/v1/webhooks/payments/{provider}` | Igual |
| Proveedor tecnológico DIAN (**futuro**) | `/v1/webhooks/einvoicing/{provider}` | Igual |

## 6. Errores (Problem Details)

```json
{ "type": "https://docs.tienditaonline.co/errors/version-conflict",
  "title": "El producto fue modificado por otro usuario", "status": 409,
  "code": "VERSION_CONFLICT", "detail": "La versión actual del producto es 7; enviaste 6.",
  "instance": "/v1/app/products/…", "trace_id": "…" }
```

Nunca se exponen trazas de pila, SQL ni datos de otros tenants en errores.

## 7. Esquemas compartidos

Los esquemas de eventos y DTOs se definen **una sola vez** en `packages/contracts` (Zod) y se generan:
- Tipos TypeScript para microservicios, BFFs, UI de la App Instalable y App de Gestión.
- JSON Schema → tipos Rust (`typify`) para el núcleo de la App Instalable.
- JSON Schema registrado en el **Schema Registry** de Kafka para los eventos entre servicios.
- OpenAPI 3.1 de cada BFF.

Pruebas de contrato en CI: cualquier cambio incompatible en un evento con `schema_version` existente falla el build; Pact verifica BFF ↔ microservicios.
