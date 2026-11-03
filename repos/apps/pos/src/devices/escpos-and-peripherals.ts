import { formatMoneyCents } from "@tiendita/config";

/**
 * ÉPICA 04 (FT-04.1) — Periféricos de Mostrador e Impresión ESC/POS
 * Cubre: HU-048, HU-049, HU-050, HU-051, HU-052, HU-225, HU-343, HU-344, HU-345,
 *        HU-346, HU-347, HU-348, HU-349, HU-360, HU-418, HU-453, HU-474.
 */

export type PaperWidthMm = 58 | 80;

export interface HardwareConfig {
  printerConnection: "USB" | "NETWORK" | "WINDOWS_RAW" | "BLUETOOTH";
  printerNameOrIp: string;
  paperWidthMm: PaperWidthMm;
  cutPaper: boolean;
  hasCashDrawer: boolean;
  drawerConnection: "PRINTER_RJ11" | "USB_SERIAL";
  drawerSerialPort?: string;
  scaleSerialPort?: string;
  logoMonochromeEnabled: boolean;
}

/**
 * HU-474: Sanitiza secuencias de comandos ESC/GS (ej. \x1B\x70 apertura de cajón) y cualquier byte
 * de control no imprimible (0x00..0x1F y 0x7F) proveniente de entradas de usuario.
 */
export function sanitizeEscPosUserText(raw: string): string {
  return raw
    .replace(/\x1b[\x20-\x7e]|\x1d[\x20-\x7e]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
}

/**
 * HU-344: Maquetador de renglones de ancho fijo (32 columnas para 58 mm, 48 columnas para 80 mm)
 * que parte nombres largos en múltiples líneas sin truncar nunca el monto alineado a la derecha.
 */
export function formatFixedWidthItemLines(
  descriptionRaw: string,
  rightAmountRaw: string,
  paperWidthMm: PaperWidthMm
): string[] {
  const cols = paperWidthMm === 58 ? 32 : 48;
  const desc = sanitizeEscPosUserText(descriptionRaw);
  const amount = sanitizeEscPosUserText(rightAmountRaw);
  const amountLen = amount.length;
  const maxLeftFirstLine = Math.max(8, cols - amountLen - 2);

  if (desc.length <= maxLeftFirstLine) {
    const pad = " ".repeat(cols - desc.length - amountLen);
    return [`${desc}${pad}${amount}`];
  }

  // Partir por palabras para que la última línea o la primera lleve el monto alineado en la columna `cols`
  const words = desc.split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= cols - 2) {
      current = candidate;
    } else {
      if (current) wrapped.push(current);
      current = word.slice(0, cols - 2);
    }
  }
  if (current) wrapped.push(current);

  const lastLine = wrapped[wrapped.length - 1] ?? "";
  if (lastLine.length <= maxLeftFirstLine) {
    const pad = " ".repeat(cols - lastLine.length - amountLen);
    wrapped[wrapped.length - 1] = `${lastLine}${pad}${amount}`;
  } else {
    const pad = " ".repeat(cols - amountLen);
    wrapped.push(`${pad}${amount}`);
  }

  return wrapped;
}

export interface InternalSaleReceiptData {
  businessName: string;
  address: string;
  terminalCode: string;
  cashierName: string;
  receiptCode: string; // C01-000042
  issuedAtIso: string;
  customerName?: string | null;
  customerDoc?: string | null;
  authorizedPickupName?: string | null;
  lines: { description: string; qtyLabel: string; lineTotalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  roundingCents: number;
  totalCents: number;
  payments: { method: string; amountCents: number; tenderedCents?: number | null; changeCents?: number | null }[];
  creditPreviousBalanceCents?: number | null;
  creditNewBalanceCents?: number | null;
  footerLegend?: string;
  returnPolicyText?: string;
  isReprint?: boolean;
  isPracticeMode?: boolean;
  isGiftReceipt?: boolean;
}

export class EscPosPrinterAndPeripherals {
  public connected = true;
  public paperOut = false;
  public readonly printQueue: string[] = [];
  public readonly printedJobs: string[] = [];
  public drawerOpenPulsesSent = 0;
  public lastSerialDrawerPortUsed: string | null = null;
  private scaleStableGrams = 0;

