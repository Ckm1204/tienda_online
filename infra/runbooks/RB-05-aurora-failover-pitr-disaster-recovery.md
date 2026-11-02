# RB-05: Failover de Aurora PostgreSQL y Restauración Point-In-Time (PITR)
**Identificador:** RB-05 | **Severidad:** P0 / Critical | **HU:** HU-435, HU-340

## 1. Alcance
Procedimiento de recuperación ante desastre: caída de la instancia escritora de Aurora PostgreSQL, corrupción de datos o pérdida catastrófica de disponibilidad.

## 2. Failover Automático Multi-AZ (< 30 segundos)
1. Aurora detecta falla en la instancia Writer y promueve automáticamente la réplica Reader a Writer.
2. El DNS del endpoint de clúster (`tiendita-prod-aurora.cluster-...`) conmuta a la nueva instancia en menos de 30 segundos.
3. Los microservicios reintentan la conexión automáticamente gracias al backoff configurado en `@tiendita/service-kit`.

## 3. Procedimiento de Restauración Point-In-Time (PITR) ante Corrupción (HU-340)
1. **Determinar el punto exacto de corrupción `T_corrupt`**:
   - Consultar la última transacción válida en `audit_log` o logs de CloudWatch.
2. **Restaurar clúster a un punto temporal (`T_corrupt - 1 minuto`)**:
   ```bash
   aws rds restore-db-cluster-to-point-in-time \
     --source-db-cluster-identifier tiendita-prod-aurora \
     --db-cluster-identifier tiendita-prod-aurora-restored \
     --restore-to-time 2026-11-02T14:30:00Z \
     --db-subnet-group-name tiendita-prod-aurora-subnets \
     --kms-key-id alias/tiendita-prod-master
   ```
3. **Reconstrucción desde el Outbox de las terminales**:
   - Enviar a todas las cajas activas el flag `request_replay_after_timestamp = T_corrupt - 1 minuto`.
   - Las cajas reenvían automáticamente sus eventos locales desde esa marca de tiempo, restaurando el 100 % de las ventas sin pérdida alguna de datos de los tenderos.
