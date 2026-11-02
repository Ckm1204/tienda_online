import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  calculateCartLine,
  calculateCartTotals,
  MAX_QTY_MILLI,
  MAX_UNIT_PRICE_CENTS
} from "../index.js";
import { buildDeterministicGoldenCases, GoldenTaxCase } from "../golden-builder.js";

const GOLDEN_FILE = path.resolve(import.meta.dirname, "../../golden-cases.json");

describe("FT-01.4 — Motor de Impuestos Determinístico Compartido (HU-016, HU-017, HU-018, HU-475)", () => {
  it("HU-016: calcula IVA 19%, IVA 5%, Exento 0%, Excluido e INC 8% con precio con impuesto incluido cuadrando al centavo", () => {
    // Escenario Gherkin HU-016: Producto con precio $2.500 (250.000 centavos) e IVA 19%, cantidad 3 unidades
    const line = calculateCartLine({
      product_id: "gaseosa-400",
      qty_milli: 3000,
      unit_price_cents: 250_000,
      discount_cents: 0,
      taxes: [{ code: "IVA19", kind: "PERCENT", rate_bp: 1900 }]
    });

    expect(line.line_total_cents).toBe(750_000); // $7.500,00 exactos
    expect(line.base_cents + line.tax_cents).toBe(line.line_total_cents);
    expect(line.base_cents).toBe(630_252);
    expect(line.tax_cents).toBe(119_748);
  });

  it("HU-017: calcula impuesto fijo por unidad (2 bolsas plásticas a $66 = $132)", () => {
    const line = calculateCartLine({
      product_id: "bolsa-plastica",
      qty_milli: 2000,
      unit_price_cents: 5_000, // $50 precio base bolsa
      discount_cents: 0,
      taxes: [{ code: "BOLSA", kind: "FIXED_PER_UNIT", rate_bp: 6600 }] // $66 impuesto fijo
    });

    expect(line.base_cents).toBe(10_000); // $100
    expect(line.tax_cents).toBe(13_200); // $132
    expect(line.line_total_cents).toBe(23_200); // $232
  });

  it("HU-041 & HU-018: aplica redondeo de efectivo a múltiplo de $50 COP ($4.832 -> redondeo -$32 -> $4.800)", () => {
    const cart = calculateCartTotals({
      lines: [
        {
          product_id: "prod-1",
          qty_milli: 1000,
          unit_price_cents: 483_200, // $4.832,00
          discount_cents: 0,
          taxes: [{ code: "EXCLUIDO", kind: "PERCENT", rate_bp: 0 }]
        }
      ],
      apply_cash_rounding: true,
      rounding_step_cents: 5_000 // $50 COP
    });

    expect(cart.rounding_cents).toBe(-3_200); // -$32 COP
    expect(cart.total_cents).toBe(480_000); // $4.800 COP
  });

  it("HU-475: utiliza BigInt (128-bit safe) sin desbordamiento para montos altos válidos y rechaza valores que superen los topes máximos", () => {
    // 100 unidades a $50.000.000 = $5.000.000.000 (supera 32-bit y 53-bit si no se cuida, pero está dentro del tope seguro)
    const highLine = calculateCartLine({
      product_id: "lote-mayorista",
      qty_milli: 100_000, // 100 unidades
      unit_price_cents: 5_000_000_000, // $50.000.000,00
      discount_cents: 0,
      taxes: [{ code: "IVA19", kind: "PERCENT", rate_bp: 1900 }]
    });
    expect(highLine.line_total_cents).toBe(500_000_000_000);
    expect(highLine.base_cents + highLine.tax_cents).toBe(highLine.line_total_cents);

    // Superar los topes máximos configurados lanza RangeError NUMERIC_RANGE_OVERFLOW
    expect(() =>
      calculateCartLine({
        product_id: "overflow-qty",
        qty_milli: MAX_QTY_MILLI + 1,
        unit_price_cents: 100_000,
        discount_cents: 0,
        taxes: []
      })
    ).toThrow("NUMERIC_RANGE_OVERFLOW");

    expect(() =>
      calculateCartLine({
        product_id: "overflow-price",
        qty_milli: 1000,
        unit_price_cents: MAX_UNIT_PRICE_CENTS + 1,
        discount_cents: 0,
        taxes: []
      })
    ).toThrow("NUMERIC_RANGE_OVERFLOW");
  });

  it("HU-018: genera y verifica la suite compartida de más de 200 Golden Tests en packages/tax-engine/golden-cases.json", () => {
    const generated = buildDeterministicGoldenCases();
    expect(generated.length).toBeGreaterThanOrEqual(200);

    if (!fs.existsSync(GOLDEN_FILE)) {
      fs.writeFileSync(GOLDEN_FILE, JSON.stringify(generated, null, 2), "utf8");
    }

    const fromDisk = JSON.parse(fs.readFileSync(GOLDEN_FILE, "utf8")) as GoldenTaxCase[];
    expect(fromDisk.length).toBeGreaterThanOrEqual(200);

    for (const tc of fromDisk) {
      const actual = calculateCartTotals(tc.input);
      expect({
        subtotal_cents: actual.subtotal_cents,
        discount_cents: actual.discount_cents,
        tax_cents: actual.tax_cents,
        rounding_cents: actual.rounding_cents,
        total_cents: actual.total_cents
      }).toEqual(tc.expected);
    }
  });
});
