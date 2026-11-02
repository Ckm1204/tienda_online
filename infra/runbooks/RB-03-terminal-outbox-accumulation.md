# RB-03: Caja con Eventos Acumulados en Outbox (>24h) o Error GAP_DETECTED
**Identificador:** RB-03 | **Severidad:** P2 / High | **HU:** HU-433

## 1. Síntomas
- Alerta Prometheus: `TerminalOutboxAccumulation` o `SyncPushErrorRate` con código `GAP_DETECTED`.
- En la Consola Super Admin: la terminal aparece con "Outbox pendiente > 500 eventos" o con último sync > 24 horas.

## 2. Diagnóstico
1. Consultar el estado de sincronización de la caja desde la consola:
   `GET /v1/platform/terminals/{terminal_id}/sync-status`
2. Si el error es `GAP_DETECTED`:
   - El servidor esperaba la secuencia `N` pero la caja envió `N + K` (se perdió un rango de eventos intermedios en el cliente).
3. Si el error es `OUTBOX_ACCUMULATED`:
   - La caja estuvo sin internet o un proxy local está bloqueando peticiones HTTPS a `api.tienditaonline.co`.

## 3. Acciones de Recuperación
1. **Para GAP_DETECTED**:
   - Enviar comando remoto de reconciliación en el próximo heartbeat: `request_full_outbox_replay`.
   - La caja re-escanea su tabla local `outbox` en SQLite y retransmite desde la última secuencia confirmada en servidor `server_ack_seq`.
2. **Para acumulación por conectividad**:
   - Orientar al tendero para compartir datos móviles temporalmente desde su celular o reiniciar el router.
   - La caja subirá en lotes con retroceso exponencial (`jittered backoff`) de 100 eventos por lote hasta vaciar el Outbox.
