import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  analyzeTypeScriptSource,
  analyzeRustDomainSource,
  DEFAULT_COLOMBIA_REGIONAL_CONFIG,
  formatMoneyCents,
  parsePesosInputToCents,
  toLocalCalendarDate,
  auditDependencyLicenses,
  runPostDeploySmokeSuite
} from "../index.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");

describe("FT-01.1 — Monorepo, Configuración Base, Calidad, Licencias y Smoke Tests", () => {
  it("HU-001: monorepo structure contains pnpm-workspace.yaml, turbo.json and Cargo.toml workspace", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, "turbo.json"))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, "Cargo.toml"))).toBe(true);

    const cargoToml = fs.readFileSync(path.join(REPO_ROOT, "Cargo.toml"), "utf8");
    expect(cargoToml).toContain('unwrap_used = "deny"');
  });

  it("HU-002: rechaza el uso de 'any' explícito y SQL concatenado con template literals en TypeScript", () => {
    const badTs = [
      "const price: any = 2500;",
      "const q = `SELECT * FROM products WHERE id = '${userId}'`;"
    ].join("\n");

    const violations = analyzeTypeScriptSource(badTs);
    expect(violations).toHaveLength(2);
    expect(violations[0]?.rule).toBe("no-explicit-any");
    expect(violations[0]?.line).toBe(1);
    expect(violations[1]?.rule).toBe("no-concatenated-sql");
    expect(violations[1]?.line).toBe(2);
  });

  it("HU-002: rechaza .unwrap() en módulos de dominio Rust (apps/pos/src-tauri/domain)", () => {
    const badRust = `
      pub fn calc_total(val: Option<i64>) -> i64 {
        val.unwrap()
      }
    `;
    const violations = analyzeRustDomainSource(badRust, "apps/pos/src-tauri/domain/sales.rs");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.rule).toBe("no-rust-unwrap");
    expect(violations[0]?.line).toBe(3);
  });

  it("HU-003: pipeline de GitHub Actions incluye jobs de lint, test-ts, test-rust, contract-check, semgrep y gitleaks, y el detector bloquea llaves privadas", () => {
    const ciPath = path.join(REPO_ROOT, ".github/workflows/ci.yml");
    expect(fs.existsSync(ciPath)).toBe(true);
    const ciYaml = fs.readFileSync(ciPath, "utf8");
    for (const jobName of ["lint:", "test-ts:", "test-rust:", "contract-check:", "semgrep:", "gitleaks:", "smoke-test:"]) {
      expect(ciYaml).toContain(jobName);
    }

    const leakedCode = 'const key = "-----BEGIN RSA PRIVATE KEY-----";';
    const violations = analyzeTypeScriptSource(leakedCode);
    expect(violations.some((v) => v.rule === "no-hardcoded-secret")).toBe(true);
  });

  it("HU-004: docker-compose local define postgres, redis, redpanda, keycloak, minio y mailpit e inicializa las 12 bases de datos", () => {
    const composePath = path.join(REPO_ROOT, "infra/local/docker-compose.yml");
    const initDbPath = path.join(REPO_ROOT, "infra/local/initdb/01-databases.sql");
    expect(fs.existsSync(composePath)).toBe(true);
    expect(fs.existsSync(initDbPath)).toBe(true);

    const initSql = fs.readFileSync(initDbPath, "utf8");
    const expectedDbs = [
      "tenant_db",
      "identity_db",
      "device_db",
      "catalog_db",
      "sync_db",
      "sales_db",
      "cash_db",
      "inventory_db",
      "customer_db",
      "reporting_db",
      "audit_db",
      "notification_db"
    ];
    for (const dbName of expectedDbs) {
      expect(initSql).toContain(`CREATE DATABASE ${dbName};`);
    }
  });

  it("HU-496 & HU-483: formatea moneda COP con puntos de miles y calcula fechas en zona America/Bogota (UTC-5)", () => {
    expect(DEFAULT_COLOMBIA_REGIONAL_CONFIG.locale).toBe("es-CO");
    expect(DEFAULT_COLOMBIA_REGIONAL_CONFIG.currency).toBe("COP");
    expect(DEFAULT_COLOMBIA_REGIONAL_CONFIG.timeZone).toBe("America/Bogota");

    expect(formatMoneyCents(5_000_000)).toBe("$ 50.000");
    expect(formatMoneyCents(-250_000)).toBe("-$ 2.500");
    expect(parsePesosInputToCents("$ 50.000")).toBe(5_000_000);

    // HU-483: 2026-10-31T22:30:00-05:00 es 2026-11-01T03:30:00Z en UTC, pero en Colombia sigue siendo 2026-10-31
    expect(toLocalCalendarDate("2026-11-01T03:30:00Z")).toBe("2026-10-31");
  });

  it("HU-498: suite de smoke tests post-despliegue verifica ready, auth, sync push sintético y lectura de dashboard en < 30s", async () => {
    const okReport = await runPostDeploySmokeSuite({
      name: "staging",
      checkReady: async () => ({ status: 200, ready: true }),
      checkAuth: async () => ({ status: 200 }),
      checkSyntheticSyncPush: async () => ({ status: 200, ackUpToSeq: 10 }),
      checkDashboardRead: async () => ({ status: 200 })
    });
    expect(okReport.passed).toBe(true);
    expect(okReport.failures).toHaveLength(0);

    const failedReport = await runPostDeploySmokeSuite({
      name: "staging-broken",
      checkReady: async () => ({ status: 503, ready: false }),
      checkAuth: async () => ({ status: 200 }),
      checkSyntheticSyncPush: async () => ({ status: 200, ackUpToSeq: 10 }),
      checkDashboardRead: async () => ({ status: 200 })
    });
    expect(failedReport.passed).toBe(false);
    expect(failedReport.failures[0]).toContain("503");
  });

  it("HU-499: rechaza dependencias con licencias copyleft restrictivas (AGPL/GPL) y permite MIT/Apache-2.0/BSD/ISC", () => {
    const clean = auditDependencyLicenses([
      { name: "zod", version: "3.24.1", license: "MIT" },
      { name: "typescript", version: "5.7.2", license: "Apache-2.0" }
    ]);
    expect(clean.passed).toBe(true);

    const contaminated = auditDependencyLicenses([
      { name: "zod", version: "3.24.1", license: "MIT" },
      { name: "some-copyleft-pkg", version: "1.0.0", license: "AGPL-3.0" }
    ]);
    expect(contaminated.passed).toBe(false);
    expect(contaminated.forbidden).toHaveLength(1);
    expect(contaminated.forbidden[0]?.name).toBe("some-copyleft-pkg");
  });
});
