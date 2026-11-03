import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Mock lucide icons
vi.mock("lucide-react-native/icons/monitor", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/qr-code", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/printer", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/scale", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check-circle-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/radio", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/lock-open", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/zap", () => ({ default: () => null }));

import { TerminalsScreen, TerminalItem } from "../components/TerminalsScreen";

const MOCK_TERMINALS: TerminalItem[] = [
  {
    id: "term-01",
    code: "CAJA-01",
    name: "Caja Principal Entrada",
    status: "ONLINE",
    lastSync: "Hace 10 seg",
    receiptPrefix: "B01",
    branchName: "Sucursal Centro"
  },
  {
    id: "term-02",
    code: "CAJA-02",
    name: "Caja Pasillo Lácteos",
    status: "OFFLINE",
    lastSync: "Hace 25 min",
    receiptPrefix: "B02",
    branchName: "Sucursal Centro"
  }
];

describe("TerminalsScreen (Cajas POS y Hardware de Periféricos)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza métricas globales de cajas y lista de terminales", () => {
    render(
      <TerminalsScreen
        terminals={MOCK_TERMINALS}
        onGenerateEnrollment={vi.fn()}
        onRevokeTerminal={vi.fn()}
      />
    );

    expect(screen.getByText("CAJA-01")).toBeDefined();
    expect(screen.getByText("CAJA-02")).toBeDefined();
    expect(screen.getByText("Prefijo: B01")).toBeDefined();
    expect(screen.getByText("Caja Principal Entrada")).toBeDefined();
    expect(screen.getByText("En Línea (Sync Activo)")).toBeDefined();
  });

  it("genera nuevo código de enrolamiento de 15 minutos y muestra instrucciones", async () => {
    const handleGen = vi.fn().mockResolvedValue("ENR-A1B2-C3D4");

    render(
      <TerminalsScreen
        terminals={MOCK_TERMINALS}
        onGenerateEnrollment={handleGen}
        onRevokeTerminal={vi.fn()}
      />
    );

    const btnEnroll = screen.getByTestId("btn-new-enrollment");
    fireEvent.click(btnEnroll);

    await waitFor(() => {
      expect(handleGen).toHaveBeenCalled();
    });

    expect(screen.getByTestId("qr-enrollment-card")).toBeDefined();
    expect(screen.getByText("ENR-A1B2-C3D4")).toBeDefined();
    expect(screen.getByText(/Token de un solo uso válido por 15 minutos/)).toBeDefined();
  });

  it("despliega telemetría de periféricos (impresora, balanza, cajón) y ejecuta prueba de impresión", async () => {
    const handlePrint = vi.fn().mockResolvedValue({
      success: true,
      message: "Ticket de prueba ESC/POS emitido con éxito."
    });

    render(
      <TerminalsScreen
        terminals={MOCK_TERMINALS}
        onGenerateEnrollment={vi.fn()}
        onRevokeTerminal={vi.fn()}
        onTestPrint={handlePrint}
      />
    );

    // Abrir diagnóstico de CAJA-01
    const toggleBtns = screen.getAllByText(/Periféricos & Salud/);
    fireEvent.click(toggleBtns[0]!);

    expect(screen.getByTestId("diag-panel-term-01")).toBeDefined();
    expect(screen.getByText("Impresora Térmica 80mm")).toBeDefined();
    expect(screen.getByText("Balanza Electrónica")).toBeDefined();
    expect(screen.getByText("Cajón Monedero RJ-11")).toBeDefined();

    // Ejecutar ticket de prueba
    const printBtn = screen.getByText("Ticket de Prueba");
    fireEvent.click(printBtn);

    await waitFor(() => {
      expect(handlePrint).toHaveBeenCalledWith("term-01");
    });
    expect(screen.getByText(/Ticket de prueba ESC\/POS emitido/)).toBeDefined();
  });

  it("permite revocar terminal", async () => {
    const handleRevoke = vi.fn().mockResolvedValue(undefined);

    render(
      <TerminalsScreen
        terminals={MOCK_TERMINALS}
        onGenerateEnrollment={vi.fn()}
        onRevokeTerminal={handleRevoke}
      />
    );

    const revokeBtns = screen.getAllByText("Revocar");
    fireEvent.click(revokeBtns[0]!);

    await waitFor(() => {
      expect(handleRevoke).toHaveBeenCalledWith("term-01");
    });
  });
});
