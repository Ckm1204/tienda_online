# TienditaOnline Gestion

Base Expo para web, Android e iOS. Estado actual: guardia online-only de HU-096.
Todavia no incluye autenticacion, pantallas administrativas ni un BFF operativo.
No debe usarse en produccion como una aplicacion de gestion completa.

## Desarrollo

Desde `repos/`, con Node.js 24 y pnpm 12.16.1:

```powershell
pnpm install --frozen-lockfile
$env:EXPO_PUBLIC_API_URL = "http://127.0.0.1:3000"
pnpm --filter @tiendita/management dev --port 8084
```

La URL debe apuntar al origen del BFF, con HTTPS en produccion. Las variables
`EXPO_PUBLIC_*` quedan visibles en el bundle: nunca contienen secretos. Un cambio
de URL exige reiniciar Metro o reconstruir el bundle. Turbo incluye esta variable
en la clave de cache de compilacion. En dispositivos fisicos, `127.0.0.1` apunta
al propio dispositivo; usar la direccion accesible del servidor de desarrollo.

Sin URL o sin un servidor disponible, la aplicacion permanece bloqueada.
No hay un servidor simulado habilitado en la aplicacion.

## Contrato De Conectividad

El BFF debera ofrecer `GET /health/ready`, publico, sin datos sensibles:

```json
{ "status": "ok", "service": "bff-app" }
```

Debe devolver `200` solo cuando este disponible, `503` en caso contrario y
`Cache-Control: no-store`. Para web entre origenes diferentes, necesita una lista
CORS explicita. Una pagina HTML de portal cautivo, redireccion o JSON de otro
servicio no desbloquea la app. Esta comprobacion no sustituye autenticacion ni
autorizacion del servidor.

## Invariantes

- Comienza bloqueada; exige una comprobacion exitosa del BFF para habilitarse.
- Revisa disponibilidad cada 15 segundos; cada sonda vence a los 5 segundos.
- Un evento de perdida de red bloquea inmediatamente. Si solo cae el BFF y no hay
  solicitudes activas, la deteccion tarda hasta 20 segundos.
- Al perder conexion o pasar a segundo plano, desmonta el contenido protegido,
  descarta borradores locales y cancela solicitudes. No persiste datos de negocio.
- Sin red del dispositivo, o en segundo plano, se pausan las sondas y los reintentos.
- Cada solicitud vence a los 10 segundos. Respuestas de una conexion anterior no
  pueden restaurar datos despues de reconectar.
- Las lecturas usan `cache: no-store`. El servidor tambien debe deshabilitar
  cache HTTP para datos privados, especialmente en clientes nativos.
- Cada escritura se prepara como un comando inmutable con `Idempotency-Key`.
  Un reintento explicito debe reutilizar ese mismo objeto. No hay cola offline,
  reenvio automatico ni persistencia de comandos entre reinicios.
- Los consumidores validan las respuestas con un parser de esquema; no confiar
  en un cast de TypeScript como validacion de datos externos.

Cancelar el cliente no revierte una escritura que ya llego al servidor. Evitar
duplicados exige la implementacion del middleware del BFF de HU-183. La cabecera
por si sola no ofrece semantica de ejecucion unica. Antes de agregar escrituras
autenticadas, resolver OIDC/PKCE, MFA, proteccion CSRF para cookies, aislamiento de
tiendas e idempotencia del servidor. Son requisitos pendientes, no garantias de
esta base.

## Verificacion

```powershell
pnpm --filter @tiendita/management test
pnpm --filter @tiendita/management lint
pnpm --filter @tiendita/management build
pnpm --filter @tiendita/management exec playwright install chromium
pnpm --filter @tiendita/management test:e2e
```

- Vitest: cliente HTTP, cancelacion, idempotencia, eventos de red/ciclo de vida y
  desmontaje de formularios. Las pruebas de componentes sustituyen iconos y
  senales nativas; las pruebas de navegador cargan los modulos reales.
- Playwright: escritorio 1440x900 y navegador movil 390x844; caida real de red del
  contexto, BFF caido con internet activo, reconexion y rechazo de portal cautivo.
  El BFF es interceptado solo en las pruebas. Puerto 8083 reservado; si esta
  ocupado, la suite falla en lugar de reutilizar otro proceso silenciosamente.
- `build`: bundles web, Android e iOS; no produce ni certifica instaladores nativos.
- La CI de esta base vive en `.github/workflows/management.yml` en la raiz Git.

HU-096 permanece en curso hasta validar contra el BFF real y ejecutar los
escenarios de red y segundo plano en Android/iOS. La emulacion de viewport movil
de Playwright no sustituye las pruebas en dispositivos nativos. Los marcadores
del resto del backlog no han sido revalidados como parte de esta implementacion.

## Resultado Local (2026-10-31)

- Instalacion con lockfile congelado: correcta.
- Gestion: 29 pruebas unitarias/componentes, 6 escenarios de navegador,
  TypeScript y exportacion web/Android/iOS correctos.
- Validacion global: no aprobada. La prueba de `audit-service` falla con `ENOENT`
  porque `verifyAuditSqlSchemaAppendOnly` busca `db/cloud/audit-service/001_init.sql`.
  Esa implementacion no se modifico en este trabajo. Una compilacion o prueba
  exitosa de Gestion no implica que todo el monorepo este funcional.
- Workflow YAML validado localmente; ejecucion en GitHub pendiente de publicar
  los cambios. No se realizaron commits ni push.