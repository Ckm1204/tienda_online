import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mocks para lucide icons
vi.mock("lucide-react-native/icons/sparkles", () => ({ default: () => <span data-testid="icon-sparkles" /> }));
vi.mock("lucide-react-native/icons/file-spreadsheet", () => ({ default: () => <span data-testid="icon-spreadsheet" /> }));
vi.mock("lucide-react-native/icons/camera", () => ({ default: () => <span data-testid="icon-camera" /> }));
vi.mock("lucide-react-native/icons/download", () => ({ default: () => <span data-testid="icon-download" /> }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => <span data-testid="icon-check" /> }));
vi.mock("lucide-react-native/icons/arrow-right", () => ({ default: () => <span data-testid="icon-arrow-right" /> }));
vi.mock("lucide-react-native/icons/calculator", () => ({ default: () => <span data-testid="icon-calc" /> }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => <span data-testid="icon-alert" /> }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => <span data-testid="icon-plus" /> }));
vi.mock("lucide-react-native/icons/trash", () => ({ default: () => <span data-testid="icon-trash" /> }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => <span data-testid="icon-x" /> }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => <span data-testid="icon-search" /> }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => <span data-testid="icon-copy" /> }));
vi.mock("lucide-react-native/icons/printer", () => ({ default: () => <span data-testid="icon-printer" /> }));

import { InitialCatalogWizard } from "../components/InitialCatalogWizard.js";
import { ProductForm } from "../components/ProductForm.js";
import { ProductListScreen, type ProductItem } from "../components/ProductListScreen.js";

