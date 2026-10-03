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
    { "event_id": "…", "status": "ACCEPTED" },
    { "event_id": "…", "status": "DUPLICATE" },
    { "event_id": "…", "status": "REJECTED", "code": "SCHEMA_INVALID" }
  ],
  "ack_up_to_seq": 15234,
  "server_time": "2026-10-03T20:21:10Z"
}
// 409 GAP_DETECTED  { "expected_seq": 15200 }
// 426 UPGRADE_REQUIRED · 429/503 con Retry-After · 401 token · 403 terminal revocada
```

`ACCEPTED` = durable en `sync-service`; la aplicación en cada servicio es asíncrona (los problemas posteriores van a cuarentena y se ven en la App de Gestión).

### `GET /v1/sync/pull?stream=catalog&cursor=<opaco>&limit=1000`
```json
{ "stream": "catalog",
  "changes": [
    { "entity": "product", "op": "upsert", "data": { "id": "…", "name": "Gaseosa 400ml", "price_cents": 250000, "...": "…" } },
    { "entity": "product_barcode", "op": "delete", "id": "…" }
  ],
  "next_cursor": "opaco", "has_more": false }
// 410 RESYNC_REQUIRED → descargar bootstrap
```
Streams: `catalog`, `prices`, `promotions`, `taxes`, `users`, `customers`, `customer_balances`, `stock_snapshot`, `config` (incluye `fiscal_mode` y features). *Futuro:* `numbering`.

### `POST /v1/terminals/heartbeat`
```json
// request
{ "app_version": "1.4.0", "pending_outbox": 37, "oldest_pending_at": "…", "last_seq": 15234,
  "printer": "OK", "disk_free_mb": 18234, "local_time": "…", "open_session_id": "…" }
// 200
{ "server_time": "…", "license_token": "eyJ…", "flags": { "pull_now": ["catalog"], "update_available": "1.4.1", "revoked": false },
  "messages": [ { "level": "warn", "text": "Tu suscripción vence en 3 días" } ] }
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
| GET/POST/PATCH | `/v1/app/customers` · `PATCH …/{id}/credit` · `POST …/{id}/write-off` | customer |
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
| `PUT /v1/app/me/notifications` | Preferencias de notificaciones push del usuario |

## 3c. Activación de la Edición Local — `device-service` (`/v1/local-activation/*`)

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
