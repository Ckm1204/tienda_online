# RB-01: Lag de Consumidor Alto en Kafka / Caída de Consumidor
**Identificador:** RB-01 | **Severidad:** P1 / Critical | **HU:** HU-431

## 1. Síntomas y Detección
- Alerta Prometheus: `KafkaConsumerLagHigh` disparada (lag > 5 minutos o > 300 eventos acumulados).
- Los tableros de inventario, reportería o ventas muestran retraso frente a las ventas ingresadas en caja.

## 2. Diagnóstico Paso a Paso
1. Identificar el grupo consumidor afectado:
   ```bash
   rpk group list
   rpk group describe <consumer-group-id>
   ```
2. Inspeccionar los logs del microservicio correspondiente (ej. `inventory-service` o `reporting-service`):
   ```bash
   kubectl logs -n tiendita-prod -l app=<service-name> --tail=100 -f
   ```
3. Verificar si el contenedor está en bucle de reinicio (`CrashLoopBackOff`) o sufriendo OOMKilled:
   ```bash
   kubectl get pods -n tiendita-prod -l app=<service-name>
   ```

## 3. Mitigación y Recuperación
1. **Escalado Horizontal de Pods Consumidores**:
   Si el lag se debe a un pico masivo (ej. reconexión tras corte de energía), escalar el consumidor hasta el número de particiones del topic:
   ```bash
   kubectl scale deployment -n tiendita-prod <service-name> --replicas=6
   ```
2. **Reinicio Controlado**:
   Si el pod quedó bloqueado por un deadlock o fallo de red:
   ```bash
   kubectl rollout restart deployment -n tiendita-prod <service-name>
   ```
3. **Mensaje Envenenado (Poison Pill)**:
   Si el consumidor se estrella repetidamente con el mismo `offset`:
   - Verificar si el error ya fue redirigido al Dead Letter Topic `<topic>.dlt`.
   - Si no, ejecutar el script de rescate para forzar el avance del commit offset al siguiente mensaje y copiar el envenenado a S3 para análisis.
