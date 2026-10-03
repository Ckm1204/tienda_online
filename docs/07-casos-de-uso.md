# 07 — Casos de Uso

Formato: **ID · Nombre** — Actor — Precondiciones — Flujo principal — Alternativos / excepciones — Eventos generados.
Canal: 🖥 App Instalable — Caja (funciona **offline**) · 🛠 App de Gestión web/móvil — Administración (**siempre online**) · 📊 Reportes (**online**, en App de Gestión y App Instalable) · ⚙ Sistema · 🔒 Consola interna.

**Regla:** solo los casos 🖥 funcionan sin internet.

Casos marcados **[FUTURO]** pertenecen al módulo de facturación electrónica y no se implementan en la fase actual.

## A. Plataforma SaaS

| ID | Caso | Actor | Resumen |
|---|---|---|---|
| UC-P01 | Crear tienda | Super Admin 🔒 | En la consola: datos del negocio, documento del dueño (CC o NIT + DV), plan, fecha de corte, sucursal y `CAJA-01`. Se envía al dueño un enlace de activación (email/WhatsApp) |
| UC-P01b | Activar cuenta de dueño | Dueño 🛠 | Abre el enlace, cambia la contraseña temporal, configura MFA, acepta términos y declara no estar obligado a facturar; ve el QR de enrolamiento de `CAJA-01` |
| UC-P02 | Asistente de configuración inicial | Dueño 🛠 | Sucursal, impuestos, importación de productos (Excel/CSV con validación y vista previa) o catálogo base de productos de tienda, usuarios y PIN |
| UC-P03 | Cambio de plan (upgrade/downgrade) | Dueño 🛠 / Super Admin 🔒 | Upgrade inmediato con prorrateo; downgrade al fin del periodo, eligiendo qué cajas/usuarios desactivar si excede límites |
| UC-P04 | Cobro recurrente, avisos y bloqueo | ⚙ | Recordatorio D−5, cobro D0, avisos D+1/D+3/D+5, `RESTRICTED` D+7, `SUSPENDED` D+15, `CANCELLED` D+60 ([10 §3](10-roles-planes-licenciamiento.md)) |
| UC-P04b | Registrar pago manual / dar prórroga | Super Admin 🔒 | Pago por Nequi/consignación con comprobante → reactivación inmediata; prórroga con motivo (máx. 2/año) |
| UC-P04c | Suspender / reactivar manualmente | Super Admin 🔒 | Con motivo; nunca corta un turno abierto |
| UC-P05 | Cancelación y exportación de datos | Dueño 🛠 | Exportación completa; retención legal; eliminación certificada |
| UC-P06 | Gestión de tenants y salud del ecosistema | Super Admin 🔒 | Métricas, cajas sin heartbeat, lag de Kafka, DLT, incidentes |
| UC-P07 | Soporte con acceso temporal | Super Admin 🔒 | Acceso *just-in-time* con consentimiento del tenant, tiempo limitado y auditado |
| UC-P08 | Activar facturación electrónica **[FUTURO]** | Dueño 🛠 | Cambiar `fiscal_mode`, registrar resolución DIAN, asignación de bloques a cajas |
| UC-P09 | Crear usuarios en una tienda | Super Admin 🔒 | Acompañamiento inicial o soporte; respeta límites del plan; auditado |

## A2. Edición Local (pago único, sin internet)

| ID | Caso | Actor | Resumen |
|---|---|---|---|
| UC-L01 | Vender licencia local | Super Admin 🔒 | Registra comprador y pago → crea `LOC-AAAA-NNNNNN` y entrega el **serial** al cliente |
| UC-L02 | Activar (requiere internet una vez) | Dueño (PC) | Ingresa el serial → la app envía huella del equipo y su llave pública → recibe la licencia firmada → desde ahí funciona sin internet. Si el serial ya está activo en otro equipo: rechazado y alerta al super admin |
| UC-L03 | Configuración inicial | Dueño (PC) | Datos del negocio, contraseña de administrador, código de recuperación impreso, cajeros con PIN, importar productos |
| UC-L04 | Entrar como cajero / como administrador | Cajero / Dueño (PC) | Cajero: PIN → modo Caja. Administrador: contraseña → productos, inventario, usuarios, fiados, reportes, copias |
| UC-L05 | Descargar archivo de respaldo | Dueño (PC) | Administración → Datos y equipo → genera `.tdbak` cifrado con todos los datos, lo guarda en USB/disco y lo verifica. Automáticos por turno y diarios + recordatorio semanal |
| UC-L05b | Restablecer datos desde archivo | Dueño (PC) | Seleccionar `.tdbak` + código de recuperación → validación → resumen → respaldo previo automático → restauración. No requiere internet |
| UC-L06 | Olvidé la contraseña | Dueño + Super Admin 🔒 | Código de recuperación (offline) o solicitud en línea aprobada por el super admin tras verificar identidad |
| UC-L07 | Solicitud de cambio de equipo | Dueño (PC) + Super Admin 🔒 | Asistente: cerrar turno → respaldo final verificado → solicitud en línea (libera el serial) → PC viejo en solo lectura → activar PC nuevo → restablecer archivo. PC dañado: liberación desde la consola (máx. 2/año) + último respaldo |
| UC-L08 | Actualizar versión | Dueño (PC) | Instalador firmado; bloqueado si la versión es posterior a `updates_until` |
| UC-L09 | Renovar actualizaciones | Super Admin 🔒 + Dueño (PC) | Nuevo `updates_until` en la consola → el cliente pulsa "Actualizar licencia" (en línea) |
| UC-L10 | Migrar a la nube | Dueño + Super Admin 🔒 | Paquete cifrado de exportación → importación en tienda SaaS nueva |

