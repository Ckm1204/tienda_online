import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Mock lucide icons
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/key", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/clock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/play", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/lock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/lock-open", () => ({ default: () => null }));

import {
  SuperAdminScreen,
  SuperAdminMetrics,
  PlatformTenantItem,
  LocalLicenseItem
} from "../components/SuperAdminScreen";

const MOCK_METRICS: SuperAdminMetrics = {
  mrrCents: 1598000000, // $15.980.000 COP
  activeTenants: 120,
  trialTenants: 25,
  pastDueTenants: 4,
  restrictedTenants: 2,
  suspendedTenants: 1
};

const MOCK_TENANTS: PlatformTenantItem[] = [
  {
    id: "tenant-001",
    nit: "901555888-3",
    legalName: "Tienda La Esmeralda",
    plan: "NEGOCIO",
    status: "ACTIVE",
    branchesCount: 1,
    terminalsCount: 2,
    graceExtensionsCount: 0
  },
  {
    id: "tenant-002",
    nit: "900123456-1",
    legalName: "Supermercado El Roble",
    plan: "PRO",
    status: "ACTIVE",
    branchesCount: 3,
    terminalsCount: 6,
    graceExtensionsCount: 1
  },
  {
    id: "tenant-003",
    nit: "800987654-2",
    legalName: "Minimarket Los Paisas",
    plan: "BASICO",
    status: "SUSPENDED",
    branchesCount: 1,
    terminalsCount: 1,
    graceExtensionsCount: 0
  }
];

const MOCK_LICENSES: LocalLicenseItem[] = [
  {
    id: "lic-001",
    tenantId: "offline-tenant-choco",
    edition: "LOCAL_PLUS",
    terminalsAllowed: 2,
    serialLast4: "9278E",
    status: "ACTIVE",
    issuedAtMs: Date.now() - 86400000 * 5,
    expiresAtMs: Date.now() + 86400000 * 360
  }
];

