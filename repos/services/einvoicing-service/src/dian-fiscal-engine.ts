import crypto from "node:crypto";
import type { CudeCalculationInput } from "./types.js";

/**
 * HU-137, HU-383, HU-384, HU-385: Motor Fiscal DIAN
 * - Cálculo exacto del CUDE / CUFE en SHA-384 (96 caracteres hexadecimales)
 * - Generador de URL oficial para QR DIAN
 * - Validador de tope UVT (5 UVT según Resolución 000165 de 2023)
 * - Plantilla de leyendas fiscales obligatorias `receipt.dian_pos.v1` y comandos ESC/POS
 */

export class DianFiscalEngine {
  /**
   * Valor de la UVT (Unidad de Valor Tributario) en centavos
   * 2024: $47.065 COP -> 4.706.500 centavos
   * 2025: $49.799 COP -> 4.979.900 centavos
   */
  public static readonly DEFAULT_UVT_CENTS = 47_065_00;
  public static readonly DEFAULT_MAX_POS_UVT = 5;

  /**
   * HU-383 & HU-137: Concatena los campos oficiales según el Anexo Técnico de la DIAN:
   * num + fecha + hora + val_sub + cod_imp1 + val_imp1 + cod_imp2 + val_imp2 + val_tot + nit_emi + doc_adq + clave_tec + tipo_amb
   * y calcula el hash SHA-384.
   */
  public static calculateCude(input: CudeCalculationInput): string {
    const valSubStr = (input.subtotal_cents / 100).toFixed(2);
    const valIvaStr = (input.tax_iva_cents / 100).toFixed(2);
    const valIncStr = (input.tax_inc_cents / 100).toFixed(2);
    const valTotStr = (input.total_cents / 100).toFixed(2);

    const rawChain =
      `${input.doc_number}` +
      `${input.issue_date}` +
      `${input.issue_time}` +
      `${valSubStr}` +
      `01${valIvaStr}` +
      `04${valIncStr}` +
      `${valTotStr}` +
      `${input.issuer_nit}` +
      `${input.acquirer_doc}` +
      `${input.technical_key_or_pin}` +
      `${input.environment_type}`;

    return crypto.createHash("sha384").update(rawChain).digest("hex");
  }

  /**
   * HU-137 & HU-383: Genera la URL oficial para el código QR de validación DIAN
   */
  public static generateDianQrUrl(cude: string): string {
    return `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cude}`;
  }

  /**
   * HU-385: Valida si la venta supera el tope en UVT para Documento Equivalente POS.
   * Si supera 5 UVT (o el comprador pide factura con NIT), exige Factura Electrónica (INVOICE).
   */
  public static checkUvtThreshold(
    totalCents: number,
    options?: { maxUvt?: number; uvtValueCents?: number; customerRequestedInvoice?: boolean }
  ): { requiresInvoice: boolean; uvtLimitCents: number; reason?: string } {
    const maxUvt = options?.maxUvt ?? DianFiscalEngine.DEFAULT_MAX_POS_UVT;
    const uvtValue = options?.uvtValueCents ?? DianFiscalEngine.DEFAULT_UVT_CENTS;
    const uvtLimitCents = maxUvt * uvtValue;

    if (options?.customerRequestedInvoice) {
      return {
        requiresInvoice: true,
        uvtLimitCents,
        reason: "Solicitud expresa del cliente con NIT/RUT"
      };
    }

    if (totalCents > uvtLimitCents) {
      return {
        requiresInvoice: true,
        uvtLimitCents,
        reason: `Monto supera el tope legal de ${maxUvt} UVT ($${(uvtLimitCents / 100).toLocaleString("es-CO")} COP)`
      };
    }

    return { requiresInvoice: false, uvtLimitCents };
  }

  /**
   * HU-384: Genera las leyendas obligatorias de la plantilla `receipt.dian_pos.v1`
   */
  public static formatReceiptDianPosLegends(params: {
    resolutionNumber: string;
    resolutionDateFrom: string;
    resolutionDateTo: string;
    prefix: string;
    rangeFrom: number;
    rangeTo: number;
    cude: string;
    providerName: string;
    providerNit: string;
    softwareId: string;
  }): string[] {
    return [
      `DOCUMENTO EQUIVALENTE ELECTRÓNICO DEL TIQUETE DE MÁQUINA REGISTRADORA CON CÁMARA POS`,
      `Resolución DIAN No. ${params.resolutionNumber} del ${params.resolutionDateFrom} al ${params.resolutionDateTo}`,
      `Prefijo: ${params.prefix} del No. ${params.rangeFrom} al ${params.rangeTo}`,
      `CUDE: ${params.cude}`,
      `Proveedor Tecnológico: ${params.providerName} NIT: ${params.providerNit}`,
      `Software: ${params.softwareId} - TienditaOnline POS`
    ];
  }

  /**
   * HU-384: Genera secuencia de comandos ESC/POS para impresión del código QR (`GS ( k`)
   */
  public static formatEscPosQrCommand(qrUrl: string): Buffer {
    const urlBytes = Buffer.from(qrUrl, "utf8");
    const len = urlBytes.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    // ESC/POS QR Code: Modelo 2, Corrección de errores M, tamaño de módulo 4
    return Buffer.concat([
      Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // Modelo 2
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x04]),       // Tamaño 4
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),       // Nivel corrección M
      Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),             // Almacenar datos
      urlBytes,
      Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30])        // Imprimir QR
    ]);
  }
}
