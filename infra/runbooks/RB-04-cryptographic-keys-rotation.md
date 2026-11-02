# RB-04: Rotación de Llaves Criptográficas (KMS, JWT y Secretos)
**Identificador:** RB-04 | **Severidad:** Procedimiento Operativo Programado / P2 | **HU:** HU-434, HU-341

## 1. Alcance
Cubre la rotación periódica y ante sospecha de compromiso de:
1. Par de llaves KMS `Ed25519` para firma de licencias SaaS y Edición Local.
2. Llaves RSA/ECDSA de emisión de JWT en `identity-service` (OIDC / OAuth2).
3. Secretos de conexión de bases de datos PostgreSQL en AWS Secrets Manager.
4. Certificados TLS de endpoints públicos (`*.tienditaonline.co`).

## 2. Procedimiento de Rotación de Llave KMS de Licencias (Dual Key)
1. **Creación de nueva llave**:
   - Crear en KMS una nueva llave Ed25519 con nuevo identificador `kid` (ej. `kms-ed25519-2027-q1`).
   - Publicar el nuevo `kid` en el JWKS público: `GET /.well-known/jwks.json`.
2. **Período de convivencia (Overlap de 30 días)**:
   - Ambas llaves públicas (la vieja y la nueva) deben figurar como válidas en los clientes POS (`apps/pos`).
   - `device-service` empieza a firmar las nuevas licencias con la llave nueva.
   - Las licencias previamente emitidas con la llave anterior siguen validándose sin error.
3. **Deprecación de la llave anterior**:
   - Una vez vencidas o renovadas las licencias firmadas con la llave previa, deshabilitar la llave antigua en KMS.

## 3. Rotación de Credenciales de Base de Datos en Secrets Manager (HU-341)
1. Secrets Manager ejecuta la función Lambda de rotación cada 30 días.
2. La función crea un usuario alterno (ej. `sales_rw_v2`), actualiza la contraseña y modifica el pool de conexiones en caliente.
3. Se verifica que no haya desconexiones ni errores 500 en la métrica `db_connection_errors_total`.