describe("Catálogo y Gestión de Productos en App de Gestión", () => {
  afterEach(() => {
    cleanup();
  });

  describe("HU-228 & HU-329: InitialCatalogWizard", () => {
    it("permite navegar entre opciones y seleccionar categorías colombianas base", () => {
      const onPreload = vi.fn();
      const onExcel = vi.fn();
      const onCamera = vi.fn();
      const onDownload = vi.fn();

      render(
        <InitialCatalogWizard
          onCompletePreload={onPreload}
          onOpenExcelUpload={onExcel}
          onOpenCameraScanner={onCamera}
          onDownloadTemplate={onDownload}
        />
      );

      // Verificar opciones iniciales
      expect(screen.getByTestId("initial-catalog-wizard")).toBeDefined();
      expect(screen.getByTestId("option-base-catalog")).toBeDefined();
      expect(screen.getByTestId("option-excel-upload")).toBeDefined();

      // Clic en descargar plantilla
      fireEvent.click(screen.getByTestId("btn-download-template"));
      expect(onDownload).toHaveBeenCalledTimes(1);

      // Entrar a selección de catálogo base
      fireEvent.click(screen.getByTestId("option-base-catalog"));
      expect(screen.getByTestId("preset-selection-view")).toBeDefined();

      // Botón pre-cargar catálogo
      const preloadBtn = screen.getByTestId("btn-preload-catalog");
      fireEvent.click(preloadBtn);
      expect(onPreload).toHaveBeenCalledTimes(1);
    });
  });

  describe("HU-230, HU-357, HU-330 & HU-422: ProductForm", () => {
    it("calcula margen en vivo y alerta sobre costo superior a precio (a pérdida)", () => {
      const onSave = vi.fn();
      const onCancel = vi.fn();

      render(
        <ProductForm
          initialData={{
            name: "Arroz Diana 1kg",
            costCents: 380000,
            basePriceCents: 450000
          }}
          onSave={onSave}
          onCancel={onCancel}
        />
      );

      // Margen inicial: (4500 - 3800) / 4500 = 15.5%
      expect(screen.getByTestId("margin-indicator")).toBeDefined();
      expect(screen.queryByTestId("loss-making-banner")).toBeNull();

      // Cambiar costo a 5000 (mayor a precio 4500)
      const costInput = screen.getByTestId("input-product-cost");
      fireEvent.change(costInput, { target: { value: "5000" } });

      // Ahora debe aparecer la alerta de pérdida
      expect(screen.getByTestId("loss-making-banner")).toBeDefined();
    });

    it("aplica cálculo de paca con redondeo a $50 COP (HU-357)", () => {
      render(
        <ProductForm
          initialData={{
            name: "Atún Van Camps",
            costCents: 0,
            basePriceCents: 0
          }}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Abrir calculadora de paca
      fireEvent.click(screen.getByTestId("btn-open-pack-calc"));
      expect(screen.getByTestId("pack-calculator-modal")).toBeDefined();

      // Configurar: paca = $43.200, 24 unidades, 25% margen
      // Unit cost = 1.800. Raw price = 1800 / 0.75 = 2.400 (redondeado a $50)
      fireEvent.change(screen.getByTestId("input-pack-cost"), { target: { value: "43200" } });
      fireEvent.change(screen.getByTestId("input-units-per-pack"), { target: { value: "24" } });
      fireEvent.change(screen.getByTestId("input-desired-margin"), { target: { value: "25" } });

      fireEvent.click(screen.getByTestId("btn-apply-pack-calc"));

      // Validar inputs actualizados
      const priceInput = screen.getByTestId("input-product-price") as HTMLInputElement;
      expect(priceInput.value).toBe("2400");
    });

    it("advierte sobre cambios sin guardar al intentar salir (HU-330)", () => {
      const onCancel = vi.fn();
      render(
        <ProductForm
          initialData={{ name: "Aceite" }}
          onSave={vi.fn()}
          onCancel={onCancel}
        />
      );

      // Modificar nombre
      fireEvent.change(screen.getByTestId("input-product-name"), { target: { value: "Aceite Premier" } });

      // Intentar cancelar
      fireEvent.click(screen.getByTestId("btn-cancel-product"));

      // Diálogo de confirmación debe mostrarse
      expect(screen.getByTestId("unsaved-changes-dialog")).toBeDefined();
      expect(onCancel).not.toHaveBeenCalled();

      // Clic en descartar cambios
      fireEvent.click(screen.getByTestId("btn-discard-changes"));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("HU-229, HU-421, HU-422 & HU-425: ProductListScreen", () => {
    const mockProducts: ProductItem[] = [
      {
        id: "p1",
        sku: "ARR-01",
        name: "Arroz Diana 1kg",
        categoryId: "cat-1",
        basePriceCents: 450000,
        costCents: 380000,
        barcodes: [{ barcode: "7702001001", packQtyMilli: 1000 }],
        trackStock: true,
        stockQtyMilli: 20000,
        status: "ACTIVE",
        version: 1
      },
      {
        id: "p2",
        sku: "PAN-02",
        name: "Pan Rollo Suelto",
        categoryId: "cat-2",
        basePriceCents: 50000,
        costCents: 30000,
        barcodes: [], // Sin código de barras
        trackStock: false,
        status: "ACTIVE",
        version: 1
      },
      {
        id: "p3",
        sku: "PER-03",
        name: "Producto A Pérdida",
        categoryId: "cat-1",
        basePriceCents: 200000,
        costCents: 250000, // Costo > Precio
        barcodes: [{ barcode: "7702003003", packQtyMilli: 1000 }],
        trackStock: true,
        stockQtyMilli: 3000,
        status: "ACTIVE",
        version: 1
      }
    ];

    it("filtra por búsqueda y por pestañas (sin código y margen negativo)", () => {
      render(
        <ProductListScreen
          products={mockProducts}
          onNewProduct={vi.fn()}
          onEditProduct={vi.fn()}
          onDuplicateProduct={vi.fn()}
          onQuickPriceUpdate={vi.fn()}
        />
      );

      // Todos los productos
      expect(screen.getByTestId("product-row-p1")).toBeDefined();
      expect(screen.getByTestId("product-row-p2")).toBeDefined();
      expect(screen.getByTestId("product-row-p3")).toBeDefined();

      // Filtrar sin código de barras
      fireEvent.click(screen.getByTestId("tab-filter-no-barcode"));
      expect(screen.queryByTestId("product-row-p1")).toBeNull();
      expect(screen.getByTestId("product-row-p2")).toBeDefined();

      // Filtrar margen negativo (HU-422)
      fireEvent.click(screen.getByTestId("tab-filter-negative-margin"));
      expect(screen.queryByTestId("product-row-p1")).toBeNull();
      expect(screen.getByTestId("product-row-p3")).toBeDefined();
    });

    it("permite edición rápida de precio en línea con If-Match (HU-229)", async () => {
      const onQuickUpdate = vi.fn();
      render(
        <ProductListScreen
          products={mockProducts}
          onNewProduct={vi.fn()}
          onEditProduct={vi.fn()}
          onDuplicateProduct={vi.fn()}
          onQuickPriceUpdate={onQuickUpdate}
        />
      );

      // Iniciar edición rápida en Arroz Diana
      fireEvent.click(screen.getByTestId("btn-quick-edit-price-p1"));
      expect(screen.getByTestId("input-quick-price-p1")).toBeDefined();

      // Cambiar precio a $4.800
      fireEvent.change(screen.getByTestId("input-quick-price-p1"), { target: { value: "4800" } });
      fireEvent.click(screen.getByTestId("btn-save-quick-price-p1"));

      expect(onQuickUpdate).toHaveBeenCalledWith("p1", 480000, 1);
    });

    it("permite duplicar producto y abrir hoja de mostrador (HU-421, HU-425)", () => {
      const onDuplicate = vi.fn();
      render(
        <ProductListScreen
          products={mockProducts}
          onNewProduct={vi.fn()}
          onEditProduct={vi.fn()}
          onDuplicateProduct={onDuplicate}
          onQuickPriceUpdate={vi.fn()}
        />
      );

      // Duplicar p1
      fireEvent.click(screen.getByTestId("btn-duplicate-p1"));
      expect(onDuplicate).toHaveBeenCalledWith(mockProducts[0]);

      // Abrir lista de mostrador
      fireEvent.click(screen.getByTestId("btn-open-counter-sheet"));
      expect(screen.getByTestId("counter-sheet-modal")).toBeDefined();
      expect(screen.getAllByText("Pan Rollo Suelto").length).toBeGreaterThanOrEqual(1);
    });
  });
});
