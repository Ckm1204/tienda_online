# RB-02: Inspección, Corrección y Reprocesamiento de Dead Letter Topics (*.dlt)
**Identificador:** RB-02 | **Severidad:** P2 / Warning | **HU:** HU-432

## 1. Síntomas
- Alerta Prometheus: `DeadLetterTopicMessagesDetected` (`dlt_messages_total > 0`).
- Mensajes fallidos en `pos.events.dlt`, `sales.events.dlt` o `inventory.events.dlt`.

## 2. Inspección
1. Listar mensajes en el DLT específico sin consumirlos destructivamente:
   ```bash
   rpk topic consume <topic>.dlt --num 10 --format json
   ```
2. Inspeccionar cabeceras del mensaje:
   - `x-error-reason`: Causa exacta de la excepción.
   - `x-original-topic`: Topic de origen.
   - `x-failed-at`: Marca de tiempo ISO-8601.
   - `x-attempt-count`: Número de reintentos antes de enviarse al DLT.

## 3. Procedimiento de Corrección y Reprocesamiento
1. Si el fallo se debió a un bug en el esquema o formato de datos:
   - Desplegar el parche en el microservicio correspondiente.
   - Comprobar en ambiente `staging` que el mensaje ya es procesado sin error.
2. Iniciar el job de reprocesamiento idempotente desde la consola del Super Admin o mediante CLI:
   ```bash
   node repos/services/tenant-service/dist/platform-and-billing.js --reprocess-dlt=<topic>.dlt
   ```
3. Monitorear que los mensajes se publiquen de nuevo al topic principal y que el contador del DLT baje a 0.