## B. Organización, usuarios y dispositivos

| ID | Caso | Actor | Resumen |
|---|---|---|---|
| UC-O01 | Crear sucursal | Dueño 🛠 | Valida límite del plan; crea bodega por defecto |
| UC-O02 | Crear y enrolar caja | Admin 🛠 + 🖥 | En la App de Gestión se crea la caja → código/QR de un solo uso → la App Instalable lo escanea o digita, genera llaves y hace bootstrap ([04 §2.2](04-seguridad.md)). Requiere internet en ambos |
| UC-O03 | Revocar / reemplazar caja | Admin 🛠 | Revocación remota; reemplazo solo con outbox vacío o pérdida declarada |
| UC-O04 | Gestión de usuarios y PIN | Admin 🛠 | Alta, rol, sucursal, PIN inicial temporal; desactivación propagada a cajas |
| UC-O05 | Roles personalizados | Dueño 🛠 | Composición de permisos atómicos |
| UC-O06 | Inicio de sesión en caja | Cajero 🖥 | Selección de usuario + PIN local; bloqueo por intentos |
| UC-O07 | Cambio rápido de cajero | Cajero 🖥 | Bloqueo de pantalla; cada cajero con su propio turno o turno compartido (configurable) |
| UC-O08 | Inicio de sesión en la App de Gestión | Dueño/Admin 🛠 | Login OIDC + MFA; secciones visibles según permisos; acciones sensibles piden MFA de nuevo |
| UC-O09 | Invitar usuario a la App de Gestión | Dueño 🛠 | Invitación por email/WhatsApp con rol (admin de sucursal, contador solo lectura) |

## C. Turnos y efectivo

| ID | Caso | Actor | Flujo y reglas |
|---|---|---|---|
| UC-C01 | Abrir turno | Cajero 🖥 | Declarar base inicial (conteo por denominación opcional); solo un turno abierto por terminal; si el turno anterior quedó abierto → exigir cierre o cierre forzado por supervisor. Evento `cash.session.opened` |
| UC-C02 | Entrada de efectivo | Cajero 🖥 | Monto + motivo; > umbral requiere supervisor |
| UC-C03 | Salida / gasto menor / pago a proveedor | Cajero 🖥 | Motivo obligatorio, foto opcional del soporte |
| UC-C04 | Retiro parcial a caja fuerte (*safe drop*) | Supervisor 🖥 | Cuando el efectivo supera tope configurado, la caja lo sugiere |
| UC-C05 | Cierre con arqueo ciego | Cajero 🖥 | Declara efectivo por denominación + vouchers + referencias digitales **sin ver el esperado**; el sistema calcula descuadre; impresión de reporte Z; evento `cash.session.closed` |
| UC-C06 | Revisión de descuadre | Admin 📊🛠 | Ver esperado vs. declarado, ventas y movimientos del turno; anotar justificación |
| UC-C07 | Reapertura de turno | Supervisor 🖥 | Solo con PIN de supervisor y motivo; auditado |
| UC-C08 | Cierre forzado remoto | Admin 🛠 | Para turnos olvidados; aplica en la caja al siguiente pull |
| UC-C09 | Turno que cruza medianoche | ⚙ | Ventas se reportan por fecha de emisión; el turno pertenece a la fecha de apertura en reportes de turno |

**Esperado en efectivo** = base + ventas en efectivo − cambio entregado + entradas − salidas − retiros − devoluciones en efectivo + abonos de cartera en efectivo.

## D. Ventas

