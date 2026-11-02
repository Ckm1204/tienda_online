import {
  CartCalculationInput,
  CalculatedCartTotals,
  calculateCartTotals,
  TaxDefinition
} from "./index.js";

export interface GoldenTaxCase {
  id: string;
  description: string;
  input: CartCalculationInput;
  expected: {
    subtotal_cents: number;
    discount_cents: number;
    tax_cents: number;
    rounding_cents: number;
    total_cents: number;
  };
}

const TAX_IVA19: TaxDefinition = { code: "IVA19", kind: "PERCENT", rate_bp: 1900 };
const TAX_IVA5: TaxDefinition = { code: "IVA5", kind: "PERCENT", rate_bp: 500 };
const TAX_EXENTO: TaxDefinition = { code: "EXENTO", kind: "PERCENT", rate_bp: 0 };
const TAX_EXCLUIDO: TaxDefinition = { code: "EXCLUIDO", kind: "PERCENT", rate_bp: 0 };
const TAX_INC8: TaxDefinition = { code: "INC8", kind: "PERCENT", rate_bp: 800 };
const TAX_BOLSA: TaxDefinition = { code: "BOLSA", kind: "FIXED_PER_UNIT", rate_bp: 6600 };

export function buildDeterministicGoldenCases(): GoldenTaxCase[] {
  const cases: GoldenTaxCase[] = [];
  const taxesPool: TaxDefinition[][] = [
    [TAX_IVA19],
    [TAX_IVA5],
    [TAX_EXENTO],
    [TAX_EXCLUIDO],
    [TAX_INC8],
    [TAX_BOLSA],
    [TAX_IVA19, TAX_BOLSA]
  ];

  const pricesPool = [
    50_000,   // $500
    120_000,  // $1.200
    250_000,  // $2.500
    385_000,  // $3.850
    483_200,  // $4.832
    1_250_000,// $12.500
    2_400_000 // $24.000
  ];

  const qtysPool = [
    1000, // 1.000 und
    2000, // 2.000 und
    3000, // 3.000 und
    375,  // 0.375 kg (375g)
    640,  // 0.640 kg (640g)
    1250, // 1.250 kg
    6000, // six-pack
    12000 // docena
  ];

  let idx = 1;
  for (const taxes of taxesPool) {
    for (const price of pricesPool) {
      for (let qIdx = 0; qIdx < 5; qIdx++) {
        const qty = qtysPool[(idx + qIdx) % qtysPool.length]!;
        const discount = idx % 3 === 0 ? Math.floor((price * qty) / 20_000) : 0;
        const applyCashRounding = idx % 2 === 0;

        const input: CartCalculationInput = {
          lines: [
            {
              product_id: `prod-${idx}`,
              qty_milli: qty,
              unit_price_cents: price,
              discount_cents: discount,
              taxes
            }
          ],
          apply_cash_rounding: applyCashRounding,
          rounding_step_cents: 5000
        };

        const out: CalculatedCartTotals = calculateCartTotals(input);
        cases.push({
          id: `GOLDEN-${String(idx).padStart(3, "0")}`,
          description: `Tax=${taxes.map((t) => t.code).join("+")} qty_milli=${qty} price_cents=${price} disc=${discount} rounding=${applyCashRounding}`,
          input,
          expected: {
            subtotal_cents: out.subtotal_cents,
            discount_cents: out.discount_cents,
            tax_cents: out.tax_cents,
            rounding_cents: out.rounding_cents,
            total_cents: out.total_cents
          }
        });
        idx += 1;
      }
    }
  }

  return cases;
}
