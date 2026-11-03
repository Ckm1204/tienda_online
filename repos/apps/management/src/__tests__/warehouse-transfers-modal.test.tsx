import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Mock lucide icons
vi.mock("lucide-react-native/icons/truck", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-right-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/package-plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/package-minus", () => ({ default: () => null }));

import {
  WarehouseTransfersModal,
  WarehouseTransferItem
} from "../components/WarehouseTransfersModal";

describe("WarehouseTransfersModal (Traslados y Mermas de Inventario - HU-090, HU-092)", () => {
  const sampleTransfers: WarehouseTransferItem[] = [
    {
      id: "tr-001",
      fromWarehouseId: "wh-main",
      toWarehouseId: "wh-sucursal-norte",
      productId: "prod-001",
      productName: "Arroz Diana 1kg",
      sentQtyMilli: 20000, // 20 unidades
      receivedQtyMilli: null,
      status: "IN_TRANSIT",
      diffNote: null
    }
  ];

  afterEach(cleanup);

  it("permite despachar un nuevo traslado entre bodegas distintas", async () => {
    const handleDispatch = vi.fn().mockResolvedValue(undefined);
    render(
      <WarehouseTransfersModal
        isOpen={true}
        onClose={() => {}}
        transfers={sampleTransfers}
        onDispatchTransfer={handleDispatch}
      />
    );

    expect(screen.getByTestId("warehouse-transfers-dialog")).toBeDefined();
    expect(screen.getByText("Traslados y Mermas de Inventario")).toBeDefined();

    // Cambiar cantidad
    const qtyInput = screen.getByTestId("input-transfer-qty");
    fireEvent.change(qtyInput, { target: { value: "15" } });

    // Despachar traslado
    const dispatchBtn = screen.getByTestId("btn-dispatch-transfer");
    fireEvent.click(dispatchBtn);

    await waitFor(() => {
      expect(handleDispatch).toHaveBeenCalledWith({
        fromWarehouseId: "wh-main",
        toWarehouseId: "wh-sucursal-norte",
        productId: "prod-001",
        qtyMilli: 15000
      });
    });

    expect(screen.getByTestId("transfer-success-banner")).toBeDefined();
    expect(screen.getByText(/Traslado de 15 unidades despachado/)).toBeDefined();
  });

  it("permite recibir un traslado en destino con nota de diferencia", async () => {
    const handleReceive = vi.fn().mockResolvedValue(undefined);
    render(
      <WarehouseTransfersModal
        isOpen={true}
        onClose={() => {}}
        transfers={sampleTransfers}
        onReceiveTransfer={handleReceive}
      />
    );

    // Navegar a pestaña 'En Tránsito'
    const inTransitTab = screen.getByTestId("tab-in-transit");
    fireEvent.click(inTransitTab);

    expect(screen.getByText(/#tr-001: wh-main ➔ wh-sucursal-norte/)).toBeDefined();

    // Click en recibir traslado
    const receiveBtn = screen.getByTestId("btn-receive-tr-001");
    fireEvent.click(receiveBtn);

    // Formulario de recepción desplegado
    expect(screen.getByText(/Confirmar Recepción de Traslado #tr-001/)).toBeDefined();

    // Modificar cantidad recibida a 19 un (hay diferencia con 20 un enviadas)
    const recInput = screen.getByTestId("input-received-qty");
    fireEvent.change(recInput, { target: { value: "19" } });

    // Llenar justificación obligatoria
    const diffInput = screen.getByTestId("input-diff-note");
    fireEvent.change(diffInput, { target: { value: "1 paquete llegó roto y se descartó" } });

    // Confirmar entrada
    const confirmReceiveBtn = screen.getByTestId("btn-confirm-receive");
    fireEvent.click(confirmReceiveBtn);

    await waitFor(() => {
      expect(handleReceive).toHaveBeenCalledWith({
        transferId: "tr-001",
        receivedQtyMilli: 19000,
        diffNote: "1 paquete llegó roto y se descartó"
      });
    });

    expect(screen.getByTestId("transfer-success-banner")).toBeDefined();
  });

  it("permite registrar un ajuste de avería/merma con motivo legal obligatorio", async () => {
    const handleAdjustment = vi.fn().mockResolvedValue(undefined);
    render(
      <WarehouseTransfersModal
        isOpen={true}
        onClose={() => {}}
        transfers={sampleTransfers}
        onRecordAdjustment={handleAdjustment}
      />
    );

    // Navegar a pestaña 'Averías y Mermas'
    const adjTab = screen.getByTestId("tab-adjustment");
    fireEvent.click(adjTab);

    expect(screen.getByText(/Baja legal de inventario por deterioro/)).toBeDefined();

    // Intentar registrar sin motivo debe mostrar error
    const recordBtn = screen.getByTestId("btn-record-adjustment");
    fireEvent.click(recordBtn);

    expect(screen.getByTestId("transfer-error-banner")).toBeDefined();
    expect(screen.getByText(/motivo o justificación de la merma\/avería es obligatorio/i)).toBeDefined();

    // Llenar motivo y cantidad
    const reasonInput = screen.getByTestId("input-adj-reason");
    fireEvent.change(reasonInput, { target: { value: "Paquete de arroz roto por humedad en estiba" } });

    const qtyInput = screen.getByTestId("input-adj-qty");
    fireEvent.change(qtyInput, { target: { value: "3" } });

    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(handleAdjustment).toHaveBeenCalledWith({
        warehouseId: "wh-main",
        productId: "prod-001",
        kind: "ADJUSTMENT_DAMAGED",
        deltaMilli: -3000,
        reason: "Paquete de arroz roto por humedad en estiba"
      });
    });

    expect(screen.getByTestId("transfer-success-banner")).toBeDefined();
    expect(screen.getByText(/Ajuste de inventario \(-3 unidades\) registrado en Kardex/)).toBeDefined();
  });
});
