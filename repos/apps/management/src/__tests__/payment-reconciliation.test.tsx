import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Mock lucide icons
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/credit-card", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/building", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/clock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));

import {
  PaymentReconciliationScreen,
  DigitalPaymentItem
} from "../components/PaymentReconciliationScreen";

describe("PaymentReconciliationScreen (Conciliación de Pagos Digitales - Épica 09 & 10)", () => {
  const samplePayments: DigitalPaymentItem[] = [
    {
      paymentId: "pay-001",
      saleId: "sale-01",
      receiptCode: "POS-000101",
      method: "NEQUI",
      amountCents: 5000000, // $50.000 COP
      reference: "M991823",
      status: "PENDING",
      reconciledBy: null,
      branchId: "branch-main",
      cashSessionId: "session-01",
      occurredAtMs: 1772500000000
    },
    {
      paymentId: "pay-002",
      saleId: "sale-02",
      receiptCode: "POS-000102",
      method: "DAVIPLATA",
      amountCents: 3500000, // $35.000 COP
      reference: "D112233",
      status: "PENDING",
      reconciledBy: null,
      branchId: "branch-main",
      cashSessionId: "session-01",
      occurredAtMs: 1772500010000
    },
    {
      paymentId: "pay-003",
      saleId: "sale-03",
      receiptCode: "POS-000103",
      method: "BRE_B",
      amountCents: 8000000, // $80.000 COP
      reference: "BRB-4455",
      status: "CONFIRMED",
      reconciledBy: "usr-owner-001",
      branchId: "branch-main",
      cashSessionId: "session-01",
      occurredAtMs: 1772500020000
    }
  ];

  afterEach(cleanup);

  it("renderiza encabezado, métricas de totales y lista de pagos digitales", () => {
    render(<PaymentReconciliationScreen initialPayments={samplePayments} />);

    expect(screen.getByTestId("reconciliation-screen")).toBeDefined();
    expect(screen.getByText("Conciliación de Pagos Digitales")).toBeDefined();

    // Verificación de totales calculados en centavos integer:
    // Pendiente: $50.000 + $35.000 = $85.000
    expect(screen.getByText(/\$85\.000 COP/)).toBeDefined();
    // Confirmado: $80.000
    expect(screen.getByText(/\$80\.000 COP/)).toBeDefined();

    // Códigos de recibo
    expect(screen.getByText("POS-000101")).toBeDefined();
    expect(screen.getByText("POS-000102")).toBeDefined();
    expect(screen.getByText("POS-000103")).toBeDefined();
  });

  it("filtra pagos por estado: Pendientes y Confirmados", async () => {
    render(<PaymentReconciliationScreen initialPayments={samplePayments} />);

    // Filtrar por 'Pendientes'
    const pendingChip = screen.getByTestId("filter-pending");
    fireEvent.click(pendingChip);

    expect(screen.getByText("POS-000101")).toBeDefined();
    expect(screen.getByText("POS-000102")).toBeDefined();
    expect(screen.queryByText("POS-000103")).toBeNull();

    // Filtrar por 'Confirmados'
    const confirmedChip = screen.getByTestId("filter-confirmed");
    fireEvent.click(confirmedChip);

    expect(screen.queryByText("POS-000101")).toBeNull();
    expect(screen.getByText("POS-000103")).toBeDefined();
  });

  it("filtra por búsqueda de texto de referencia bancaria", async () => {
    render(<PaymentReconciliationScreen initialPayments={samplePayments} />);

    const searchInput = screen.getByPlaceholderText(/Buscar por referencia/i);
    fireEvent.change(searchInput, { target: { value: "M991823" } });

    expect(screen.getByText("POS-000101")).toBeDefined();
    expect(screen.queryByText("POS-000102")).toBeNull();
    expect(screen.queryByText("POS-000103")).toBeNull();
  });

  it("ejecuta confirmación en lote de pagos seleccionados", async () => {
    const handleBatch = vi.fn().mockResolvedValue(undefined);
    render(
      <PaymentReconciliationScreen
        initialPayments={samplePayments}
        onReconcileBatch={handleBatch}
      />
    );

    // Seleccionar todos los pagos vía checkbox general
    const selectAllCheckbox = screen.getByLabelText("Seleccionar todos los pagos digitales");
    fireEvent.click(selectAllCheckbox);

    // Barra de acciones masivas visible
    expect(screen.getByTestId("batch-actions-bar")).toBeDefined();
    expect(screen.getByText("3 seleccionado(s)")).toBeDefined();

    // Confirmar en lote
    const confirmBtn = screen.getByTestId("btn-batch-confirm");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleBatch).toHaveBeenCalledWith(["pay-001", "pay-002", "pay-003"], "CONFIRMED");
    });

    expect(screen.getByTestId("reconciliation-alert")).toBeDefined();
    expect(screen.getByText(/Se confirmaron 3 pago\(s\) digital\(es\)/)).toBeDefined();
  });
});