| ID | Caso | Actor | Flujo y reglas |
|---|---|---|---|
| UC-V01 | Venta rápida | Cajero 🖥 | Escanear/buscar → carrito → cobrar en efectivo → comprobante interno + cajón. Objetivo < 300 ms tras "Cobrar" |
| UC-V02 | Pago mixto | Cajero 🖥 | Varios medios en una venta; total pagado = total; solo efectivo genera cambio |
| UC-V03 | Venta con factura electrónica **[FUTURO]** | Cajero 🖥 | Cliente pide factura → buscar/crear adquirente (NIT con DV) → documento tipo factura. Hoy: el comprobante interno puede incluir nombre/documento del cliente si lo pide |
| UC-V04 | Venta a crédito (fiado) | Cajero 🖥 | Cliente con crédito habilitado; validación de cupo según modo ([03 §6](03-sincronizacion-offline.md)); abono parcial inicial permitido |
| UC-V05 | Producto pesado | Cajero 🖥 | Balanza por puerto serial o código EAN-13 de balanza con peso/precio embebido (prefijo 20–29 configurable) |
| UC-V06 | Código de caja / empaque | Cajero 🖥 | Barcode con `pack_qty` (ej. caja x12) descuenta 12 unidades |
| UC-V07 | Producto no encontrado | Cajero/Supervisor 🖥 | Venta como **"Artículo genérico"** con descripción y precio manual (aprobación de supervisor); queda en la lista "productos por crear" de la App de Gestión. La caja no crea productos |
| UC-V08 | Descuento por línea / total | Cajero/Supervisor 🖥 | Hasta X % sin aprobación; más requiere supervisor |
| UC-V09 | Promociones automáticas | ⚙ 🖥 | NxM, % por categoría, combos; vigencias por hora local |
| UC-V10 | Cambio de precio en caja | Supervisor 🖥 | Auditado |
| UC-V11 | Suspender y recuperar venta | Cajero 🖥 | Carritos en espera (no consumen consecutivo) |
| UC-V12 | Eliminar ítem del carrito | Cajero 🖥 | Permitido, auditado (control de fraude) |
| UC-V13 | Anulación (mismo turno, antes de entregar) | Supervisor 🖥 | Registro de anulación referenciando el comprobante; repone inventario; reversa pagos. *Futuro: nota crédito/ajuste DIAN* |
| UC-V14 | Devolución parcial / total | Supervisor 🖥 | Desde cualquier caja de la misma sucursal (o de otra si es tenant multi-sucursal y el documento está en la nube/local); reembolso en efectivo, a cartera o como vale |
| UC-V15 | Cambio de producto | Supervisor 🖥 | Devolución + nueva venta enlazadas |
| UC-V16 | Reimpresión | Cajero 🖥 | Marca "COPIA"; auditada |
| UC-V17 | Envío digital del comprobante | Cajero 🖥 / ⚙ | Email/WhatsApp al sincronizar (requiere autorización de datos) |
| UC-V18 | Apertura manual de cajón | Supervisor 🖥 | Sin venta; motivo obligatorio; auditada |
| UC-V19 | Venta con bolsa plástica | Cajero 🖥 | Atajo para agregar bolsas con su impuesto fijo |
| UC-V20 | Pago digital pendiente de conciliación | Cajero 🖥 | Nequi/Daviplata/Bre-B: referencia manual; conciliación en la App de Gestión 🛠 |

## E. Clientes y cartera

| ID | Caso | Actor | Resumen |
|---|---|---|---|
| UC-K01 | Crear cliente en caja | Cajero 🖥 | Necesario para fiar sin internet: nombre o alias ("Doña Marta"), teléfono, documento opcional, autorización de datos; deduplicación por documento/teléfono al sincronizar. Edición completa y cupos: App de Gestión |
| UC-K02 | Configurar cupo de crédito | Admin 🛠 | Cupo, modo (SOFT/ALLOCATED/ONLINE_ONLY), plazo, bloqueo por mora |
| UC-K03 | Registrar abono | Cajero 🖥 | Recibo de abono impreso; afecta caja si es efectivo |
| UC-K04 | Estado de cuenta | Admin 📊 / Cajero 🖥 | Movimientos y saldo (en caja: saldo estimado + aviso de "último sync"); impresión o envío por WhatsApp al cliente |
| UC-K05 | Recordatorios de cobro | ⚙ | WhatsApp/SMS en horarios permitidos (Ley 2300 de 2023) |
| UC-K06 | Castigo de cartera | Dueño 🛠 | `WRITE_OFF` auditado |
| UC-K07 | Solicitud de supresión de datos | Dueño 🛠 | Anonimizar cliente sin romper el histórico de ventas |