  constructor(public config: HardwareConfig) {}

  /**
   * HU-049, HU-050, HU-344, HU-349, HU-418 & HU-452: Renderiza comprobante de venta interno,
   * copia (`*** COPIA DE COMPROBANTE ***`), tiquete de práctica (`*** PRÁCTICA ***`) o tiquete de regalo sin precios.
   */
  renderSaleReceiptText(data: InternalSaleReceiptData): string {
    const out: string[] = [];

    if (this.config.logoMonochromeEnabled) {
      out.push("[ESC/POS BITMAP LOGO GS v 0]");
    }
    if (data.isPracticeMode) {
      out.push("*** TIQUETE DE PRÁCTICA SIN VALOR ***");
    }
    if (data.isReprint) {
      out.push("*** COPIA DE COMPROBANTE ***");
    }
    if (data.isGiftReceipt) {
      out.push("*** TIQUETE DE CAMBIO / REGALO ***");
    }

    out.push(sanitizeEscPosUserText(data.businessName));
    out.push(sanitizeEscPosUserText(data.address));
    out.push(`Caja: ${sanitizeEscPosUserText(data.terminalCode)}  Cajero: ${sanitizeEscPosUserText(data.cashierName)}`);
    out.push(`Comprobante: ${sanitizeEscPosUserText(data.receiptCode)}`);
    out.push(`Fecha: ${sanitizeEscPosUserText(data.issuedAtIso)}`);

    if (data.customerName) {
      out.push(`Cliente: ${sanitizeEscPosUserText(data.customerName)}${data.customerDoc ? ` (${sanitizeEscPosUserText(data.customerDoc)})` : ""}`);
    }
    if (data.authorizedPickupName) {
      out.push(`Retira: ${sanitizeEscPosUserText(data.authorizedPickupName)}`);
    }

    out.push("-".repeat(this.config.paperWidthMm === 58 ? 32 : 48));

    for (const line of data.lines) {
      const label = `${line.qtyLabel} x ${line.description}`;
      if (data.isGiftReceipt) {
        out.push(sanitizeEscPosUserText(label));
      } else {
        const formatted = formatFixedWidthItemLines(
          label,
          formatMoneyCents(line.lineTotalCents),
          this.config.paperWidthMm
        );
        out.push(...formatted);
      }
    }

    out.push("-".repeat(this.config.paperWidthMm === 58 ? 32 : 48));

    if (!data.isGiftReceipt) {
      out.push(...formatFixedWidthItemLines("TOTAL:", formatMoneyCents(data.totalCents), this.config.paperWidthMm));
      for (const p of data.payments) {
        out.push(...formatFixedWidthItemLines(`Pago ${p.method}:`, formatMoneyCents(p.amountCents), this.config.paperWidthMm));
        if (p.changeCents && p.changeCents > 0) {
          out.push(...formatFixedWidthItemLines("Cambio:", formatMoneyCents(p.changeCents), this.config.paperWidthMm));
        }
      }
      if (
        data.creditPreviousBalanceCents !== undefined &&
        data.creditPreviousBalanceCents !== null &&
        data.creditNewBalanceCents !== undefined &&
        data.creditNewBalanceCents !== null
      ) {
        out.push(
          `Saldo anterior: ${formatMoneyCents(data.creditPreviousBalanceCents)} / Nuevo saldo: ${formatMoneyCents(data.creditNewBalanceCents)}`
        );
      }
    }

    if (data.returnPolicyText) {
      out.push(sanitizeEscPosUserText(data.returnPolicyText));
    }
    out.push(
      sanitizeEscPosUserText(
        data.footerLegend ?? "Documento no válido como factura electrónica"
      )
    );
    if (this.config.cutPaper) {
      out.push("[ESC/POS CUT]");
    }

    return out.join("\n");
  }

