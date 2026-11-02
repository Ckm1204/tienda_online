import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildMigrationPlan,
  InMemoryMigrationState,
  runMigrationsIdempotent,
  auditCloudSchemasRls
} from "../index.js";

const DB_ROOT = path.resolve(import.meta.dirname, "../../../../db");

describe("FT-01.1 — Migraciones SQL, 000_common.sql y Auditoría Automática de RLS (HU-005, HU-139, HU-140, HU-469)", () => {
  it("HU-005: ejecuta el plan de migraciones de forma idempotente en nube y local (segunda ejecución salta todo sin error)", async () => {
    const plan = buildMigrationPlan(DB_ROOT);
    expect(plan.length).toBeGreaterThanOrEqual(25);

    const executor = new InMemoryMigrationState();
    const run1 = await runMigrationsIdempotent(plan, executor);
    expect(run1.appliedCount).toBe(plan.length);
    expect(run1.skippedCount).toBe(0);

    const run2 = await runMigrationsIdempotent(plan, executor);
    expect(run2.appliedCount).toBe(0);
    expect(run2.skippedCount).toBe(plan.length);
  });

  it("HU-139: 000_common.sql define app.current_tenant(), app.touch_row() con pg_current_xact_id() y app.enable_tenant_rls() con FORCE ROW LEVEL SECURITY", () => {
    const commonSql = fs.readFileSync(path.join(DB_ROOT, "cloud/000_common.sql"), "utf8");
    expect(commonSql).toContain("CREATE OR REPLACE FUNCTION app.current_tenant()");
    expect(commonSql).toContain("current_setting('app.tenant_id', true)");
    expect(commonSql).toContain("CREATE OR REPLACE FUNCTION app.touch_row()");
    expect(commonSql).toContain("NEW.row_xid    := pg_current_xact_id()");
    expect(commonSql).toContain("CREATE OR REPLACE FUNCTION app.enable_tenant_rls(tbl regclass)");
    expect(commonSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(commonSql).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("HU-140: 000_common.sql define las tablas outbox e inbox y el índice parcial outbox_unpublished WHERE published_at IS NULL", () => {
    const commonSql = fs.readFileSync(path.join(DB_ROOT, "cloud/000_common.sql"), "utf8");
    expect(commonSql).toContain("CREATE TABLE IF NOT EXISTS outbox");
    expect(commonSql).toContain("CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox (id) WHERE published_at IS NULL");
    expect(commonSql).toContain("CREATE TABLE IF NOT EXISTS inbox");
    expect(commonSql).toContain("PRIMARY KEY (event_id, consumer)");
  });

  it("HU-469: el 100 % de las tablas multi-tenant con tenant_id en db/cloud/*/00*.sql tienen RLS forzado y el auditor detecta si falta en una tabla nueva", () => {
    const plan = buildMigrationPlan(DB_ROOT);
    const cloudSqls = plan
      .filter((p) => p.service !== "local-sqlite" && p.version !== "000_common.sql")
      .map((p) => ({ service: p.service, sql: p.sql }));

    const report = auditCloudSchemasRls(cloudSqls);
    expect(report.missingRlsTables).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.checkedTables.length).toBeGreaterThanOrEqual(35);

    // Simular que un desarrollador crea una tabla nueva con tenant_id y olvida enable_tenant_rls
    const brokenReport = auditCloudSchemasRls([
      ...cloudSqls,
      {
        service: "catalog-service",
        sql: `
          CREATE TABLE forgotten_table (
            id uuid PRIMARY KEY,
            tenant_id uuid NOT NULL,
            name text NOT NULL
          );
        `
      }
    ]);
    expect(brokenReport.passed).toBe(false);
    expect(brokenReport.missingRlsTables).toEqual([
      { service: "catalog-service", table: "forgotten_table" }
    ]);
  });
});
