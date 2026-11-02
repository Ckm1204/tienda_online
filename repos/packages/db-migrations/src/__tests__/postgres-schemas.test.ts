import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { auditCloudSchemasRls, buildMigrationPlan, DOCUMENTED_RLS_EXEMPT_TABLES } from "../index.js";

const DB_ROOT = path.resolve(import.meta.dirname, "../../../../db");
const cloudPlan = buildMigrationPlan(DB_ROOT).filter((item) => item.service !== "local-sqlite");
const services = [...new Set(cloudPlan.map((item) => item.service))];

async function migratedDatabase(service: string): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { btree_gist, citext, pgcrypto } });
  for (const item of cloudPlan.filter((p) => p.service === service)) {
    await db.exec(item.sql);
  }
  return db;
}

interface TenantTable {
  relname: string;
  is_partition: boolean;
  rls: boolean;
  force: boolean;
  policies: number;
}

describe("Esquemas de nube ejecutados en PostgreSQL real (PGlite)", () => {
  it.each(services)("%s: migra y fuerza RLS en cada tabla con tenant_id", async (service) => {
    const db = await migratedDatabase(service);
    try {
      const { rows } = await db.query<TenantTable>(`
        SELECT c.relname, c.relispartition AS is_partition, c.relrowsecurity AS rls,
               c.relforcerowsecurity AS force,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
        WHERE c.relkind IN ('r', 'p')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\_%'`);
      const tenantTables = rows.filter((row) => !DOCUMENTED_RLS_EXEMPT_TABLES.has(row.relname));
      expect(tenantTables.filter((row) => !(row.rls && row.force && row.policies > 0))).toEqual([]);

      // The fast static auditor (HU-469) must see exactly the tables the real catalog has.
      const staticReport = auditCloudSchemasRls(
        cloudPlan.filter((p) => p.service === service && p.version !== "000_common.sql")
      );
      expect([...staticReport.checkedTables].sort()).toEqual(
        tenantTables
          .filter((row) => !row.is_partition)
          .map((row) => `${service}.${row.relname}`)
          .sort()
      );
    } finally {
      await db.close();
    }
  }, 30_000);
});

describe("audit-service: audit_log solo admite inserciones (HU-095, HU-470)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await migratedDatabase("audit-service");
  });

  afterAll(async () => {
    await db.close();
  });

  function asAuditRw<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await tx.exec("SET LOCAL ROLE audit_rw");
      return work(tx);
    });
  }

  const insertEntry = (tx: Transaction | PGlite, tenantId: string) =>
    tx.query(
      `INSERT INTO audit_log (id, tenant_id, actor_kind, action, occurred_at, hash)
       VALUES (gen_random_uuid(), $1, 'USER', 'sale.void', now(), decode('00', 'hex'))`,
      [tenantId]
    );

  const countEntries = async (tx: Transaction | PGlite) =>
    (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_log")).rows[0]?.n;

  it("information_schema.role_table_grants muestra únicamente INSERT y SELECT para audit_rw", async () => {
    const { rows } = await db.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'audit_rw' AND table_name = 'audit_log' ORDER BY privilege_type`
    );
    expect(rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);

    // Also catches privileges inherited through PUBLIC or role membership, which that view omits.
    for (const privilege of ["UPDATE", "DELETE", "TRUNCATE"]) {
      const { rows: [check] } = await db.query<{ allowed: boolean }>(
        "SELECT has_table_privilege('audit_rw', 'audit_log', $1) AS allowed",
        [privilege]
      );
      expect(check?.allowed).toBe(false);
    }

    const { rows: [role] } = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'audit_rw'"
    );
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("audit_rw inserta y lee su tienda, y PostgreSQL rechaza UPDATE, DELETE y TRUNCATE", async () => {
    const tenant = randomUUID();
    await asAuditRw(tenant, (tx) => insertEntry(tx, tenant));
    expect(await asAuditRw(tenant, countEntries)).toBe(1);

    for (const sql of ["UPDATE audit_log SET action = 'tampered'", "DELETE FROM audit_log", "TRUNCATE audit_log"]) {
      await expect(asAuditRw(tenant, (tx) => tx.exec(sql))).rejects.toThrow("permission denied for table audit_log");
    }
    expect(await asAuditRw(tenant, countEntries)).toBe(1);
  });

  it("aísla las tiendas y no permite saltarse RLS leyendo la partición directamente", async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    await asAuditRw(tenantA, (tx) => insertEntry(tx, tenantA));

    expect(await asAuditRw(tenantB, countEntries)).toBe(0);
    await expect(asAuditRw(tenantB, (tx) => insertEntry(tx, tenantA))).rejects.toThrow("row-level security");
    await expect(asAuditRw(tenantA, (tx) => tx.exec("SELECT * FROM audit_log_default"))).rejects.toThrow(
      "permission denied for table audit_log_default"
    );
  });

  it("el rol dueño tampoco puede modificar, borrar o vaciar la bitácora, ni por la partición", async () => {
    await insertEntry(db, randomUUID());
    const before = await countEntries(db);

    for (const sql of [
      "UPDATE audit_log SET action = 'tampered'",
      "DELETE FROM audit_log",
      "TRUNCATE audit_log",
      "DELETE FROM audit_log_default",
      "TRUNCATE audit_log_default"
    ]) {
      await expect(db.exec(sql)).rejects.toThrow("audit_log is append-only");
    }
    expect(await countEntries(db)).toBe(before);
  });
});
