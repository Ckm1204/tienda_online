import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// Mock lucide icons
vi.mock("lucide-react-native/icons/banknote", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/printer", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));

import {
  CustomerDebtPaymentModal,
  FiadoCustomerPaymentData,
  PaymentReceiptResult
} from "../components/CustomerDebtPaymentModal";

const MOCK_CUSTOMER: FiadoCustomerPaymentData = {
  id: "cust-101",
  name: "Don Carlos Ramírez",
  docNumber: "19.340.590",
  phone: "+57 301 234 9910",
  balanceCents: 14500000 // $145.000 COP
};

describe("CustomerDebtPaymentModal (Abonos de Cartera de Fiados)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza información del deudor y deuda pendiente actual en COP", () => {
    render(
      <CustomerDebtPaymentModal
        visible={true}
        customer={MOCK_CUSTOMER}
        storeName="Tienda La Esmeralda"
        onClose={vi.fn()}
        onConfirmPayment={vi.fn()}
      />
    );

    expect(screen.getByText("Don Carlos Ramírez")).toBeDefined();
    expect(screen.getByText(/CC: 19\.340\.590/)).toBeDefined();
    expect(screen.getAllByText(/145\.000/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("input-payment-amount")).toBeDefined();
    expect(screen.getByTestId("btn-confirm-payment")).toBeDefined();
  });

  it("los botones rápidos de preset calculan el valor exacto sin exceder la deuda", () => {
    render(
      <CustomerDebtPaymentModal
        visible={true}
        customer={MOCK_CUSTOMER}
        onClose={vi.fn()}
        onConfirmPayment={vi.fn()}
      />
    );

    const preset20k = screen.getByText("+$20.000");
    fireEvent.click(preset20k);

    const input = screen.getByTestId("input-payment-amount") as HTMLInputElement;
    expect(input.value).toBe("20.000");

    // Probar pagar todo
    const payAllBtn = screen.getByText(/Pagar Todo/);
    fireEvent.click(payAllBtn);
    expect(input.value).toBe("145.000");
  });

  it("valida que el valor no supere el saldo pendiente ni sea cero", () => {
    render(
      <CustomerDebtPaymentModal
        visible={true}
        customer={MOCK_CUSTOMER}
        onClose={vi.fn()}
        onConfirmPayment={vi.fn()}
      />
    );

    const input = screen.getByTestId("input-payment-amount");
    // Ingresar monto mayor a 145.000 COP
    fireEvent.change(input, { target: { value: "200000" } });

    expect(screen.getByText(/El monto supera la deuda actual/)).toBeDefined();
    const confirmBtn = screen.getByTestId("btn-confirm-payment");
    expect(confirmBtn.getAttribute("aria-disabled") || confirmBtn.hasAttribute("disabled")).toBeTruthy();
  });

  it("procesa abono exitoso y muestra vista de tiquete térmico con comprobante REC y Ley 1581", async () => {
    const handleConfirm = vi.fn().mockResolvedValue({
      receiptNumber: "REC-2026-08421",
      customerId: MOCK_CUSTOMER.id,
      customerName: MOCK_CUSTOMER.name,
      previousBalanceCents: 14500000,
      amountPaidCents: 5000000,
      newBalanceCents: 9500000,
      method: "NEQUI",
      reference: "NEQ-TRX-1234",
      receivedBy: "Don Pedro Pérez",
      occurredAt: "2026-11-03T12:00:00Z",
      legalNotice: "Recibo de abono a cartera expedido de conformidad con la Ley 1581 de 2012 y Art. 616 del E.T."
    } as PaymentReceiptResult);

    render(
      <CustomerDebtPaymentModal
        visible={true}
        customer={MOCK_CUSTOMER}
        onClose={vi.fn()}
        onConfirmPayment={handleConfirm}
      />
    );

    const preset50k = screen.getByText("+$50.000");
    fireEvent.click(preset50k);

    const nequiBtn = screen.getByText(/Nequi/);
    fireEvent.click(nequiBtn);

    const refInput = screen.getByTestId("input-payment-reference");
    fireEvent.change(refInput, { target: { value: "NEQ-TRX-1234" } });

    const confirmBtn = screen.getByTestId("btn-confirm-payment");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith({
        customerId: "cust-101",
        amountCents: 5000000,
        method: "NEQUI",
        reference: "NEQ-TRX-1234"
      });
    });

    expect(screen.getByTestId("payment-receipt-view")).toBeDefined();
    expect(screen.getByText("REC-2026-08421")).toBeDefined();
    expect(screen.getByText(/95\.000/)).toBeDefined(); // Nuevo saldo
    expect(screen.getByText(/Ley 1581 de 2012/)).toBeDefined();
  });
});
