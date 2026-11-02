# RB-06: Respuesta a Incidentes de Seguridad y Notificación Legal (SIC y Ley 1581)
**Identificador:** RB-06 | **Severidad:** P0 / Legal & Security | **HU:** HU-371

## 1. Marco Normativo (Colombia)
En cumplimiento de la Ley Estatutaria 1581 de 2012 y de las directrices de la Superintendencia de Industria y Comercio (SIC), todo incidente que comprometa la seguridad de datos personales de tenderos o clientes debe gestionarse y notificarse formalmente.

## 2. Plazos Legales Obligatorios
- **Notificación a la SIC**: Máximo dentro de los **15 días hábiles** siguientes al momento en que se detecte el incidente y se inicie su investigación.
- **Notificación a los Titulares (Tenants)**: Inmediata si existe riesgo inminente de suplantación, fraude o pérdida financiera.

## 3. Protocolo de 4 Fases
1. **Fase 1: Contención Inmediata (< 1 hora)**:
   - Aislar el pod o servicio comprometido revocando credenciales en AWS IAM y rotando secretos en Secrets Manager.
   - Bloquear IPs atacantes en Cloudflare WAF.
   - Preservar logs y evidencias en S3 Object Lock (WORM).
2. **Fase 2: Erradicación y Análisis Forense**:
   - Analizar vector de ataque (logs de ALB, trazas OpenTelemetry, tabla `audit_log`).
   - Identificar el alcance exacto: tenants afectados, cantidad de registros y tipo de datos (PII, ventas, fiados).
3. **Fase 3: Notificación Formal**:
   - Diligenciar el formulario del Registro Nacional de Bases de Datos (RNBD) de la SIC:
     - Naturaleza del incidente.
     - Medidas de contención adoptadas.
     - Categorías de datos personales comprometidos.
   - Notificar vía correo electrónico oficial y WhatsApp a los dueños de las tiendas afectadas con recomendaciones de cambio de credenciales.
4. **Fase 4: Lecciones Aprendidas y Remediación**:
   - Publicar el reporte post-mortem sin PII en los canales internos.
   - Actualizar reglas de WAF, políticas de egreso o esquemas de validación Zod.
