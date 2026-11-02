import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface MigrationPlanItem {
  service: string;
  version: string;
  filePath: string;
  checksumSha256: string;
  sql: string;
}

export interface SqlExecutor {
  getAppliedVersions(service: string): Promise<Map<string, string>>;
  applyMigration(item: MigrationPlanItem): Promise<void>;
}

/**
 * In-memory idempotent migration state store for dry-run / CI validation and unit testing (HU-005).
 */
export class InMemoryMigrationState implements SqlExecutor {
  private readonly applied = new Map<string, Map<string, string>>();
  public executionCount = 0;

  async getAppliedVersions(service: string): Promise<Map<string, string>> {
    return this.applied.get(service) ?? new Map();
  }

  async applyMigration(item: MigrationPlanItem): Promise<void> {
    let svcMap = this.applied.get(item.service);
    if (!svcMap) {
      svcMap = new Map();
      this.applied.set(item.service, svcMap);
    }
    svcMap.set(item.version, item.checksumSha256);
    this.executionCount += 1;
  }
}

export const CLOUD_SERVICES_WITH_DB = [
  "tenant-service",
  "identity-service",
  "device-service",
  "catalog-service",
  "sync-service",
  "sales-service",
  "cash-service",
  "inventory-service",
  "customer-service",
  "reporting-service",
  "audit-service",
  "notification-service",
  "einvoicing-service"
] as const;

export function buildMigrationPlan(dbRootDir: string): MigrationPlanItem[] {
  const plan: MigrationPlanItem[] = [];
  const cloudDir = path.join(dbRootDir, "cloud");
  const commonFile = path.join(cloudDir, "000_common.sql");
  const commonSql = fs.readFileSync(commonFile, "utf8");
  const commonHash = crypto.createHash("sha256").update(commonSql).digest("hex");

  for (const service of CLOUD_SERVICES_WITH_DB) {
    const svcDir = path.join(cloudDir, service);
    if (!fs.existsSync(svcDir)) continue;

    plan.push({
      service,
      version: "000_common.sql",
      filePath: commonFile,
      checksumSha256: commonHash,
      sql: commonSql
    });

    const files = fs
      .readdirSync(svcDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const fullPath = path.join(svcDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      const checksumSha256 = crypto.createHash("sha256").update(sql).digest("hex");
      plan.push({
        service,
        version: file,
        filePath: fullPath,
        checksumSha256,
        sql
      });
    }
  }

  const localDir = path.join(dbRootDir, "local");
  if (fs.existsSync(localDir)) {
    const localFiles = fs
      .readdirSync(localDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of localFiles) {
      const fullPath = path.join(localDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      const checksumSha256 = crypto.createHash("sha256").update(sql).digest("hex");
      plan.push({
        service: "local-sqlite",
        version: file,
        filePath: fullPath,
        checksumSha256,
        sql
      });
    }
  }

  return plan;
}

/**
 * HU-005: Ejecuta las migraciones de forma idempotente.
 * Si una versión ya fue aplicada con el mismo checksum, la omite.
 * Si el checksum cambió sobre una versión ya aplicada, lanza error de integridad.
 */
export async function runMigrationsIdempotent(
  plan: MigrationPlanItem[],
  executor: SqlExecutor
): Promise<{ appliedCount: number; skippedCount: number }> {
  let appliedCount = 0;
  let skippedCount = 0;

  for (const item of plan) {
    const applied = await executor.getAppliedVersions(item.service);
    const prevHash = applied.get(item.version);
    if (prevHash) {
      if (prevHash !== item.checksumSha256) {
        throw new Error(
          `Migration checksum mismatch for ${item.service}/${item.version}: expected ${prevHash}, got ${item.checksumSha256}`
        );
      }
      skippedCount += 1;
      continue;
    }
    await executor.applyMigration(item);
    appliedCount += 1;
  }

  return { appliedCount, skippedCount };
}

/**
 * Excepciones explícitamente documentadas de tablas con columna `tenant_id` nullable
 * que almacenan registros globales de plataforma (`tenant_id IS NULL`):
 * - `users` y `roles` (identity-service: super admins y roles de sistema)
 * - `notifications` (notification-service: avisos de plataforma)
 * - `outbox` (000_common.sql: leída exclusivamente por el proceso OutboxRelay interno)
 */
export const DOCUMENTED_RLS_EXEMPT_TABLES = new Set([
  "users",
  "roles",
  "notifications",
  "outbox"
]);

export interface RlsAuditReport {
  passed: boolean;
  checkedTables: string[];
  missingRlsTables: { service: string; table: string }[];
}

/**
 * HU-469: Verificación automática de que toda tabla multi-tenant con `tenant_id`
 * en las migraciones SQL de `db/cloud/<service>/` tiene `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`
 * a través de `app.enable_tenant_rls(...)`.
 */
export function auditCloudSchemasRls(sqlFiles: { service: string; sql: string }[]): RlsAuditReport {
  const checkedTables: string[] = [];
  const missingRlsTables: { service: string; table: string }[] = [];

  const byService = new Map<string, string[]>();
  for (const entry of sqlFiles) {
    const arr = byService.get(entry.service) ?? [];
    arr.push(entry.sql);
    byService.set(entry.service, arr);
  }

  for (const [service, sqls] of byService.entries()) {
    const combinedSql = sqls.join("\n");
    const rlsEnabled = new Set<string>();

    const directCalls = combinedSql.matchAll(/enable_tenant_rls\(\s*'([a-zA-Z0-9_]+)'/g);
    for (const m of directCalls) {
      if (m[1]) rlsEnabled.add(m[1]);
    }

    const arrayLoops = combinedSql.matchAll(/ARRAY\[([^\]]+)\][\s\S]*?enable_tenant_rls/g);
    for (const m of arrayLoops) {
      const inner = m[1] ?? "";
      for (const tblMatch of inner.matchAll(/'([a-zA-Z0-9_]+)'/g)) {
        if (tblMatch[1]) rlsEnabled.add(tblMatch[1]);
      }
    }

    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:PARTITION\s+BY[^;]+)?;/gi;
    for (const match of combinedSql.matchAll(createTableRegex)) {
      const tableName = match[1] ?? "";
      const body = match[2] ?? "";
      const hasTenantIdCol = /^\s*tenant_id\s+uuid\b/im.test(body);
      if (!hasTenantIdCol) continue;
      if (DOCUMENTED_RLS_EXEMPT_TABLES.has(tableName)) continue;

      checkedTables.push(`${service}.${tableName}`);
      if (!rlsEnabled.has(tableName)) {
        missingRlsTables.push({ service, table: tableName });
      }
    }
  }

  return {
    passed: missingRlsTables.length === 0,
    checkedTables,
    missingRlsTables
  };
}
