/**
 * FT-01.4 — Motor de Impuestos Determinístico Compartido (TypeScript BigInt 128-bit safe).
 * - HU-016: IVA 19%, IVA 5%, Exento 0%, Excluido, INC 8% con precio con impuesto incluido.
 * - HU-017: Impuestos de valor fijo por unidad (ej. impuesto a las bolsas plásticas).
 * - HU-018: Suite de 200+ Golden Tests idénticos entre TypeScript y Rust.
 * - HU-475: Prevención de Integer Overflow usando BigInt / i128 y límites seguros por línea.
 */

export const MAX_QTY_MILLI = 999_999_000; // 999.999,000 unidades
export const MAX_UNIT_PRICE_CENTS = 99_999_999_900; // $999.999.999,00 COP

export interface TaxDefinition {
  code: string;
  kind: "PERCENT" | "FIXED_PER_UNIT";
  /**
   * Para PERCENT: puntos básicos (19% = 1900, 5% = 500, 8% = 800, 0% = 0).
   * Para FIXED_PER_UNIT: centavos por unidad (ej. $66 COP = 6600 centavos).
   */
  rate_bp: number;
}

export interface CartLineInput {
  product_id: string;
  qty_milli: number;
  unit_price_cents: number;
  discount_cents: number;
  taxes: TaxDefinition[];
}

export interface CartCalculationInput {
  lines: CartLineInput[];
  apply_cash_rounding?: boolean;
  rounding_step_cents?: number; // Por defecto 5000 ($50 COP)
}

export interface LineTaxBreakdown {
  tax_code: string;
  kind: "PERCENT" | "FIXED_PER_UNIT";
  rate_bp: number;
  base_cents: number;
  tax_cents: number;
}

export interface CalculatedCartLine {
  product_id: string;
  qty_milli: number;
  unit_price_cents: number;
  gross_cents: number;
  discount_cents: number;
  base_cents: number;
  tax_cents: number;
  line_total_cents: number;
  tax_detail: LineTaxBreakdown[];
}

export interface CalculatedCartTotals {
  lines: CalculatedCartLine[];
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  rounding_cents: number;
  total_cents: number;
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function validateSafeLineRanges(qtyMilli: number, unitPriceCents: number, discountCents: number): void {
  if (!Number.isInteger(qtyMilli) || qtyMilli <= 0 || qtyMilli > MAX_QTY_MILLI) {
    throw new RangeError(
      `NUMERIC_RANGE_OVERFLOW: qty_milli (${qtyMilli}) must be integer in 1..${MAX_QTY_MILLI}`
    );
  }
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0 || unitPriceCents > MAX_UNIT_PRICE_CENTS) {
    throw new RangeError(
      `NUMERIC_RANGE_OVERFLOW: unit_price_cents (${unitPriceCents}) must be integer in 0..${MAX_UNIT_PRICE_CENTS}`
    );
  }
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new RangeError(`NUMERIC_RANGE_OVERFLOW: discount_cents (${discountCents}) must be >= 0`);
  }
}

export function calculateCartLine(line: CartLineInput): CalculatedCartLine {
  validateSafeLineRanges(line.qty_milli, line.unit_price_cents, line.discount_cents);

  const qtyBig = BigInt(line.qty_milli);
  const priceBig = BigInt(line.unit_price_cents);

  // Multiplicación en precisión arbitraria (128-bit safe)
  const grossBig = divRoundHalfUp(qtyBig * priceBig, 1000n);
  const reqDiscBig = BigInt(line.discount_cents);
  const discountBig = reqDiscBig > grossBig ? grossBig : reqDiscBig;
  const netMerchandiseBig = grossBig - discountBig;

  const percentTaxes = line.taxes.filter((t) => t.kind === "PERCENT");
  const fixedTaxes = line.taxes.filter((t) => t.kind === "FIXED_PER_UNIT");

  const totalPercentBp = percentTaxes.reduce((acc, t) => acc + BigInt(t.rate_bp), 0n);

  const baseBig =
    totalPercentBp === 0n
      ? netMerchandiseBig
      : divRoundHalfUp(netMerchandiseBig * 10_000n, 10_000n + totalPercentBp);

  const totalPercentTaxBig = netMerchandiseBig - baseBig;

  const taxDetail: LineTaxBreakdown[] = [];
  let allocatedPercentTaxBig = 0n;

  percentTaxes.forEach((tax, idx) => {
    let taxAmountBig = 0n;
    if (totalPercentBp > 0n && tax.rate_bp > 0) {
      if (idx === percentTaxes.length - 1) {
        taxAmountBig = totalPercentTaxBig - allocatedPercentTaxBig;
      } else {
        taxAmountBig = divRoundHalfUp(totalPercentTaxBig * BigInt(tax.rate_bp), totalPercentBp);
        allocatedPercentTaxBig += taxAmountBig;
      }
    }
    taxDetail.push({
      tax_code: tax.code,
      kind: "PERCENT",
      rate_bp: tax.rate_bp,
      base_cents: Number(baseBig),
      tax_cents: Number(taxAmountBig)
    });
  });

  let totalFixedTaxBig = 0n;
  for (const fTax of fixedTaxes) {
    const fixedAmtBig = divRoundHalfUp(qtyBig * BigInt(fTax.rate_bp), 1000n);
    totalFixedTaxBig += fixedAmtBig;
    taxDetail.push({
      tax_code: fTax.code,
      kind: "FIXED_PER_UNIT",
      rate_bp: fTax.rate_bp,
      base_cents: 0,
      tax_cents: Number(fixedAmtBig)
    });
  }

  const lineTaxBig = totalPercentTaxBig + totalFixedTaxBig;
  const lineTotalBig = baseBig + lineTaxBig;

  return {
    product_id: line.product_id,
    qty_milli: line.qty_milli,
    unit_price_cents: line.unit_price_cents,
    gross_cents: Number(grossBig),
    discount_cents: Number(discountBig),
    base_cents: Number(baseBig),
    tax_cents: Number(lineTaxBig),
    line_total_cents: Number(lineTotalBig),
    tax_detail: taxDetail
  };
}

export function calculateCartTotals(input: CartCalculationInput): CalculatedCartTotals {
  const calculatedLines = input.lines.map((l) => calculateCartLine(l));

  let subtotalBig = 0n;
  let discountBig = 0n;
  let taxBig = 0n;
  let rawTotalBig = 0n;

  for (const cl of calculatedLines) {
    subtotalBig += BigInt(cl.base_cents);
    discountBig += BigInt(cl.discount_cents);
    taxBig += BigInt(cl.tax_cents);
    rawTotalBig += BigInt(cl.line_total_cents);
  }

  let roundingBig = 0n;
  if (input.apply_cash_rounding && rawTotalBig > 0n) {
    const stepBig = BigInt(input.rounding_step_cents ?? 5000);
    if (stepBig > 0n) {
      const rem = rawTotalBig % stepBig;
      roundingBig = -rem;
    }
  }

  const finalTotalBig = rawTotalBig + roundingBig;

  return {
    lines: calculatedLines,
    subtotal_cents: Number(subtotalBig),
    discount_cents: Number(discountBig),
    tax_cents: Number(taxBig),
    rounding_cents: Number(roundingBig),
    total_cents: Number(finalTotalBig)
  };
}
