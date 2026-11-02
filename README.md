# TienditaOnline — POS Offline-First & SaaS para Colombia

[![CI Monorepo](https://github.com/tienditaonline/tiendita/actions/workflows/ci.yml/badge.svg)](https://github.com/tienditaonline/tiendita/actions/workflows/ci.yml)
[![Backlog Status](https://img.shields.io/badge/Backlog-505%20%2F%20505%20(100%25)-emerald)](docs/11-backlog-historias-usuario.md)
[![Turborepo](https://img.shields.io/badge/Turborepo-36%20Tasks%20OK-blue)](repos/turbo.json)
[![Rust Core](https://img.shields.io/badge/Rust-Tauri%20Core%20OK-orange)](repos/apps/pos/src-tauri)
[![DIAN](https://img.shields.io/badge/DIAN-UBL%202.1%20%2B%20CUDE-purple)](repos/services/einvoicing-service)

Sistema integral de punto de venta (POS) y plataforma SaaS para tiendas de barrio, minimercados y autoservicios en Colombia. Diseñado con arquitectura **Offline-First**, sincronización en la nube basada en eventos, soporte para pagos mixtos, turnos con arqueo ciego, cartera de fiados (Ley 2300 de 2023), facturación electrónica DIAN (Resolución 000165 de 2023) y opción de **Edición Local** de pago único sin internet.

---

## 🏛️ Arquitectura del Monorepo

```
TienditaOnline/
├── .github/workflows/          # Pipelines de CI/CD, escaneo SBOM y pruebas automáticas
├── db/                         # Esquemas de base de datos
│   ├── cloud/                  # PostgreSQL 16 con RLS estricto por microservicio
│   └── local/                  # SQLite / SQLCipher (AES-256) para cajas locales
├── docs/                       # Documentación técnica y Backlog oficial
│   ├── 00-guia-inicio-desarrollo.md
│   ├── 11-backlog-historias-usuario.md  # 505 HUs completadas al 100 %
│   ├── backlog/                # 15 Épicas / 42 Features detallados
│   └── legal/                  # T&C, Política Ley 1581, DPA, EULA Local, Go-Live Checklist
├── infra/                      # Infraestructura como Código y Operaciones
│   ├── terraform/              # Módulos: VPC, Aurora PG16, Redpanda/MSK, Redis 7, S3 WORM, Cloudflare WAF
│   ├── observability/          # Reglas Prometheus y tableros Grafana
│   ├── runbooks/               # Runbooks operativos RB-01 a RB-06 (Kafka, PITR, Ley 1581)
│   └── security/               # security.txt (RFC 9116)
└── repos/                      # Código fuente en pnpm workspaces + Turborepo
    ├── apps/
    │   ├── pos/                # POS de mostrador (Tauri + Rust + SQLCipher)
    │   └── management/         # App de Gestión Web y Móvil (React Native / Expo)
    ├── packages/
    │   ├── config/             # Configuración y validación de variables de entorno
    │   ├── contracts/          # Tipos y esquemas Zod compartidos (Cero dinero flotante)
    │   ├── db-migrations/      # Migrador PGlite y RLS en memoria
    │   ├── service-kit/        # Middleware multi-tenant, Outbox, Circuit Breaker, RFC 9457
    │   └── tax-engine/         # Motor de impuestos DIAN colombiano (IVA, INC, Exentos)
    ├── services/               # Microservicios de dominio (Dockerizados)
    │   ├── audit-service/      # Cadena de auditoría SHA-256 inmutable (WORM)
    │   ├── bff-app/            # BFF desacoplado con rate limiter, idempotencia y controladores
    │   ├── cash-service/       # Turnos de caja, Safe Drops y arqueo ciego
    │   ├── catalog-service/    # Catálogo, precios por lista, promociones y combos
    │   ├── customer-service/   # Clientes, fiados locales y cobranza ética
    │   ├── device-service/     # Enrolamiento de cajas, licencias KMS y Edición Local
    │   ├── einvoicing-service/ # Facturación Electrónica DIAN, CUDE SHA-384, UBL 2.1, GiST
    │   ├── identity-service/   # OIDC, JWT, MFA y PIN de cajero con sal única
    │   ├── inventory-service/  # Existencias miliunidades, mermas y conteos cíclicos
    │   ├── notification-service/# WhatsApp, Push, SMS con cumplimiento Ley 2300 ("Dejen de fregar")
    │   ├── reporting-service/  # Proyecciones CQRS, dashboard SSE y exportación contable
    │   ├── sales-service/      # Ventas consolidadas, conciliación y notas crédito
    │   ├── sync-service/       # Ingesta offline-first, xid8 y detección de brechas
    │   └── tenant-service/     # Gestión de tiendas, planes SaaS y ciclo de mora (Dunning)
    └── tools/
        ├── gen-service/        # Generador de esqueletos de microservicios
        ├── mark-hu/            # CLI de seguimiento del backlog
        └── terminal-simulator/ # Simulador masivo de 5.000 terminales y scripts k6
```

---

## 🚀 Inicio Rápido y Comandos de Desarrollo

### Requisitos Previos
- **Node.js**: v20+ o v22+ LTS
- **pnpm**: v9+ o v10+
- **Rust Toolchain**: `stable` (para el núcleo de `apps/pos`)

### 1. Instalación de Dependencias
```bash
cd repos
pnpm install
```

### 2. Ejecución de Pruebas Unitarias e Integración (100 % pasando)
```bash
# Ejecutar todas las pruebas del monorepo con Turborepo
pnpm test

# Ejecutar pruebas del núcleo nativo de Rust
cargo test --manifest-path apps/pos/src-tauri/Cargo.toml
```

### 3. Compilación y Typecheck de Todo el Workspace
```bash
# Compilar TypeScript en todos los paquetes y generar bundles Web/iOS/Android
pnpm build

# Verificación de tipos estricta sin emitir archivos
pnpm lint
```

### 4. Consultar el Estado del Backlog (505/505 HUs)
```bash
node tools/mark-hu/index.mjs status
```

---

## 🛡️ Principios Arquitectónicos Clave

1. **Cero Números Flotantes para Dinero**: Todos los montos monetarios se expresan en centavos enteros (`_cents`) y las cantidades continuas en miliunidades (`qty_milli`), eliminando errores de redondeo de punto flotante IEEE-754.
2. **Aislamiento Multi-Tenant Estricto**: Todo acceso a PostgreSQL aplica `app.current_tenant_id` con políticas Row-Level Security (RLS) mandatorias.
3. **Desacoplamiento con Puertos y Middlewares**: Arquitectura hexagonal limpia donde los controladores de transporte HTTP están desacoplados de la lógica de dominio y del almacenamiento.
4. **Cumplimiento Legal Colombiano**:
   - **Ley 2300 de 2023 ("Dejen de fregar")**: Horarios de cobranza restringidos a L-V 7am–7pm, Sáb 8am–3pm, domingos y festivos prohibidos.
   - **Ley 1581 de 2012 (Habeas Data)**: Autorización previa, derechos ARCO y runbook ante incidentes a la SIC.
   - **Resolución DIAN 000165 de 2023**: Documento Equivalente POS Electrónico, Facturas UBL 2.1, CUDE SHA-384, tope de 5 UVT y exclusión GiST de bloques de numeración.
5. **Edición Local 100 % Soberana**: Funciona indefinidamente sin conexión de red tras una activación única vinculada a huella de hardware tolerante ($\ge 3$ de 5 componentes) y respaldos `.tdbak` cifrados con AES-256-GCM.

---

## 📄 Licencia y Documentos Legales
- [Términos y Condiciones](docs/legal/terminos-y-condiciones.md)
- [Política de Privacidad y Tratamiento de Datos](docs/legal/politica-privacidad-ley1581.md)
- [EULA Edición Local](docs/legal/eula-edicion-local.md)
- [Checklist Final de Go-Live](docs/legal/go-live-checklist.md)