  /**
   * HU-345: Plantilla ESC/POS de comprobante de abono de cartera.
   */
  renderCreditPaymentReceiptText(params: {
    businessName: string;
    customerName: string;
    previousBalanceCents: number;
    paymentAmountCents: number;
    newBalanceCents: number;
    method: string;
    occurredAtIso: string;
  }): string {
    return [
      sanitizeEscPosUserText(params.businessName),
      `COMPROBANTE DE ABONO - ${sanitizeEscPosUserText(params.occurredAtIso)}`,
      `Cliente: ${sanitizeEscPosUserText(params.customerName)}`,
      `Medio: ${sanitizeEscPosUserText(params.method)}`,
      `SALDO ANTERIOR: ${formatMoneyCents(params.previousBalanceCents)}`,
      `ABONO RECIBIDO: ${formatMoneyCents(params.paymentAmountCents)}`,
      `NUEVO SALDO: ${formatMoneyCents(params.newBalanceCents)}`
    ].join("\n");
  }

  /**
   * HU-346: Plantilla ESC/POS de tirilla de movimiento de caja / retiro parcial con espacio para firma.
   */
  renderCashMovementSlipText(params: {
    kind: string;
    amountCents: number;
    reason: string;
    cashierName: string;
    approvedByName?: string | null;
    occurredAtIso: string;
  }): string {
    return [
      `SOPORTE MOVIMIENTO DE CAJA: ${sanitizeEscPosUserText(params.kind)}`,
      `Fecha: ${sanitizeEscPosUserText(params.occurredAtIso)}`,
      `Valor: ${formatMoneyCents(params.amountCents)}`,
      `Motivo: ${sanitizeEscPosUserText(params.reason)}`,
      `Cajero: ${sanitizeEscPosUserText(params.cashierName)}`,
      params.approvedByName ? `Aprobó: ${sanitizeEscPosUserText(params.approvedByName)}` : "",
      "Firma de quien recibe: ____________"
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * HU-347: Plantilla ESC/POS de comprobante de devolución / anulación.
   */
  renderReturnSlipText(params: {
    originalReceiptCode: string;
    kind: "VOID" | "PARTIAL_RETURN" | "FULL_RETURN";
    reason: string;
    refundTotalCents: number;
    refundMethod: string;
    supervisorName: string;
  }): string {
    return [
      `DEVOLUCIÓN SOBRE COMPROBANTE ${sanitizeEscPosUserText(params.originalReceiptCode)}`,
      `Tipo: ${params.kind}`,
      `Motivo: ${sanitizeEscPosUserText(params.reason)}`,
      `Reembolso (${sanitizeEscPosUserText(params.refundMethod)}): ${formatMoneyCents(params.refundTotalCents)}`,
      `Autorizó: ${sanitizeEscPosUserText(params.supervisorName)}`,
      "Firma del cliente: ____________"
    ].join("\n");
  }

  /**
   * HU-348: Plantilla ESC/POS de Reporte Z de cierre de turno.
   */

  /**
   * HU-047: Plantilla ESC/POS de comprobante de cambio de producto mano a mano (Ley 1480 de 2011).
   */
  renderExchangeSlipText(params: {
    exchangeCode: string;
    returnedItemName: string;
    returnedQtyMilli: number;
    returnedValueCents: number;
    newItemName: string;
    newQtyMilli: number;
    newValueCents: number;
    differenceCents: number;
    paymentMethod?: string;
    supervisorName: string;
    occurredAtIso: string;
  }): string {
    const diffDesc =
      params.differenceCents > 0
        ? `DIFERENCIA COBRADA: ${formatMoneyCents(params.differenceCents)} (${params.paymentMethod ?? "EFECTIVO"})`
        : params.differenceCents < 0
        ? `EXCEDENTE REEMBOLSADO: ${formatMoneyCents(Math.abs(params.differenceCents))}`
        : "CAMBIO MANO A MANO: $0 COP (DIFERENCIA EXACTA)";

    return [
      "TIQUETE DE CAMBIO DE PRODUCTO",
      "(Ley 1480 de 2011 - Estatuto del Consumidor)",
      `No: ${sanitizeEscPosUserText(params.exchangeCode)} - ${sanitizeEscPosUserText(params.occurredAtIso)}`,
      "--------------------------------",
      "PRODUCTO DEVUELTO:",
      `${params.returnedQtyMilli / 1000}x ${sanitizeEscPosUserText(params.returnedItemName)} - ${formatMoneyCents(params.returnedValueCents)}`,
      "PRODUCTO NUEVO ENTREGADO:",
      `${params.newQtyMilli / 1000}x ${sanitizeEscPosUserText(params.newItemName)} - ${formatMoneyCents(params.newValueCents)}`,
      "--------------------------------",
      diffDesc,
      `Autorizado por: ${sanitizeEscPosUserText(params.supervisorName)}`,
      "Firma cliente: __________________"
    ].join("\n");
  }

  renderReportZText(params: {
    terminalCode: string;
    cashierName: string;
    openedAtIso: string;
    closedAtIso: string;
    openingFloatCents: number;
    expectedCashCents: number;
    declaredCashCents: number;
    differenceCents: number;
    denominationsCount: Record<string, number>;
  }): string {
    return [
      `=== REPORTE Z CIERRE DE TURNO (${sanitizeEscPosUserText(params.terminalCode)}) ===`,
      `Cajero: ${sanitizeEscPosUserText(params.cashierName)}`,
      `Apertura: ${sanitizeEscPosUserText(params.openedAtIso)}  Cierre: ${sanitizeEscPosUserText(params.closedAtIso)}`,
      `Base inicial: ${formatMoneyCents(params.openingFloatCents)}`,
      `Efectivo esperado: ${formatMoneyCents(params.expectedCashCents)}`,
      `Efectivo contado: ${formatMoneyCents(params.declaredCashCents)}`,
      `Diferencia (descuadre): ${formatMoneyCents(params.differenceCents)}`,
      `Denominaciones: ${JSON.stringify(params.denominationsCount)}`,
      "Firma del cajero: ____________"
    ].join("\n");
  }

  /**
   * HU-360: Impresión de estado de cuenta corto de fiado en tirilla térmica.
   */
  renderCustomerStatementSlipText(params: {
    customerName: string;
    estimatedBalanceCents: number;
    movements: { kind: string; amountCents: number; dateIso: string }[];
  }): string {
    const lines = [
      `ESTADO DE CUENTA - ${sanitizeEscPosUserText(params.customerName)}`,
      ...params.movements.map(
        (m) => `${sanitizeEscPosUserText(m.dateIso.slice(0, 10))} ${m.kind}: ${formatMoneyCents(m.amountCents)}`
      ),
      `SALDO ESTIMADO A LA FECHA: ${formatMoneyCents(params.estimatedBalanceCents)}`
    ];
    return lines.join("\n");
  }


  /**
   * Art. 616 E.T.: Impresión de Reporte Z de Cierre Fiscal Diario en tirilla térmica (58mm o 80mm).
   */
  renderReportZSlipText(params: {
    businessName: string;
    nit: string;
    terminalCode: string;
    cashSessionId: string;
    cashierName: string;
    closedAtIso: string;
    firstReceiptCode: string;
    lastReceiptCode: string;
    totalSalesCount: number;
    expectedCashCents: number;
    declaredCashCents: number;
    differenceCents: number;
    grossTotalCents: number;
    returnsTotalCents: number;
    netTotalCents: number;
    taxBreakdown?: {
      gravado19Cents?: number;
      iva19Cents?: number;
      gravado5Cents?: number;
      iva5Cents?: number;
      exentoCents?: number;
      excluidoCents?: number;
      inc8Cents?: number;
    };
    paperWidthMm?: PaperWidthMm;
  }): string {
    const width = params.paperWidthMm ?? this.config.paperWidthMm;
    const cols = width === 58 ? 32 : 48;
    const divider = "=".repeat(cols);
    const subDivider = "-".repeat(cols);

    const padLine = (left: string, right: string) => {
      const space = Math.max(1, cols - left.length - right.length);
      return `${left}${" ".repeat(space)}${right}`;
    };

    const center = (text: string) => {
      const pad = Math.max(0, Math.floor((cols - text.length) / 2));
      return " ".repeat(pad) + text;
    };

    const lines: string[] = [
      divider,
      center(sanitizeEscPosUserText(params.businessName)),
      center(`NIT: ${sanitizeEscPosUserText(params.nit)}`),
      center("CIERRE FISCAL DIARIO - REPORTE Z"),
      center("(Art. 616 del E.T.)"),
      divider,
      padLine("Terminal:", sanitizeEscPosUserText(params.terminalCode)),
      padLine("Sesion:", params.cashSessionId.slice(0, 12)),
      padLine("Cajero:", sanitizeEscPosUserText(params.cashierName)),
      padLine("Fecha:", params.closedAtIso.slice(0, 16).replace("T", " ")),
      subDivider,
      padLine("Comp. Inicial:", params.firstReceiptCode),
      padLine("Comp. Final:", params.lastReceiptCode),
      padLine("Total Facturas:", String(params.totalSalesCount)),
      subDivider,
      center("DESGLOSE IMPUESTOS"),
      padLine("Gravado 19%:", formatMoneyCents(params.taxBreakdown?.gravado19Cents ?? 0)),
      padLine("IVA 19%:", formatMoneyCents(params.taxBreakdown?.iva19Cents ?? 0)),
      padLine("Gravado 5%:", formatMoneyCents(params.taxBreakdown?.gravado5Cents ?? 0)),
      padLine("IVA 5%:", formatMoneyCents(params.taxBreakdown?.iva5Cents ?? 0)),
      padLine("Exento:", formatMoneyCents(params.taxBreakdown?.exentoCents ?? 0)),
      padLine("Excluido:", formatMoneyCents(params.taxBreakdown?.excluidoCents ?? 0)),
      padLine("INC 8%:", formatMoneyCents(params.taxBreakdown?.inc8Cents ?? 0)),
      subDivider,
      padLine("INGRESOS BRUTOS:", formatMoneyCents(params.grossTotalCents)),
      padLine("Devoluciones:", formatMoneyCents(params.returnsTotalCents)),
      padLine("INGRESOS NETOS:", formatMoneyCents(params.netTotalCents)),
      divider,
      center("ARQUEO DE EFECTIVO"),
      padLine("Esperado Gaveta:", formatMoneyCents(params.expectedCashCents)),
      padLine("Declarado Cajero:", formatMoneyCents(params.declaredCashCents)),
      padLine("Diferencia:", formatMoneyCents(params.differenceCents)),
      divider
    ];

    return lines.join("\n");
  }
  /**
   * HU-050 & HU-343: Envía a imprimir o encola si no hay papel / está desconectada;
   * al reconectar por USB o poner papel vacía la cola sin duplicar ventas.
   */
  printOrEnqueue(renderedTicket: string): { printedImmediately: boolean; queuedCount: number } {
    if (!this.connected || this.paperOut) {
      this.printQueue.push(renderedTicket);
      return { printedImmediately: false, queuedCount: this.printQueue.length };
    }
    this.printedJobs.push(renderedTicket);
    return { printedImmediately: true, queuedCount: this.printQueue.length };
  }

  /**
   * HU-343: Reconexión en caliente (hot-plug) USB y vaciado automático de cola pendiente.
   */
  reconnectUsbAndRetryQueue(): number {
    this.connected = true;
    this.paperOut = false;
    let flushed = 0;
    while (this.printQueue.length > 0) {
      const next = this.printQueue.shift()!;
      this.printedJobs.push(next);
      flushed += 1;
    }
    return flushed;
  }

  /**
   * HU-051 & HU-453: Envía pulso de apertura al cajón monedero (RJ11 tras impresora o puerto USB-Serial COM)
   * únicamente cuando el pago involucra efectivo o en apertura manual autorizada.
   */
  pulseCashDrawerIfApplicable(hasCashInTransaction: boolean): boolean {
    if (!this.config.hasCashDrawer || !hasCashInTransaction) {
      return false;
    }
    this.drawerOpenPulsesSent += 1;
    if (this.config.drawerConnection === "USB_SERIAL") {
      this.lastSerialDrawerPortUsed = this.config.drawerSerialPort ?? "COM4";
    }
    return true;
  }

  /**
   * HU-052: Lectura de peso estable en gramos desde balanza serial (RS-232 / USB-Serial).
   */
  setSimulatedScaleWeightGrams(grams: number): void {
    this.scaleStableGrams = grams;
  }

  readStableWeightFromScale(): { port: string; weightGrams: number; qtyMilliKg: number } {
    if (!this.config.scaleSerialPort) {
      throw new Error("SCALE_SERIAL_PORT_NOT_CONFIGURED");
    }
    return {
      port: this.config.scaleSerialPort,
      weightGrams: this.scaleStableGrams,
      qtyMilliKg: this.scaleStableGrams
    };
  }
}
