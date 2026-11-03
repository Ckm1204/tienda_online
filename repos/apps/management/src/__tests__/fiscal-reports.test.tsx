import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mock lucide icons
vi.mock("lucide-react-native/icons/download", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/printer", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/scale", () => ({ default: () => null }));

import {
  FiscalReportsScreen,
  FiscalDaySummary,
  DianResolutionInfo
} from "../components/FiscalReportsScreen";

const MOCK_DAYS: FiscalDaySummary[] = [
  {
    date: "2026-11-01",
    initialReceipt: "POS-001-0001001",
    finalReceipt: "POS-001-0001050",
    ticketsCount: 50,
    grossTotalCents: 150000000,
    returnsCents: 0,
    netTotalCents: 150000000,
    taxBreakdown: {
      gravado19Cents: 60000000,
      iva19Cents: 11400000,
      gravado5Cents: 20000000,
      iva5Cents: 1000000,
      exentoCents: 40000000,
      excluidoCents: 30000000,
      inc8Cents: 0
    }
  },
  {
    date: "2026-11-02",
    initialReceipt: "POS-001-0001051",
    finalReceipt: "POS-001-0001110",
    ticketsCount: 60,
    grossTotalCents: 200000000,
    returnsCents: 500000,
    netTotalCents: 199500000,
    taxBreakdown: {
      gravado19Cents: 90000000,
      iva19Cents: 17100000,
      gravado5Cents: 30000000,
      iva5Cents: 1500000,
      exentoCents: 50000000,
      excluidoCents: 30000000,
      inc8Cents: 0
    }
  }
];

const MOCK_DIAN_RESOLUTION: DianResolutionInfo = {
  resolutionNumber: "18764000009999",
  prefix: "SETT",
  rangeFrom: 1,
  rangeTo: 5000,
  currentNumber: 1110,
  validTo: "2027-04-30",
  daysRemaining: 180,
  alertLevel: "NORMAL"
};

describe("FiscalReportsScreen (Libro Fiscal Art. 616 E.T. & Normativa Colombia)", () => {
  afterEach(cleanup);

  it("renderiza encabezado, mes fiscal y métricas de Libro Fiscal", () => {
    const handleDownload = vi.fn();
    const handleViewThermal = vi.fn();

    render(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={7850000000}
        tope3500UvtCents={18375000000}
        uvtAlertLevel="NORMAL"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={true}
        onDownloadCsv={handleDownload}
        onViewThermalReportZ={handleViewThermal}
      />
    );

    expect(screen.getByTestId("fiscal-reports-screen")).toBeDefined();
    expect(screen.getByText("Gestión Fiscal & Normativa Colombiana")).toBeDefined();
    expect(screen.getByText("Ingresos Brutos (2026-11)")).toBeDefined();
    expect(screen.getByText("110 tickets emitidos")).toBeDefined(); // 50 + 60 transacciones
  });

  it("renderiza el medidor del tope de 3.500 UVT y porcentaje consumido", () => {
    render(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={9187500000} // Exactamente el 50%
        tope3500UvtCents={18375000000}
        uvtAlertLevel="NORMAL"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={true}
        onDownloadCsv={vi.fn()}
        onViewThermalReportZ={vi.fn()}
      />
    );

    expect(screen.getByText("NORMAL (50.00%)")).toBeDefined();
    expect(screen.getByText("Tope Anual 3.500 UVT (Régimen Simplificado / No Responsable)")).toBeDefined();
  });

  it("dispara callback onDownloadCsv al pulsar 'Descargar CSV DIAN'", () => {
    const handleDownload = vi.fn();

    render(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={5000000000}
        tope3500UvtCents={18375000000}
        uvtAlertLevel="NORMAL"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={true}
        onDownloadCsv={handleDownload}
        onViewThermalReportZ={vi.fn()}
      />
    );

    const btnCsv = screen.getByTestId("btn-download-csv");
    fireEvent.click(btnCsv);
    expect(handleDownload).toHaveBeenCalledTimes(1);
  });

  it("dispara callback onViewThermalReportZ al pulsar 'Tiquete Reporte Z'", () => {
    const handleViewThermal = vi.fn();

    render(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={5000000000}
        tope3500UvtCents={18375000000}
        uvtAlertLevel="NORMAL"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={true}
        onDownloadCsv={vi.fn()}
        onViewThermalReportZ={handleViewThermal}
      />
    );

    const btnThermal = screen.getByTestId("btn-thermal-report-z");
    fireEvent.click(btnThermal);
    expect(handleViewThermal).toHaveBeenCalledTimes(1);
  });

  it("cambia a pestaña 'Resoluciones DIAN' y muestra rangos de folios y vigencia", () => {
    render(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={5000000000}
        tope3500UvtCents={18375000000}
        uvtAlertLevel="NORMAL"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={true}
        onDownloadCsv={vi.fn()}
        onViewThermalReportZ={vi.fn()}
      />
    );

    const dianTab = screen.getByTestId("tab-dian-resolution");
    fireEvent.click(dianTab);

    expect(screen.getByText("Resolución de Facturación / Documento Equivalente POS")).toBeDefined();
    expect(screen.getByText("18764000009999")).toBeDefined();
    expect(screen.getByText("SETT")).toBeDefined();
    expect(screen.getByText("Hasta 2027-04-30 (180 días restantes)")).toBeDefined();
  });

  it("cambia a pestaña 'Ley 2300' y muestra estado y horarios permitidos", () => {
    render(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={5000000000}
        tope3500UvtCents={18375000000}
        uvtAlertLevel="NORMAL"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={true}
        onDownloadCsv={vi.fn()}
        onViewThermalReportZ={vi.fn()}
      />
    );

    const ley2300Tab = screen.getByTestId("tab-ley-2300");
    fireEvent.click(ley2300Tab);

    expect(screen.getByText("Canales de Cobranza y Cartera — Ley 2300 de 2023")).toBeDefined();
    expect(screen.getByText("HORARIO PERMITIDO")).toBeDefined();
    expect(screen.getByText("Lunes a Viernes:")).toBeDefined();
    expect(screen.getByText("Sábados:")).toBeDefined();
  });

  it("muestra alerta PREVENCION y SUPERADO según nivel de 3.500 UVT", () => {
    const { rerender } = render(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={16000000000}
        tope3500UvtCents={18375000000}
        uvtAlertLevel="PREVENCION"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={false}
        onDownloadCsv={vi.fn()}
        onViewThermalReportZ={vi.fn()}
      />
    );

    expect(screen.getByTestId("uvt-alert-badge")).toBeDefined();
    expect(screen.getByText(/PREVENCION/)).toBeDefined();

    rerender(
      <FiscalReportsScreen
        yearMonth="2026-11"
        accumulatedYearCents={19000000000}
        tope3500UvtCents={18375000000}
        uvtAlertLevel="SUPERADO"
        days={MOCK_DAYS}
        dianResolution={MOCK_DIAN_RESOLUTION}
        isLey2300WindowOpen={false}
        onDownloadCsv={vi.fn()}
        onViewThermalReportZ={vi.fn()}
      />
    );

    expect(screen.getByText(/SUPERADO/)).toBeDefined();
  });
});
