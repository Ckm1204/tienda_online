# Checklist Final de Go-Live y Certificación de Apertura Comercial
**TienditaOnline v1.0** | **Hito:** 7 / Lanzamiento al Público | **HU:** HU-441, HU-442, HU-443, HU-444, HU-445, HU-502

## 1. Certificación de Hardware Físico en Laboratorio (HU-441)
- [x] Impresoras térmicas ESC/POS (58 mm y 80 mm) probadas por USB y Serial (Xprinter, Bixolon, Epson TM-T20).
- [x] Gavetas / Cajones monederos RJ11 accionados con pulso `ESC p 0 25 250`.
- [x] Balanzas electrónicas comerciales (Torrey, Dibal, Systel) probadas por RS-232 y emulación USB/Serial.
- [x] Lectores de código de barras 1D/2D probados en modo emulación teclado (HID) y USB Serial.

## 2. Prueba de Usabilidad con Tenderos Reales (HU-442)
- [x] Prueba cronometrada con 5 tenderos reales en Bogotá, Medellín y Cali.
- [x] Criterio superado: "Vender 5 productos en menos de 15 segundos y realizar el arqueo ciego sin asistencia técnica".

## 3. Auditoría de Seguridad y Pentest Externo (HU-443)
- [x] Aislamiento estricto multi-tenant verificado con RLS en PostgreSQL 16 (0 cross-tenant leaks).
- [x] Cero contraseñas ni llaves en texto plano (Argon2id, KMS, Secrets Manager).
- [x] Ausencia de vulnerabilidades críticas/altas en el reporte de auditoría.
- [x] Criptografía verificada: SQLCipher 256 bits, AES-256-GCM en respaldos `.tdbak`.

## 4. Piloto Controlado de 4 Semanas (HU-444)
- [x] 8 tiendas de barrio operadas en producción durante 28 días continuos.
- [x] Mix: 5 tiendas bajo plan SaaS y 3 tiendas bajo Edición Local (`LOCAL_ESENCIAL` y `LOCAL_PLUS`).
- [x] Cero pérdida de transacciones durante cortes de energía y reconexiones nocturnas.

## 5. Checklist Final de Infraestructura y Servicios (HU-445, HU-502)
- [x] DNS y TLS 1.3 activo en Cloudflare con WAF y Authenticated Origin Pulls.
- [x] Backups automáticos de 35 días configurados en Aurora PostgreSQL y snapshots en S3.
- [x] Pasarela de pagos Wompi/PayU configurada con webhook HMAC validado en producción.
- [x] Plantillas de WhatsApp Business aprobadas para confirmación de pagos y resumen nocturno.
- [x] Instaladores Windows (.msi/.exe) firmados con Authenticode y publicados con hash SHA-256 en el portal de descarga con detección automática de arquitectura (x64 / ARM64).
