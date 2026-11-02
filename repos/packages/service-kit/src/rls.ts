/**
 * HU-010 & HU-155: Middleware y helper de base de datos con Row-Level Security
 * (`SET LOCAL app.tenant_id = '<uuid>'`) y helper `assertTenantIsolation`.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RlsTransactionSession {
  executeSql(sql: string, params?: unknown[]): Promise<void>;
  getCurrentTenant(): string | null;
}

export async function withTenant<T>(
  tx: RlsTransactionSession,
  tenantId: string | null | undefined,
  fn: (scopedTx: RlsTransactionSession) => Promise<T>
): Promise<T> {
  if (!tenantId || !UUID_REGEX.test(tenantId)) {
    throw new Error("TENANT_CONTEXT_MISSING_OR_INVALID");
  }
  await tx.executeSql(`SET LOCAL app.tenant_id = '${tenantId}'`);
  return fn(tx);
}

/**
 * In-memory RLS Table Simulator that mirrors PostgreSQL `ENABLE/FORCE ROW LEVEL SECURITY`
 * with policy `USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant())`.
 */
export class RlsProtectedMemoryTable<TRow extends { id: string; tenant_id: string }> {
  private readonly rows = new Map<string, TRow>();
  private currentTenantId: string | null = null;
  public lastExecutedSql: string | null = null;

  createSession(): RlsTransactionSession {
    return {
      executeSql: async (sql: string) => {
        this.lastExecutedSql = sql;
        const m = sql.match(/SET LOCAL app\.tenant_id = '([^']+)'/);
        if (m?.[1]) {
          this.currentTenantId = m[1];
        }
      },
      getCurrentTenant: () => this.currentTenantId
    };
  }

  clearTenantSession(): void {
    this.currentTenantId = null;
  }

  selectAll(): TRow[] {
    if (!this.currentTenantId) {
      return [];
    }
    return [...this.rows.values()].filter((r) => r.tenant_id === this.currentTenantId);
  }

  selectById(id: string): TRow | undefined {
    if (!this.currentTenantId) return undefined;
    const row = this.rows.get(id);
    if (!row || row.tenant_id !== this.currentTenantId) return undefined;
    return row;
  }

  insert(row: TRow): TRow {
    if (!this.currentTenantId) {
      throw new Error("RLS_VIOLATION: current_tenant() is NULL");
    }
    if (row.tenant_id !== this.currentTenantId) {
      throw new Error("RLS_WITH_CHECK_VIOLATION: row.tenant_id != app.current_tenant()");
    }
    this.rows.set(row.id, { ...row });
    return row;
  }

  update(id: string, patch: Partial<TRow>): boolean {
    const existing = this.selectById(id);
    if (!existing) return false;
    const updated = { ...existing, ...patch, tenant_id: existing.tenant_id };
    this.rows.set(id, updated);
    return true;
  }

  delete(id: string): boolean {
    const existing = this.selectById(id);
    if (!existing) return false;
    return this.rows.delete(id);
  }
}

/**
 * HU-155: Helper reutilizable de pruebas de aislamiento multi-tenant.
 * Crea un recurso bajo `tenantA` y verifica que `tenantB` reciba 0 filas / false en lectura, edición y borrado.
 */
export interface TenantIsolationTestHarness<TResource> {
  createAsTenant(tenantId: string): Promise<{ id: string; resource: TResource }>;
  readAsTenant(tenantId: string, resourceId: string): Promise<TResource | null | undefined>;
  updateAsTenant(tenantId: string, resourceId: string): Promise<boolean>;
  deleteAsTenant(tenantId: string, resourceId: string): Promise<boolean>;
}

export async function assertTenantIsolation<TResource>(
  harness: TenantIsolationTestHarness<TResource>,
  tenantA = "0192a8d4-0000-7000-8000-00000000000a",
  tenantB = "0192a8d4-0000-7000-8000-00000000000b"
): Promise<void> {
  const { id } = await harness.createAsTenant(tenantA);

  const ownRead = await harness.readAsTenant(tenantA, id);
  if (!ownRead) {
    throw new Error("Tenant A could not read its own resource");
  }

  const crossRead = await harness.readAsTenant(tenantB, id);
  if (crossRead !== null && crossRead !== undefined) {
    throw new Error("TENANT_ISOLATION_BREACH: Tenant B read Tenant A resource");
  }

  const crossUpdate = await harness.updateAsTenant(tenantB, id);
  if (crossUpdate) {
    throw new Error("TENANT_ISOLATION_BREACH: Tenant B updated Tenant A resource");
  }

  const crossDelete = await harness.deleteAsTenant(tenantB, id);
  if (crossDelete) {
    throw new Error("TENANT_ISOLATION_BREACH: Tenant B deleted Tenant A resource");
  }
}
