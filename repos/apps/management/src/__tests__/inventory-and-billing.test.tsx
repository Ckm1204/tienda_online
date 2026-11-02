import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mocks para lucide icons
vi.mock("lucide-react-native/icons/camera", () => ({ default: () => <span data-testid="icon-camera" /> }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => <span data-testid="icon-alert" /> }));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: () => <span data-testid="icon-alert-circle" /> }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => <span data-testid="icon-check" /> }));
vi.mock("lucide-react-native/icons/trash", () => ({ default: () => <span data-testid="icon-trash" /> }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => <span data-testid="icon-shield" /> }));
vi.mock("lucide-react-native/icons/credit-card", () => ({ default: () => <span data-testid="icon-card" /> }));
vi.mock("lucide-react-native/icons/download", () => ({ default: () => <span data-testid="icon-download" /> }));

import {
  InventoryAdjustmentsScreen,
  type InventoryItemRow
} from "../components/InventoryAdjustmentsScreen.js";
import {
  SubscriptionBillingScreen,
  type QuotaItem,
  type InvoiceItem
} from "../components/SubscriptionBillingScreen.js";

describe("Inventario, Conteo y Facturación en App de Gestión", () => {
  afterEach(() => {
    cleanup();
  });

  describe("HU-234 & HU-328: InventoryAdjustmentsScreen", () => {
    const mockItems: InventoryItemRow[] = [
      {
        productId: "prod-1",
        name: "Atún Van Camps",
        barcode: "7702001001",
        unitCostCents: 400000,
        systemQtyMilli: 10000, // 10 unidades en sistema
        countedQtyMilli: 8000 // 8 unidades contadas (-2 unidades)
      }
    ];

    it("permite seleccionar motivo y modificar cantidades contadas", () => {
      const onConfirm = vi.fn();
      render(
        <InventoryAdjustmentsScreen
          initialItems={mockItems}
          onConfirmAdjustment={onConfirm}
        />
      );

      // Cambiar motivo a MERMA
      fireEvent.click(screen.getByTestId("tab-reason-merma"));

      // Cambiar cantidad contada a 7
      const countInput = screen.getByTestId("input-count-prod-1");
      fireEvent.change(countInput, { target: { value: "7" } });

      // Confirmar ajuste
      fireEvent.click(screen.getByTestId("btn-confirm-adjustment"));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith("MERMA", [
        expect.objectContaining({
          productId: "prod-1",
          countedQtyMilli: 7000
        })
      ]);
    });

    it("activa escáner continuo (modo ráfaga) y acumula lecturas (HU-328)", () => {
      render(
        <InventoryAdjustmentsScreen
          initialItems={mockItems}
          onConfirmAdjustment={vi.fn()}
        />
      );

      // Activar escáner continuo
      fireEvent.click(screen.getByTestId("btn-toggle-continuous-scan"));
      expect(screen.getByTestId("input-continuous-scanner")).toBeDefined();

      // Escanear mismo código de barras del producto (7702001001)
      fireEvent.change(screen.getByTestId("input-continuous-scanner"), {
        target: { value: "7702001001" }
      });
      fireEvent.click(screen.getByTestId("btn-submit-scan"));

      // La cantidad contada sube +1 (de 8 a 9)
      const countInput = screen.getByTestId("input-count-prod-1") as HTMLInputElement;
      expect(countInput.value).toBe("9");
    });
  });

  describe("HU-237: SubscriptionBillingScreen", () => {
    const mockQuotas: QuotaItem[] = [
      { label: "Cajas registradoras", used: 1, max: 1, unit: "cajas" },
      { label: "Usuarios / Empleados", used: 2, max: 3, unit: "usuarios" },
      { label: "Productos en catálogo", used: 840, max: 3000, unit: "productos" }
    ];

    const mockInvoices: InvoiceItem[] = [
      {
        id: "inv-01",
        reference: "FACT-2026-10",
        period: "Octubre 2026",
        amountCents: 3490000,
        status: "OVERDUE",
        dueDate: "2026-10-25"
      },
      {
        id: "inv-02",
        reference: "FACT-2026-09",
        period: "Septiembre 2026",
        amountCents: 3490000,
        status: "PAID",
        dueDate: "2026-09-25"
      }
    ];

    it("muestra banner de mora en estado RESTRICTED con botón para pagar de inmediato", () => {
      const onPay = vi.fn();
      const onChangePlan = vi.fn();

      render(
        <SubscriptionBillingScreen
          planName="Tienda Emprendedor"
          planCode="PLAN_SINGLE_STORE"
          status="RESTRICTED"
          monthlyPriceCents={3490000}
          quotas={mockQuotas}
          invoices={mockInvoices}
          onPayInvoice={onPay}
          onChangePlan={onChangePlan}
        />
      );

      // Banner de mora D+8 visible
      expect(screen.getByTestId("restricted-billing-banner")).toBeDefined();

      // Clic en botón Pagar ahora
      fireEvent.click(screen.getByTestId("btn-pay-restricted"));
      expect(onPay).toHaveBeenCalledWith("inv-01");
    });

    it("muestra cuotas de uso y estado activo normalmente", () => {
      render(
        <SubscriptionBillingScreen
          planName="Tienda PRO"
          planCode="PLAN_PRO"
          status="ACTIVE"
          monthlyPriceCents={6990000}
          quotas={mockQuotas}
          invoices={mockInvoices}
          onPayInvoice={vi.fn()}
          onChangePlan={vi.fn()}
        />
      );

      expect(screen.queryByTestId("restricted-billing-banner")).toBeNull();
      expect(screen.getByTestId("quota-row-0")).toBeDefined();
      expect(screen.getByText("840 de 3000 productos (28%)")).toBeDefined();
    });
  });
});