describe("SuperAdminScreen (Consola Super Admin & Plataforma SaaS - Épica 12)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza métricas SaaS globales, directorio de tiendas y licencias locales", () => {
    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={vi.fn()}
        onSuspendTenant={vi.fn()}
        onReactivateTenant={vi.fn()}
        onGrantGraceExtension={vi.fn()}
        onIssueLocalLicense={vi.fn()}
        onRequestJitSupport={vi.fn()}
        onRunDunningScheduler={vi.fn()}
      />
    );

    expect(screen.getByTestId("super-admin-screen")).toBeTruthy();
    expect(screen.getByText("Consola Super Admin & Plataforma SaaS")).toBeTruthy();
    expect(screen.getByText("$15.980.000 COP")).toBeTruthy();
    expect(screen.getByText("Tienda La Esmeralda")).toBeTruthy();
    expect(screen.getByText("Supermercado El Roble")).toBeTruthy();
    expect(screen.getByText("Minimarket Los Paisas")).toBeTruthy();
    expect(screen.getByText("Serial: TDL-•••••-•••••-9278E")).toBeTruthy();
  });

  it("filtra tiendas por texto de búsqueda y por pestañas de estado", () => {
    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={vi.fn()}
        onSuspendTenant={vi.fn()}
        onReactivateTenant={vi.fn()}
        onGrantGraceExtension={vi.fn()}
        onIssueLocalLicense={vi.fn()}
        onRequestJitSupport={vi.fn()}
        onRunDunningScheduler={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId("input-search-tenants");
    fireEvent.change(searchInput, { target: { value: "Esmeralda" } });

    expect(screen.getByText("Tienda La Esmeralda")).toBeTruthy();
    expect(screen.queryByText("Supermercado El Roble")).toBeNull();

    fireEvent.change(searchInput, { target: { value: "" } });

    // Filtrar solo suspendidas
    const suspendedTab = screen.getByTestId("filter-tab-SUSPENDED");
    fireEvent.click(suspendedTab);

    expect(screen.queryByText("Tienda La Esmeralda")).toBeNull();
    expect(screen.getByText("Minimarket Los Paisas")).toBeTruthy();
  });

  it("calcula dígito de verificación Módulo 11 en tiempo real al ingresar NIT", () => {
    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={vi.fn()}
        onSuspendTenant={vi.fn()}
        onReactivateTenant={vi.fn()}
        onGrantGraceExtension={vi.fn()}
        onIssueLocalLicense={vi.fn()}
        onRequestJitSupport={vi.fn()}
        onRunDunningScheduler={vi.fn()}
      />
    );

    const openCreateBtn = screen.getByTestId("btn-open-create-tenant-modal");
    fireEvent.click(openCreateBtn);

    const nitInput = screen.getByTestId("input-store-nit");
    // NIT 901555888 tiene DV 3
    fireEvent.change(nitInput, { target: { value: "901555888" } });

    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/NIT válido con Dígito de Verificación 3/)).toBeTruthy();
  });

  it("ejecuta saga de creación de tienda y muestra token de activación y terminal", async () => {
    const mockCreateSaga = vi.fn().mockResolvedValue({
      tenantId: "tenant-new-001",
      activationToken: "act_test_token_abc123",
      terminalCode: "CAJA-01"
    });

    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={mockCreateSaga}
        onSuspendTenant={vi.fn()}
        onReactivateTenant={vi.fn()}
        onGrantGraceExtension={vi.fn()}
        onIssueLocalLicense={vi.fn()}
        onRequestJitSupport={vi.fn()}
        onRunDunningScheduler={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("btn-open-create-tenant-modal"));
    fireEvent.change(screen.getByTestId("input-store-name"), { target: { value: "Tienda Nueva Boyacá" } });
    fireEvent.change(screen.getByTestId("input-store-nit"), { target: { value: "901555888" } });
    fireEvent.change(screen.getByTestId("input-store-email"), { target: { value: "boyaca@tienda.co" } });

    fireEvent.click(screen.getByTestId("btn-submit-create-tenant"));

    await waitFor(() => {
      expect(mockCreateSaga).toHaveBeenCalledWith({
        businessName: "Tienda Nueva Boyacá",
        documentType: "NIT",
        documentNumber: "901555888",
        nitDv: 3,
        planCode: "NEGOCIO",
        ownerEmail: "boyaca@tienda.co",
        ownerPhone: undefined
      });
      expect(screen.getByTestId("tenant-created-success-box")).toBeTruthy();
      expect(screen.getByText("act_test_token_abc123")).toBeTruthy();
    });
  });

  it("emite licencia local con serial TDL", async () => {
    const mockIssue = vi.fn().mockResolvedValue({
      licenseId: "lic-999",
      serialKey: "TDL-149C5-86BB3-C0BF9-9278E"
    });

    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={vi.fn()}
        onSuspendTenant={vi.fn()}
        onReactivateTenant={vi.fn()}
        onGrantGraceExtension={vi.fn()}
        onIssueLocalLicense={mockIssue}
        onRequestJitSupport={vi.fn()}
        onRunDunningScheduler={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("btn-open-license-modal"));
    fireEvent.click(screen.getByTestId("btn-submit-issue-license"));

    await waitFor(() => {
      expect(mockIssue).toHaveBeenCalled();
      expect(screen.getByTestId("serial-issued-success-box")).toBeTruthy();
      expect(screen.getByText("TDL-149C5-86BB3-C0BF9-9278E")).toBeTruthy();
    });
  });

  it("solicita sesión JIT con motivo de soporte obligatorio", async () => {
    const mockJit = vi.fn().mockResolvedValue({
      sessionId: "01a1a249-ada0-776b-ad3a-4d0554a31ced",
      expiresAtMs: Date.now() + 1800000
    });

    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={vi.fn()}
        onSuspendTenant={vi.fn()}
        onReactivateTenant={vi.fn()}
        onGrantGraceExtension={vi.fn()}
        onIssueLocalLicense={vi.fn()}
        onRequestJitSupport={mockJit}
        onRunDunningScheduler={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("btn-jit-tenant-001"));
    fireEvent.change(screen.getByTestId("input-jit-reason"), {
      target: { value: "Resolución de discrepancia de inventario ticket #4102" }
    });
    fireEvent.click(screen.getByTestId("btn-submit-jit-session"));

    await waitFor(() => {
      expect(mockJit).toHaveBeenCalledWith(
        "tenant-001",
        "Resolución de discrepancia de inventario ticket #4102"
      );
      expect(screen.getByTestId("jit-success-box")).toBeTruthy();
    });
  });

  it("permite suspender, reactivar y conceder prórroga de 7 días", async () => {
    const mockSuspend = vi.fn().mockResolvedValue(undefined);
    const mockReactivate = vi.fn().mockResolvedValue(undefined);
    const mockGrace = vi.fn().mockResolvedValue(undefined);

    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={vi.fn()}
        onSuspendTenant={mockSuspend}
        onReactivateTenant={mockReactivate}
        onGrantGraceExtension={mockGrace}
        onIssueLocalLicense={vi.fn()}
        onRequestJitSupport={vi.fn()}
        onRunDunningScheduler={vi.fn()}
      />
    );

    // Suspender tenant-001 activo
    fireEvent.click(screen.getByTestId("btn-suspend-tenant-001"));
    expect(mockSuspend).toHaveBeenCalledWith(
      "tenant-001",
      expect.stringContaining("Suspensión administrativa")
    );

    // Reactivar tenant-003 suspendido
    fireEvent.click(screen.getByTestId("btn-reactivate-tenant-003"));
    expect(mockReactivate).toHaveBeenCalledWith("tenant-003");

    // Conceder prórroga a tenant-001
    fireEvent.click(screen.getByTestId("btn-grace-tenant-001"));
    fireEvent.change(screen.getByTestId("input-grace-reason"), {
      target: { value: "Comprobante de transferencia bancaria en validación" }
    });
    fireEvent.click(screen.getByTestId("btn-submit-grace-extension"));

    await waitFor(() => {
      expect(mockGrace).toHaveBeenCalledWith(
        "tenant-001",
        7,
        "Comprobante de transferencia bancaria en validación"
      );
    });
  });

  it("ejecuta scheduler de mora y muestra resumen en banner", async () => {
    const mockDunning = vi.fn().mockResolvedValue({
      evaluatedCount: 3,
      restrictedCount: 1,
      suspendedCount: 0
    });

    render(
      <SuperAdminScreen
        metrics={MOCK_METRICS}
        tenants={MOCK_TENANTS}
        localLicenses={MOCK_LICENSES}
        onCreateTenantSaga={vi.fn()}
        onSuspendTenant={vi.fn()}
        onReactivateTenant={vi.fn()}
        onGrantGraceExtension={vi.fn()}
        onIssueLocalLicense={vi.fn()}
        onRequestJitSupport={vi.fn()}
        onRunDunningScheduler={mockDunning}
      />
    );

    fireEvent.click(screen.getByTestId("btn-run-dunning"));

    await waitFor(() => {
      expect(mockDunning).toHaveBeenCalled();
      expect(screen.getByTestId("platform-feedback-banner")).toBeTruthy();
      expect(screen.getByText(/Scheduler de Mora ejecutado/)).toBeTruthy();
    });
  });
});
