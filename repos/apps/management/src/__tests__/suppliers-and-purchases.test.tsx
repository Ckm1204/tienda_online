import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  SuppliersAndPurchasesScreen,
  type SupplierItem,
  type SuggestedOrderCard,
  type CashSessionOption
} from "../components/SuppliersAndPurchasesScreen";

// Mock lucide icons
vi.mock("lucide-react-native/icons/truck", () => ({ default: () => <span data-testid="icon-truck" /> }));
vi.mock("lucide-react-native/icons/package", () => ({ default: () => <span data-testid="icon-package" /> }));
vi.mock("lucide-react-native/icons/message-circle", () => ({ default: () => <span data-testid="icon-message" /> }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => <span data-testid="icon-plus" /> }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => <span data-testid="icon-check" /> }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => <span data-testid="icon-alert" /> }));
vi.mock("lucide-react-native/icons/circle-dollar-sign", () => ({ default: () => <span data-testid="icon-dollar" /> }));
vi.mock("lucide-react-native/icons/calendar", () => ({ default: () => <span data-testid="icon-calendar" /> }));

describe("SuppliersAndPurchasesScreen (HU-089, HU-191, HU-304 & HU-356)", () => {
  afterEach(cleanup);

  const mockSuppliers: SupplierItem[] = [
    {
      id: "sup-bavaria",
      name: "Cervecería Bavaria",
      phone: "3101234567",
      visitDays: [1, 3, 5],
      productIds: ["prod-poker-330", "prod-aguila-330"]
    }
  ];

  const mockSuggestedOrders: SuggestedOrderCard[] = [
    {
      supplierId: "sup-bavaria",
      supplierName: "Cervecería Bavaria",
      supplierPhone: "3101234567",
      visitDays: [1, 3, 5],
      items: [
        {
          productId: "prod-poker-330",
          productName: "Cerveza Poker Lata 330ml",
          onHandMilli: 4000,
          minStockMilli: 24000,
          idealStockMilli: 48000,
          suggestedQtyMilli: 44000,
          avgCostCents: 240000,
          estimatedLineCostCents: 10560000
        }
      ],
      totalEstimatedCostCents: 10560000,
      whatsappOrderText: "Hola Cervecería Bavaria, pedido sugerido de Tiendita:\n- Ítem prod-poker-330: 44 und\nTotal estimado: $105.600 COP"
    }
  ];

  const mockCashSessions: CashSessionOption[] = [
    {
      id: "sess-caja-01",
      terminalCode: "CAJA-01",
      cashierName: "Carlos Cajero",
      expectedCashCents: 35000000 // $350.000 COP
    }
  ];

  it("renderiza listado de proveedores y enlace directo a WhatsApp", () => {
    render(
      <SuppliersAndPurchasesScreen
        suppliers={mockSuppliers}
        suggestedOrders={mockSuggestedOrders}
        cashSessions={mockCashSessions}
      />
    );

    expect(screen.getByText("Cervecería Bavaria")).toBeDefined();
    const waLink = screen.getByTestId("link-whatsapp-sup-bavaria") as HTMLAnchorElement;
    expect(waLink.getAttribute("href")).toContain("https://wa.me/573101234567");
    expect(screen.getByText("Lun")).toBeDefined();
    expect(screen.getByText("Mié")).toBeDefined();
    expect(screen.getByText("Vie")).toBeDefined();
  });

  it("abre modal de nuevo proveedor y dispara onCreateSupplier al guardar", async () => {
    const handleCreate = vi.fn();

    render(
      <SuppliersAndPurchasesScreen
        suppliers={mockSuppliers}
        suggestedOrders={mockSuggestedOrders}
        cashSessions={mockCashSessions}
        onCreateSupplier={handleCreate}
      />
    );

    fireEvent.click(screen.getByTestId("btn-open-new-supplier"));
    expect(screen.getByTestId("modal-new-supplier")).toBeDefined();

    fireEvent.change(screen.getByTestId("input-supplier-name"), { target: { value: "Distribuidora Postobón" } });
    fireEvent.change(screen.getByTestId("input-supplier-phone"), { target: { value: "3119876543" } });

    // Alternar días de visita
    fireEvent.click(screen.getByTestId("btn-day-2")); // Agregar Martes

    fireEvent.click(screen.getByTestId("btn-save-supplier"));

    expect(handleCreate).toHaveBeenCalledTimes(1);
    expect(handleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Distribuidora Postobón",
        phone: "3119876543"
      })
    );
  });

  it("cambia a pestaña de pedidos sugeridos y permite cargar orden en la recepción", () => {
    render(
      <SuppliersAndPurchasesScreen
        suppliers={mockSuppliers}
        suggestedOrders={mockSuggestedOrders}
        cashSessions={mockCashSessions}
      />
    );

    fireEvent.click(screen.getByTestId("tab-suggested-orders"));
    expect(screen.getByTestId("suggested-card-sup-bavaria")).toBeDefined();
    expect(screen.getByText("Cerveza Poker Lata 330ml")).toBeDefined();
    expect(screen.getByText("+44 und")).toBeDefined();

    // Cargar en recepción de mercancía
    fireEvent.click(screen.getByTestId("btn-load-receipt-sup-bavaria"));

    // Debería cambiar automáticamente a la pestaña de recepción
    expect(screen.getByTestId("select-receipt-warehouse")).toBeDefined();
    expect(screen.getByTestId("receipt-line-0")).toBeDefined();
    expect(screen.getByText("Cerveza Poker Lata 330ml")).toBeDefined();
  });

  it("recalcula costo promedio ponderado en vivo y permite asociar egreso a turno de caja (HU-089, HU-304)", async () => {
    const handleRecord = vi.fn();

    render(
      <SuppliersAndPurchasesScreen
        suppliers={mockSuppliers}
        suggestedOrders={mockSuggestedOrders}
        cashSessions={mockCashSessions}
        onRecordReceipt={handleRecord}
      />
    );

    // Ir a pestaña de recepción
    fireEvent.click(screen.getByTestId("tab-receipt"));

    // Seleccionar turno de caja para pagar en efectivo
    const cashSelect = screen.getByTestId("select-receipt-cash-session") as HTMLSelectElement;
    fireEvent.change(cashSelect, { target: { value: "sess-caja-01" } });
    expect(cashSelect.value).toBe("sess-caja-01");

    // Verificar línea inicial
    // Producto inicial: 10 und en stock a $2.400 avg_cost. Entran 20 und a $2.500.
    // Nuevo avg_cost: (10 * 2400 + 20 * 2500) / 30 = (24000 + 50000) / 30 = 74000 / 30 = $2.467 COP
    const newAvgCostText = screen.getByTestId("text-new-avg-cost-0");
    expect(newAvgCostText.textContent).toContain("$2.467 COP");

    // Modificar cantidad a 10 und
    // Nuevo avg_cost con 10 und a $2.500: (10 * 2400 + 10 * 2500) / 20 = 49000 / 20 = $2.450 COP
    fireEvent.change(screen.getByTestId("input-receipt-qty-0"), { target: { value: "10" } });
    expect(screen.getByTestId("text-new-avg-cost-0").textContent).toContain("$2.450 COP");

    // Asignar fecha de vencimiento
    fireEvent.change(screen.getByTestId("input-receipt-expiry-0"), { target: { value: "2026-12-31" } });

    // Confirmar recepción
    fireEvent.click(screen.getByTestId("btn-confirm-receipt"));

    expect(handleRecord).toHaveBeenCalledTimes(1);
    expect(handleRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: "wh-main",
        paidFromCashSessionId: "sess-caja-01",
        lines: [
          expect.objectContaining({
            productId: "prod-pan-tajado",
            qtyMilli: 10000,
            unitCostCents: 250000,
            batchExpiryDate: "2026-12-31"
          })
        ]
      })
    );
  });
});