## F. Inventario y catálogo

| ID | Caso | Actor | Resumen |
|---|---|---|---|
| UC-I01 | CRUD de productos, categorías, marcas, códigos | Admin 🛠 | Validación de código de barras único por tenant; control optimista de versión |
| UC-I02 | Importación masiva | Admin 🛠 | CSV/Excel → validación → vista previa → aplicación asíncrona con reporte de errores |
| UC-I03 | Precios por sucursal y programados | Dueño 🛠 | `valid_from` futuro para que las cajas offline apliquen a tiempo |
| UC-I04 | Recepción de mercancía | Admin � | Desde el celular/PC: escanear productos con la cámara o lector Bluetooth, cantidades y costo; actualiza costo promedio. Online |
| UC-I05 | Ajustes (merma, avería, consumo interno, vencido, robo) | Admin 🛠 | Justificación obligatoria y foto opcional. Online |
| UC-I06 | Conteo físico (total o cíclico) | Admin 🛠 | Conteo con la cámara del celular; corrección = contado − teórico a la hora del conteo (las ventas offline que lleguen después se suman correctamente) |
| UC-I07 | Traslado entre bodegas/sucursales (Corporativo) | Admin 🛠 | `IN_TRANSIT` → recepción con diferencias en la sucursal destino |
| UC-I08 | Pedidos a proveedores | Admin 🛠 | Sugerido por mínimos/máximos; envío por WhatsApp al proveedor |
| UC-I09 | Alertas de stock bajo / negativo | ⚙ | Notificación push en la App de Gestión |
| UC-I10 | Crear productos vendidos como genéricos | Admin 🛠 | Lista de artículos genéricos vendidos (descripción, precio, caja) → crear producto con un clic |

## G. Reportes y auditoría

Todos los reportes requieren internet. La App de Gestión tiene todos; la App Instalable muestra los de su sucursal. Excepción: el **reporte del turno** (parte del arqueo de caja) sale de la base local y funciona offline.

| ID | Caso | Actor | Resumen |
|---|---|---|---|
| UC-R00 | Reporte del turno (arqueo) | Cajero/Supervisor 🖥 | Ventas del turno en esta caja por medio de pago, movimientos y reporte Z; offline desde SQLite porque es parte de la operación de caja |
| UC-R01 | Dashboard en tiempo real | Dueño 📊 | Ventas del día por sucursal/caja, ticket promedio, comparativos, top productos, medios de pago; actualización en vivo |
| UC-R02 | Estado de cajas | Dueño/Admin 📊 | Último heartbeat, eventos pendientes, versión, impresora |
| UC-R03 | Reporte de turnos y descuadres | Admin 📊 | Por cajero y periodo |
| UC-R04 | Auditoría de operaciones críticas | Dueño 📊 | Filtros por acción, cajero, caja |
| UC-R05 | Libro de ventas / impuestos | Dueño 📊 | Para el contador; exportación Excel/PDF |
| UC-R06 | Estado de documentos DIAN **[FUTURO]** | Admin 📊 | Pendientes, aceptados, rechazados |
| UC-R07 | Rentabilidad y rotación | Dueño 📊 | Margen por producto/categoría, productos sin rotación |
| UC-R08 | Cartera | Dueño 📊 | Clientes con saldo, antigüedad de la deuda, abonos del periodo |
| UC-R09 | Notificaciones push | Dueño 📊 (móvil) | Descuadre, caja sin sincronizar, stock negativo, anulaciones, cartera vencida |

## H. Casos borde y fallos (críticos)

