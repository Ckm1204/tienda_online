# ÉPICA 09: Microservicios Operativos en Nube (sales, cash, inventory, customer, audit)

Consumidores idempotentes con inbox: sales-service (ventas y conciliación de pagos digitales), cash-service (turnos y recalculo en nube), inventory-service (kardex por deltas, proveedores, compras, conteos, traslados), customer-service (cartera y ARCO) y audit-service (cadena SHA-256 WORM).

- **Hito principal:** Hito 4 / Hito 5
- **Total Features:** 5
- **Total Historias de Usuario:** 38
- **Esfuerzo estimado:** 103 puntos
- **Volver al índice del backlog modular:** [../README.md](../README.md)
- **Ver en el archivo monolítico largo:** [../../11-backlog-historias-usuario.md](../../11-backlog-historias-usuario.md)

## Features de esta Épica

| Código | Feature | Historias (HUs) | Puntos |
|---|---|---:|---:|
| **FT-09.1** | [Feature 09.1: sales-service — Registro de Ventas, Consecutivos Únicos y Conciliación de Pagos Digitales](FT-09.1-sales-service-ventas-conciliacion.md) | 8 | 20 |
| **FT-09.2** | [Feature 09.2: cash-service — Consolidación de Turnos, Recalculo en Nube y Cierre Forzado Remoto](FT-09.2-cash-service-turnos-cierre-remoto.md) | 4 | 11 |
| **FT-09.3** | [Feature 09.3: inventory-service — Kardex por Deltas, Proveedores, Recepciones, Ajustes, Conteos y Traslados](FT-09.3-inventory-service-deltas-compras-conteos.md) | 15 | 44 |
| **FT-09.4** | [Feature 09.4: customer-service — Cartera Consolidada, Cupo ALLOCATED, Castigos y Derechos ARCO](FT-09.4-customer-service-cartera-arco.md) | 7 | 18 |
| **FT-09.5** | [Feature 09.5: audit-service — Bitácora Inmutable con Cadena SHA-256 y Verificación Nocturna](FT-09.5-audit-service-cadena-sha256-worm.md) | 4 | 10 |
