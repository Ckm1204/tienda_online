-- audit-service: inmutabilidad de audit_log aplicada por PostgreSQL (HU-095, HU-470).

-- Crear particiones mensuales por adelantado: adjuntar un rango falla si DEFAULT ya tiene filas de ese rango.
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;
SELECT app.enable_tenant_rls('audit_log_default');

CREATE FUNCTION app.forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;

-- Evita errores del rol dueño, que sí puede retirar triggers; la garantía real son los permisos de audit_rw y la copia WORM.
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION app.forbid_audit_mutation();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_audit_mutation();

-- Los triggers por sentencia no se heredan: cada partición nueva necesita el suyo.
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log_default
  FOR EACH STATEMENT EXECUTE FUNCTION app.forbid_audit_mutation();

-- LOGIN y credenciales se asignan fuera de las migraciones (Secrets Manager).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_rw') THEN
    CREATE ROLE audit_rw NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA app TO audit_rw;
GRANT SELECT, INSERT ON audit_log TO audit_rw;