| # | Situación | Comportamiento esperado |
|---|---|---|
| E01 | Se cae internet a mitad de un turno | Sin impacto en ventas; indicador de estado cambia a "offline"; outbox crece |
| E02 | Se va la luz durante el cobro | SQLite WAL + `synchronous=FULL`: la venta quedó completa o no existe; al reiniciar se ofrece reimprimir la última venta |
| E03 | Se pierde la respuesta del push (timeout) | Reenvío del lote; la nube responde `DUPLICATE`; sin doble conteo |
| E04 | Dos cajas venden la última unidad offline | Stock queda negativo en la nube; alerta y sugerencia de conteo |
| E05 | Precio cambió en la nube mientras la caja estaba offline | La venta se respeta con el precio aplicado; reporte de "ventas con precio desactualizado" |
| E06 | Producto eliminado en la nube pero vendido offline | Venta aplicada (snapshot de línea); movimiento de stock al producto aunque esté inactivo |
| E07 | Cliente fiado supera cupo entre cajas | Ver [03 §6](03-sincronizacion-offline.md); alerta al admin |
| E08 | Consecutivo interno | Nunca se agota (entero de 64 bits) ni se reinicia; si la base local se restaura de un snapshot, el consecutivo continúa desde `max(local, último reportado a la nube) + 1` para no repetir números |
| E09 | Rango/resolución DIAN agotado o vencido **[FUTURO]** | Bloque de reserva, alertas 20 % / 30 días, bloqueo de emisión con ese prefijo |
| E10 | Reloj de la terminal adelantado/atrasado o manipulado | Detección de retroceso; registro de desfase; bloqueo si retrocede > 5 min |
| E11 | Licencia vence offline | Modo solo lectura tras la gracia; subida de datos permitida |
| E12 | Suscripción suspendida por mora | Terminales al renovar licencia reciben `SUSPENDED` → solo lectura tras aviso |
| E13 | Equipo robado | Revocación remota; datos cifrados; el ladrón no puede descifrar ni enviar eventos válidos |
| E14 | Disco lleno en la terminal | Alerta temprana (< 1 GB); purga de eventos ya enviados; nunca purga pendientes |
| E15 | Reinstalación con eventos pendientes | El instalador detecta base existente y la conserva; la desinstalación advierte si hay outbox pendiente; respaldo cifrado restaurable |
| E16 | Base local corrupta | Verificación `PRAGMA integrity_check` al iniciar; restaurar último snapshot; re-bootstrap; eventos perdidos detectados por hueco en `terminal_seq` |
| E17 | Hueco en `terminal_seq` | La nube responde `GAP_DETECTED`; si es irrecuperable, alerta crítica y reconciliación manual |
| E18 | Mismo `event_id` con contenido distinto | Rechazo + alerta de seguridad (posible manipulación) |
| E19 | Impresora sin papel / desconectada | Venta ya confirmada; cola de impresión con reintento; opción de envío digital |
| E20 | Lector de código lee basura / doble lectura | Validación de dígito de control EAN/UPC; debounce |
| E21 | Turno olvidado abierto varios días | Aviso al abrir la app; cierre forzado por supervisor o remoto |
| E22 | Cajero desactivado mientras la caja está offline | Sigue pudiendo entrar hasta el próximo pull (riesgo aceptado y documentado); mitigación: el admin puede cambiar PINs y forzar pull al reconectar |
| E23 | Devolución de una venta que aún no se ha sincronizado desde otra caja | Buscar localmente; si no existe, devolución con referencia manual del documento y aprobación del supervisor; la nube la enlaza al llegar la venta (o la deja en cuarentena) |
| E24 | Actualización de la app con esquema nuevo y outbox pendiente | Migración preserva outbox; eventos llevan `schema_version`; la nube acepta N y N-1 |
| E25 | Picos de reconexión masiva | Jitter + `Retry-After` + autoescalado + colas |
| E26 | Proveedor DIAN caído **[FUTURO]** | Circuit breaker abierto, cola de documentos, alerta si se acerca el plazo legal |
| E27 | Rechazo DIAN por datos del cliente **[FUTURO]** | Corrección y retransmisión, o nota y re-emisión |
| E28 | Downgrade de plan con más cajas activas que el nuevo límite | Bloqueado hasta retirar cajas; nunca se apagan cajas automáticamente en medio de un turno |
| E29 | Doble clic en "Cobrar" | Comando idempotente por `cart_id`; UI deshabilita el botón |
| E30 | Venta de $0 o negativa | Rechazada salvo cambio de producto con diferencia, con permiso |
| E31 | Un microservicio consumidor caído (p. ej. inventory) | Las cajas siguen sincronizando (ACK de sync-service); el lag crece; al recuperarse procesa en orden sin duplicados; reportes muestran "datos en actualización" |
| E32 | Evento de catálogo llega fuera de orden a sync-service | `source_version` descarta la versión vieja; la caja nunca recibe un dato más antiguo que el que ya tiene |
| E33 | Dos admins editan el mismo producto en la App de Gestión | Control optimista (`version`): el segundo recibe 409 y ve los cambios del primero antes de reintentar |
| E34 | Dueño abre la App de Gestión sin internet | Pantalla "Sin conexión" con reintento; no se muestran ni editan datos locales |
| E35 | Se pierde la conexión mientras se guarda un cambio en la App de Gestión | La petición lleva `Idempotency-Key`; al reintentar no se duplica; la UI informa si se guardó o no |
| E36 | Caja sin internet y el cajero abre Reportes | Mensaje "Requiere internet"; el reporte del turno sigue disponible |
