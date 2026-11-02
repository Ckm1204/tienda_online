import path from "node:path";
import {
  buildMigrationPlan,
  InMemoryMigrationState,
  runMigrationsIdempotent,
  auditCloudSchemasRls
} from "./index.js";

const dbRoot = path.resolve(import.meta.dirname, "../../../db");
const plan = buildMigrationPlan(dbRoot);
const state = new InMemoryMigrationState();

const firstRun = await runMigrationsIdempotent(plan, state);
const rlsReport = auditCloudSchemasRls(
  plan
    .filter((p) => p.service !== "local-sqlite" && p.version !== "000_common.sql")
    .map((p) => ({ service: p.service, sql: p.sql }))
);

if (!rlsReport.passed) {
  console.error("RLS audit failed for tables:", rlsReport.missingRlsTables);
  process.exit(1);
}

console.log(
  `Migrations verified: ${firstRun.appliedCount} files across services; RLS verified on ${rlsReport.checkedTables.length} multi-tenant tables.`
);
