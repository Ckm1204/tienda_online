# ÉPICA 07: Motor de Sincronización Offline-First (sync-service + Cliente Rust)

Despachador del Outbox local en lotes gzip firmados, circuit breaker con backoff y jitter, ingesta idempotente en sync-service, orden terminal_seq y detección de huecos, cuarentena, proyección downstream_changes, pull por xid8, bootstrap S3 y heartbeat.

- **Hito principal:** Hito 4
- **Total Features:** 3
- **Total Historias de Usuario:** 25
- **Esfuerzo estimado:** 71 puntos
- **Volver al índice del backlog modular:** [../README.md](../README.md)
- **Ver en el archivo monolítico largo:** [../../11-backlog-historias-usuario.md](../../11-backlog-historias-usuario.md)

## Features de esta Épica

| Código | Feature | Historias (HUs) | Puntos |
|---|---|---:|---:|
| **FT-07.1** | [Feature 07.1: Motor Cliente en Rust — Outbox, Compresión, Firma, Backoff y Circuit Breaker](FT-07.1-motor-cliente-rust-outbox-breaker.md) | 5 | 12 |
| **FT-07.2** | [Feature 07.2: sync-service en Nube — Ingesta Idempotente, Orden terminal_seq, Cuarentena y Fan-out](FT-07.2-sync-service-push-idempotencia-orden.md) | 13 | 35 |
| **FT-07.3** | [Feature 07.3: Bajada Incremental por xid8, Bootstrap S3 y Heartbeat](FT-07.3-pull-xid8-bootstrap-s3-heartbeat.md) | 7 | 24 |
