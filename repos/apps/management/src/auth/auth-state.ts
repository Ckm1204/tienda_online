export interface ManagementUser {
  id: string;
  fullName: string;
  email: string | null;
  roleCode: "OWNER" | "SUPERVISOR" | "CASHIER" | "INVENTORY" | "ACCOUNTANT" | "SUPER_ADMIN";
  permissions: string[];
}

export interface TenantInfo {
  id: string;
  businessName: string;
  nit: string;
  status: "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED";
  planCode: "TENDERO" | "NEGOCIO" | "MULTITIENDA";
}

export interface TenantEntitlements {
  max_terminals: number;
  max_users: number;
  features: Record<string, boolean>;
}

export interface BranchInfo {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface SessionContext {
  token: string;
  user: ManagementUser;
  tenant: TenantInfo | null;
  entitlements: TenantEntitlements | null;
  branches: BranchInfo[];
  mfaAuthenticatedAtEpochSec?: number;
}

export class ManagementAuthService {
  private currentSession: SessionContext | null = null;
  private readonly listeners = new Set<(session: SessionContext | null) => void>();

  constructor(private readonly apiOrigin = "http://127.0.0.1:3000") {}

  getSession(): SessionContext | null {
    return this.currentSession;
  }

  subscribe(listener: (session: SessionContext | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      l(this.currentSession);
    }
  }

  async login(params: {
    email: string;
    password: string;
    mfaCode?: string;
    fetchFn?: any;
  }): Promise<{ success: boolean; mfaRequired?: boolean; error?: string }> {
    const doFetch = params.fetchFn ?? fetch;
    try {
      const res = await doFetch(`${this.apiOrigin}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: params.email,
          password: params.password,
          mfaCode: params.mfaCode
        })
      });

      const data = await res.json();
      if (res.status === 401 && data.error === "MFA_REQUIRED") {
        return { success: false, mfaRequired: true };
      }
      if (!res.ok) {
        return { success: false, error: data.error || `HTTP_${res.status}` };
      }

      // Login exitoso, obtener bootstrap de sesión
      const token = data.accessToken;
      const bootRes = await doFetch(`${this.apiOrigin}/v1/app/bootstrap`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!bootRes.ok) {
        return { success: false, error: "BOOTSTRAP_FAILED" };
      }

      const bootData = await bootRes.json();
      this.currentSession = {
        token,
        user: {
          id: bootData.user.id,
          fullName: bootData.user.full_name,
          email: bootData.user.email,
          roleCode: bootData.user.role_code,
          permissions: bootData.user.permissions
        },
        tenant: bootData.tenant
          ? {
              id: bootData.tenant.id,
              businessName: bootData.tenant.business_name,
              nit: bootData.tenant.nit,
              status: bootData.tenant.status,
              planCode: bootData.tenant.plan_code
            }
          : null,
        entitlements: bootData.entitlements,
        branches: bootData.branches,
        mfaAuthenticatedAtEpochSec: data.claims?.mfa_authenticated_at
      };

      this.notify();
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "NETWORK_ERROR" };
    }
  }

  logout(): void {
    this.currentSession = null;
    this.notify();
  }

  hasPermission(permission: string): boolean {
    if (!this.currentSession) return false;
    const { roleCode, permissions } = this.currentSession.user;
    if (roleCode === "OWNER" || roleCode === "SUPER_ADMIN") return true;
    return permissions.includes(permission);
  }

  hasRecentMfa(maxAgeSeconds = 300, nowEpochSec = Math.floor(Date.now() / 1000)): boolean {
    if (!this.currentSession?.mfaAuthenticatedAtEpochSec) return false;
    return nowEpochSec - this.currentSession.mfaAuthenticatedAtEpochSec <= maxAgeSeconds;
  }
}
