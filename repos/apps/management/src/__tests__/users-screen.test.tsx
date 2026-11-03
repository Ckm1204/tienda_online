import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Mock lucide icons
vi.mock("lucide-react-native/icons/user-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/user-plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/lock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/lock-open", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/key-round", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));

import { UsersScreen, EmployeeItem } from "../components/UsersScreen";

const MOCK_EMPLOYEES: EmployeeItem[] = [
  {
    id: "emp-01",
    fullName: "Don Pedro Pérez",
    email: "pedro@tiendita.co",
    phone: "+573001112233",
    role: "OWNER",
    pinSet: true,
    isLocked: false
  },
  {
    id: "emp-02",
    fullName: "Brayan Stiven Peña",
    email: "brayan@tiendita.co",
    phone: "+573104445566",
    role: "CASHIER",
    pinSet: true,
    isLocked: false
  },
  {
    id: "emp-03",
    fullName: "Yurany Andrea Silva",
    email: "yurany@tiendita.co",
    phone: "+573207778899",
    role: "STORE_MANAGER",
    pinSet: false,
    isLocked: true
  }
];

describe("UsersScreen (Empleados, Cajeros y Seguridad de PIN)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza lista de empleados con badges de rol y estado de PIN", () => {
    render(
      <UsersScreen
        employees={MOCK_EMPLOYEES}
        onCreateEmployee={vi.fn()}
        onToggleLock={vi.fn()}
        onResetPin={vi.fn()}
      />
    );

    expect(screen.getByText("Don Pedro Pérez")).toBeDefined();
    expect(screen.getByText("Brayan Stiven Peña")).toBeDefined();
    expect(screen.getByText("Yurany Andrea Silva")).toBeDefined();
    expect(screen.getByText("OWNER")).toBeDefined();
    expect(screen.getByText("CASHIER")).toBeDefined();
    expect(screen.getByText("STORE_MANAGER")).toBeDefined();
    expect(screen.getByText("Sin PIN para operar en caja")).toBeDefined();
  });

  it("permite bloquear o desbloquear un empleado", async () => {
    const handleToggle = vi.fn().mockResolvedValue(undefined);

    render(
      <UsersScreen
        employees={MOCK_EMPLOYEES}
        onCreateEmployee={vi.fn()}
        onToggleLock={handleToggle}
        onResetPin={vi.fn()}
      />
    );

    const lockBtn = screen.getByTestId("btn-toggle-lock-emp-01");
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(handleToggle).toHaveBeenCalledWith("emp-01");
    });
  });

  it("detecta PIN débil (1234) en el formulario de creación y lo bloquea", async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <UsersScreen
        employees={MOCK_EMPLOYEES}
        onCreateEmployee={handleCreate}
        onToggleLock={vi.fn()}
        onResetPin={vi.fn()}
      />
    );

    // Abrir modal
    const openBtn = screen.getByTestId("btn-create-user");
    fireEvent.click(openBtn);

    const nameInput = screen.getByTestId("input-employee-name");
    fireEvent.change(nameInput, { target: { value: "Carlos Cajero" } });

    const pinInput = screen.getByTestId("input-employee-pin");
    fireEvent.change(pinInput, { target: { value: "1234" } }); // PIN Débil

    expect(screen.getByText(/PIN débil detectado/)).toBeDefined();

    const saveBtn = screen.getByTestId("btn-save-user");
    expect(saveBtn.getAttribute("aria-disabled") || saveBtn.hasAttribute("disabled")).toBeTruthy();
  });

  it("crea un empleado con PIN seguro de 4 dígitos (8520) y rol de Administrador", async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <UsersScreen
        employees={MOCK_EMPLOYEES}
        onCreateEmployee={handleCreate}
        onToggleLock={vi.fn()}
        onResetPin={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("btn-create-user"));

    fireEvent.change(screen.getByTestId("input-employee-name"), { target: { value: "Gloria Amparo" } });
    fireEvent.change(screen.getByTestId("input-employee-email"), { target: { value: "gloria@tiendita.co" } });

    // Seleccionar Administrador
    fireEvent.click(screen.getByText("Administrador"));

    // Ingresar PIN válido
    fireEvent.change(screen.getByTestId("input-employee-pin"), { target: { value: "8520" } });

    fireEvent.click(screen.getByTestId("btn-save-user"));

    await waitFor(() => {
      expect(handleCreate).toHaveBeenCalledWith({
        fullName: "Gloria Amparo",
        email: "gloria@tiendita.co",
        phone: "",
        role: "STORE_MANAGER",
        initialPin: "8520"
      });
    });
  });

  it("actualiza el PIN de un empleado desde el modal de reseteo", async () => {
    const handleReset = vi.fn().mockResolvedValue(undefined);

    render(
      <UsersScreen
        employees={MOCK_EMPLOYEES}
        onCreateEmployee={vi.fn()}
        onToggleLock={vi.fn()}
        onResetPin={handleReset}
      />
    );

    const configPinBtn = screen.getByText("Configurar PIN");
    fireEvent.click(configPinBtn);

    const resetPinInput = screen.getByTestId("input-reset-pin");
    fireEvent.change(resetPinInput, { target: { value: "9630" } });

    fireEvent.click(screen.getByTestId("btn-confirm-reset-pin"));

    await waitFor(() => {
      expect(handleReset).toHaveBeenCalledWith("emp-03", "9630");
    });
  });
});
