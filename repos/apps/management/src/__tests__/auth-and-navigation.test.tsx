import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("lucide-react-native/icons/log-in", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/key-round", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/qr-code", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/download", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/layout-dashboard", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shopping-bag", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/package", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/users", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/monitor", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/user-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/user", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/scale", () => ({ default: () => null }));

import { ManagementAuthService } from "../auth/auth-state";
import { LoginForm } from "../components/LoginForm";
import { AdaptiveNavigation, resolveVisibleNavItems } from "../components/AdaptiveNavigation";
import { OwnerActivationWizard } from "../components/OwnerActivationWizard";
import { StepUpMfaModal } from "../components/StepUpMfaModal";

describe("ÉPICA 10 — apps/management: Autenticación OIDC/MFA, Navegación y Activación (HU-097, HU-226, HU-227)", () => {
  let authService: ManagementAuthService;

  beforeEach(() => {
    authService = new ManagementAuthService("http://test-bff.local");
  });

  afterEach(cleanup);

  describe("HU-097: Inicio de sesión OIDC + MFA y Step-up MFA para acciones críticas", () => {
    it("solicita el desafío de código MFA cuando el usuario lo tiene habilitado", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/v1/auth/login")) {
          return {
            status: 401,
            ok: false,
            json: async () => ({ error: "MFA_REQUIRED", challenge: "totp" })
          };
        }
        return { status: 404, ok: false, json: async () => ({}) };
      });

      render(<LoginForm authService={authService} fetchFn={mockFetch as any} />);

      const emailInput = screen.getByTestId("input-email");
      const pwdInput = screen.getByTestId("input-password");
      const submitBtn = screen.getByTestId("btn-submit-login");

      fireEvent.change(emailInput, { target: { value: "dueno@tienda.co" } });
      fireEvent.change(pwdInput, { target: { value: "password123" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId("mfa-challenge-box")).toBeDefined();
      });
      expect(screen.getByTestId("input-mfa-code")).toBeDefined();
    });

    it("completa la sesión con el código MFA y carga el bootstrap de usuario y tienda", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.endsWith("/v1/auth/login")) {
          const body = JSON.parse(opts.body);
          if (body.mfaCode === "654321") {
            return {
              status: 200,
              ok: true,
              json: async () => ({
                accessToken: "jwt_token_abc_123",
                claims: { sub: "u1", aud: "mgmt-app", mfa_authenticated_at: Math.floor(Date.now() / 1000) }
              })
            };
          }
          return {
            status: 401,
            ok: false,
            json: async () => ({ error: "MFA_REQUIRED" })
          };
        }
        if (url.endsWith("/v1/app/bootstrap")) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              user: {
                id: "u1",
                full_name: "Don Alberto",
                email: "dueno@tienda.co",
                role_code: "OWNER",
                permissions: ["catalog.read", "terminal.manage"]
              },
              tenant: {
                id: "t1",
                business_name: "Tienda Don Alberto",
                nit: "900111222-3",
                status: "ACTIVE",
                plan_code: "NEGOCIO"
              },
              entitlements: { max_terminals: 2, max_users: 7, features: {} },
              branches: [{ id: "b1", code: "SUC1", name: "Sede Principal", status: "ACTIVE" }]
            })
          };
        }
        return { status: 404, ok: false, json: async () => ({}) };
      });

      const onLoginSuccess = vi.fn();
      render(<LoginForm authService={authService} onSuccess={onLoginSuccess} fetchFn={mockFetch as any} />);

      fireEvent.change(screen.getByTestId("input-email"), { target: { value: "dueno@tienda.co" } });
      fireEvent.change(screen.getByTestId("input-password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByTestId("btn-submit-login"));

      // Desafío MFA
      await waitFor(() => {
        expect(screen.getByTestId("input-mfa-code")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("input-mfa-code"), { target: { value: "654321" } });
      fireEvent.click(screen.getByTestId("btn-submit-login"));

      await waitFor(() => {
        expect(onLoginSuccess).toHaveBeenCalledTimes(1);
      });

      const session = authService.getSession();
      expect(session).not.toBeNull();
      expect(session?.user.fullName).toBe("Don Alberto");
      expect(session?.tenant?.businessName).toBe("Tienda Don Alberto");
      expect(authService.hasRecentMfa()).toBe(true);
    });

    it("StepUpMfaModal exige código de 6 dígitos para autorizar acción crítica", async () => {
      const onConfirm = vi.fn().mockResolvedValue(true);
      const onCancel = vi.fn();

      render(
        <StepUpMfaModal
          visible={true}
          actionTitle="Revocar CAJA-01"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText("Revocar CAJA-01")).toBeDefined();
      const mfaInput = screen.getByTestId("step-up-mfa-input");
      const confirmBtn = screen.getByTestId("step-up-confirm");

      // Intento con código incompleto
      fireEvent.change(mfaInput, { target: { value: "123" } });
      fireEvent.click(confirmBtn);
      expect(screen.getByText("El código debe tener 6 dígitos numéricos.")).toBeDefined();
      expect(onConfirm).not.toHaveBeenCalled();

      // Código de 6 dígitos válido
      fireEvent.change(mfaInput, { target: { value: "987654" } });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith("987654");
      });
    });
  });

  describe("HU-226: Navegación adaptativa filtrada por permisos y responsiva", () => {
    it("rol ACCOUNTANT solo ve Reportes/Dashboard y Mi Perfil, ocultando Catálogo, Inventario, Cajas y Usuarios", () => {
      const accountantUser = {
        id: "acc-1",
        fullName: "Contador Pedro",
        email: "contador@tienda.co",
        roleCode: "ACCOUNTANT" as const,
        permissions: ["reports.read"]
      };

      const visibleItems = resolveVisibleNavItems(accountantUser);
      const itemIds = visibleItems.map((i) => i.id);

      expect(itemIds).toContain("dashboard");
      expect(itemIds).toContain("profile");
      expect(itemIds).not.toContain("catalog");
      expect(itemIds).not.toContain("inventory");
      expect(itemIds).not.toContain("customers");
      expect(itemIds).not.toContain("terminals");
      expect(itemIds).not.toContain("users");
    });

    it("rol OWNER tiene acceso a todas las secciones de administración", () => {
      const ownerUser = {
        id: "owner-1",
        fullName: "Dueño Alberto",
        email: "alberto@tienda.co",
        roleCode: "OWNER" as const,
        permissions: ["reports.read", "catalog.read", "terminal.read"]
      };

      const visibleItems = resolveVisibleNavItems(ownerUser);
      const itemIds = visibleItems.map((i) => i.id);

      expect(itemIds).toEqual([
        "dashboard",
        "catalog",
        "inventory",
        "customers",
        "terminals",
        "users",
        "fiscal",
        "profile"
      ]);
    });

    it("renderiza navegación para el dueño permitiendo cambiar de pestaña", () => {
      const ownerUser = {
        id: "owner-1",
        fullName: "Dueño Alberto",
        email: "alberto@tienda.co",
        roleCode: "OWNER" as const,
        permissions: []
      };

      const onSelect = vi.fn();
      render(
        <AdaptiveNavigation user={ownerUser} activeSection="dashboard" onSelectSection={onSelect}>
          <div>Contenido de prueba</div>
        </AdaptiveNavigation>
      );

      const catalogTab = screen.getByTestId("nav-item-catalog");
      fireEvent.click(catalogTab);
      expect(onSelect).toHaveBeenCalledWith("catalog");
    });
  });

  describe("HU-227: Pantalla de Activación Inicial del Dueño", () => {
    it("asistente de 4 pasos valida contraseña, TOTP, rechaza PIN trivial, valida términos y muestra QR final", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          activated: true,
          downloadUrl: "https://dl.tienditaonline.co/installers/TienditaOnline-Setup-x64.exe",
          terminalCode: "CAJA-01",
          terminalEnrollmentQr: "tiendita://enroll?tenant=t1&terminal=term-01"
        })
      });

      const onActivated = vi.fn();
      render(
        <OwnerActivationWizard
          activationToken="token_secret_123"
          onActivated={onActivated}
          fetchFn={mockFetch as any}
        />
      );

      // Paso 1: Contraseña
      expect(screen.getByTestId("step-1")).toBeDefined();
      const pwdInput = screen.getByLabelText("Contraseña");
      fireEvent.change(pwdInput, { target: { value: "clave123" } });
      fireEvent.click(screen.getByTestId("btn-next-step-1"));

      // Paso 2: TOTP
      await waitFor(() => {
        expect(screen.getByTestId("step-2")).toBeDefined();
      });
      const totpInput = screen.getByLabelText("Código TOTP");
      fireEvent.change(totpInput, { target: { value: "123456" } });
      fireEvent.click(screen.getByTestId("btn-next-step-2"));

      // Paso 3: PIN (probar rechazo de PIN trivial "1234")
      await waitFor(() => {
        expect(screen.getByTestId("step-3")).toBeDefined();
      });
      const pinInput = screen.getByLabelText("PIN de caja");
      fireEvent.change(pinInput, { target: { value: "1234" } });
      fireEvent.click(screen.getByTestId("btn-next-step-3"));

      expect(screen.getByText("El PIN no puede ser trivial (ej. 1234, 0000 o fechas obvias).")).toBeDefined();

      // PIN seguro no trivial
      fireEvent.change(pinInput, { target: { value: "8520" } });
      fireEvent.click(screen.getByTestId("btn-next-step-3"));

      // Paso 4: Términos y Habeas Data
      await waitFor(() => {
        expect(screen.getByTestId("step-4")).toBeDefined();
      });
      const finishBtn = screen.getByTestId("btn-finish-activation");

      // Intento sin marcar términos
      fireEvent.click(finishBtn);
      expect(screen.getByText("Debes aceptar los términos del servicio y política de datos.")).toBeDefined();

      // Aceptar términos y finalizar
      fireEvent.click(screen.getByTestId("checkbox-accept-terms"));
      fireEvent.click(finishBtn);

      // Paso 5: Pantalla de finalización con link de descarga y QR de CAJA-01
      await waitFor(() => {
        expect(screen.getByTestId("step-completed")).toBeDefined();
      });

      expect(screen.getByText("Descargar TienditaOnline Caja para Windows")).toBeDefined();
      expect(screen.getByText(/Enrolar tu primera caja \(CAJA-01\)/)).toBeDefined();
      expect(onActivated).toHaveBeenCalledTimes(1);
    });
  });
});
