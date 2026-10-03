# TienditaOnline — SaaS POS Offline-First para Colombia

Documentación de arquitectura, diseño y plan de implementación.

## Índice

| # | Documento | Contenido |
|---|-----------|-----------|
| **00** | **[Guía de inicio de desarrollo](00-guia-inicio-desarrollo.md)** | **Leer primero.** Qué construir primero, paso a paso, tecnologías recomendadas, pruebas y errores a evitar |
| 01 | [Arquitectura general](01-arquitectura-general.md) | Microservicios, los 2 frontends, stack tecnológico, decisiones (ADR) |
| 02 | [Modelo de datos](02-modelo-datos.md) | Base de datos por servicio (PostgreSQL + RLS) y caja (SQLite cifrado) |
| 03 | [Sincronización offline](03-sincronizacion-offline.md) | Outbox, idempotencia, Kafka, deltas de inventario, bajada incremental |
| 04 | [Seguridad](04-seguridad.md) | RBAC, autenticación, enrolamiento de cajas, mTLS, cifrado, OWASP |
| 05 | [Resiliencia e infraestructura](05-resiliencia-infraestructura.md) | EKS, gateway, BFF, service mesh, circuit breaker, Kafka, observabilidad, DR |
| 06 | [Cumplimiento Colombia](06-cumplimiento-colombia.md) | Modo actual sin facturación electrónica, módulo DIAN futuro, impuestos, Habeas Data, medios de pago |
| 07 | [Casos de uso](07-casos-de-uso.md) | Casos de uso funcionales y casos borde |
| 08 | [Contratos de API](08-contratos-api.md) | Gateway, sync, `bff-pos`, `bff-app`, eventos |
| 09 | [Plan de implementación](09-plan-implementacion.md) | Fases, entregables, estructura del repositorio, DoD |
| 10 | [Roles, planes y licenciamiento](10-roles-planes-licenciamiento.md) | Super admin / dueño / cajero, planes y precios, avisos de mora y bloqueo, Edición Local de pago único |

Esquemas SQL:

- [db/cloud/](../db/cloud/) — una carpeta por microservicio (PostgreSQL 16) + [000_common.sql](../db/cloud/000_common.sql).
- [db/local/001_schema.sql](../db/local/001_schema.sql) — SQLite/SQLCipher (App Instalable).

## Decisiones de producto vigentes

- **Población objetivo:** tiendas de barrio. **Sin facturación electrónica** en la fase actual (comprobante interno); el módulo DIAN queda diseñado y con puntos de extensión listos (`fiscal_mode`, `einvoicing-service`, estrategias en la caja).
- **Backend en microservicios** con base de datos por servicio y comunicación por eventos (Kafka).
- **Dos frontends:**
  1. **App Instalable** (Tauri): **caja** (ventas, turnos, fiados, devoluciones) que funciona **sin internet** + reportes de la sucursal (con internet).
  2. **App de Gestión** (Expo, un solo código para web, iOS y Android): **administración + reportes**, **siempre con internet**.
- **Regla de conectividad:** lo único que funciona sin internet es la caja para seguir vendiendo.
- **Roles:** Super Admin (plataforma, crea tiendas y usuarios), Dueño (administra su tienda según el plan) y Cajero (ventas y lo básico); Supervisor, Admin de sucursal y Contador según plan.
- **Planes SaaS:** Tendero ($ 34.900), Negocio ($ 79.900), Multi-tienda ($ 149.900) mensuales, con avisos de mora y bloqueo progresivo.
- **Edición Local:** licencia de pago único, 100 % en el PC; **internet solo una vez para activar**, luego nunca. Sin App de Gestión (modo Caja + modo Administración con contraseña).

## Principios rectores

1. **La caja nunca se detiene.** Ninguna operación de cobro depende de la red.
2. **La terminal es dueña de sus hechos; la nube es dueña de la verdad consolidada.** La terminal emite eventos inmutables; la nube los agrega.
3. **Todo es idempotente.** Cualquier mensaje puede llegar 0..N veces sin alterar el resultado contable.
4. **Inventario por movimientos, nunca por valores absolutos.**
5. **Aislamiento de tenant en todas las capas** (token, API, base de datos con RLS, almacenamiento, logs).
6. **Fallar de forma segura y visible**: circuit breakers, colas de reintento, alertas y modo degradado explícito.
7. **Preparado para cumplimiento DIAN**: hoy sin facturación electrónica, pero con modelo de datos, eventos y puntos de extensión listos para activarla sin rediseño.

> Aviso: las referencias normativas colombianas (DIAN, UVT, plazos) deben validarse con un contador/asesor tributario y con el proveedor tecnológico antes de salir a producción; la normativa cambia con frecuencia.
