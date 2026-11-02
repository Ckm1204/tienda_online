/**
 * Semillas y validadores oficiales de Colombia:
 * - HU-141: Departamentos y municipios DANE.
 * - HU-142: Tipos de documento de identidad y cálculo/validación de DV DIAN (Módulo 11).
 * - HU-143: Impuestos semilla por tienda nueva (IVA19, IVA5, EXENTO, EXCLUIDO, INC8, BOLSA).
 * - HU-144: Denominaciones de billetes y monedas COP para arqueo ciego.
 * - HU-482: Validador GS1 Módulo 10 para códigos de barras EAN-13, EAN-8, UPC-A y CODE-128.
 */

export interface DaneMunicipality {
  daneCode: string;
  departmentCode: string;
  departmentName: string;
  municipalityName: string;
  displayName: string;
}

export const COLOMBIA_DANE_MUNICIPALITIES: readonly DaneMunicipality[] = Object.freeze([
  { daneCode: "11001", departmentCode: "11", departmentName: "Bogotá, D.C.", municipalityName: "Bogotá, D.C.", displayName: "Bogotá, D.C." },
  { daneCode: "05001", departmentCode: "05", departmentName: "Antioquia", municipalityName: "Medellín", displayName: "Medellín (Antioquia)" },
  { daneCode: "76001", departmentCode: "76", departmentName: "Valle del Cauca", municipalityName: "Cali", displayName: "Cali (Valle del Cauca)" },
  { daneCode: "08001", departmentCode: "08", departmentName: "Atlántico", municipalityName: "Barranquilla", displayName: "Barranquilla (Atlántico)" },
  { daneCode: "13001", departmentCode: "13", departmentName: "Bolívar", municipalityName: "Cartagena de Indias", displayName: "Cartagena de Indias (Bolívar)" },
  { daneCode: "68001", departmentCode: "68", departmentName: "Santander", municipalityName: "Bucaramanga", displayName: "Bucaramanga (Santander)" },
  { daneCode: "66001", departmentCode: "66", departmentName: "Risaralda", municipalityName: "Pereira", displayName: "Pereira (Risaralda)" },
  { daneCode: "17001", departmentCode: "17", departmentName: "Caldas", municipalityName: "Manizales", displayName: "Manizales (Caldas)" },
  { daneCode: "73001", departmentCode: "73", departmentName: "Tolima", municipalityName: "Ibagué", displayName: "Ibagué (Tolima)" },
  { daneCode: "54001", departmentCode: "54", departmentName: "Norte de Santander", municipalityName: "Cúcuta", displayName: "Cúcuta (Norte de Santander)" },
  { daneCode: "50001", departmentCode: "50", departmentName: "Meta", municipalityName: "Villavicencio", displayName: "Villavicencio (Meta)" },
  { daneCode: "52001", departmentCode: "52", departmentName: "Nariño", municipalityName: "Pasto", displayName: "Pasto (Nariño)" }
]);

export function findMunicipalityByDaneCode(daneCode: string): DaneMunicipality | undefined {
  return COLOMBIA_DANE_MUNICIPALITIES.find((m) => m.daneCode === daneCode.trim());
}

// HU-142: Tipos de documento de identidad en Colombia y cálculo de DV (Módulo 11 DIAN)
export const COLOMBIA_DOCUMENT_TYPES = ["CC", "NIT", "CE", "PPT", "TI", "PA"] as const;
export type ColombiaDocumentType = (typeof COLOMBIA_DOCUMENT_TYPES)[number];

const DIAN_MOD11_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

export function calculateNitDv(nitRaw: string): number {
  const clean = nitRaw.replace(/[\s.-]/g, "");
  if (!/^\d{1,15}$/.test(clean)) {
    throw new Error(`Invalid NIT format: ${nitRaw}`);
  }
  const digits = clean.split("").reverse().map((d) => parseInt(d, 10));
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i]! * DIAN_MOD11_WEIGHTS[i]!;
  }
  const rem = sum % 11;
  return rem <= 1 ? rem : 11 - rem;
}

export function validateNitWithDv(nitRaw: string, providedDv: number): boolean {
  try {
    return calculateNitDv(nitRaw) === providedDv;
  } catch {
    return false;
  }
}

// HU-143: Semilla de impuestos por defecto para tienda nueva
export interface TaxSeed {
  code: "IVA19" | "IVA5" | "EXENTO" | "EXCLUIDO" | "INC8" | "BOLSA";
  name: string;
  dianCode: string | null;
  kind: "PERCENT" | "FIXED_PER_UNIT";
  rate: number;      // En nube: porcentaje (19.0) o pesos fijos (66.0)
  rateBp: number;    // En caja: puntos básicos (1900) o centavos por unidad (6600)
}

export const DEFAULT_COLOMBIA_TAX_SEEDS: readonly TaxSeed[] = Object.freeze([
  { code: "IVA19", name: "IVA General 19%", dianCode: "01", kind: "PERCENT", rate: 19, rateBp: 1900 },
  { code: "IVA5", name: "IVA Reducido 5%", dianCode: "01", kind: "PERCENT", rate: 5, rateBp: 500 },
  { code: "EXENTO", name: "IVA Exento 0%", dianCode: "01", kind: "PERCENT", rate: 0, rateBp: 0 },
  { code: "EXCLUIDO", name: "Excluido de IVA", dianCode: "ZY", kind: "PERCENT", rate: 0, rateBp: 0 },
  { code: "INC8", name: "Impoconsumo 8%", dianCode: "04", kind: "PERCENT", rate: 8, rateBp: 800 },
  { code: "BOLSA", name: "Impuesto Bolsas Plásticas", dianCode: "22", kind: "FIXED_PER_UNIT", rate: 66, rateBp: 6600 }
]);

// HU-144: Denominaciones de billetes y monedas COP para arqueo ciego
export interface CopDenomination {
  code: string;
  kind: "BILL" | "COIN";
  valuePesos: number;
  valueCents: number;
  label: string;
}

export const COLOMBIA_COP_DENOMINATIONS: readonly CopDenomination[] = Object.freeze([
  { code: "BILL_100000", kind: "BILL", valuePesos: 100_000, valueCents: 10_000_000, label: "Billete $ 100.000" },
  { code: "BILL_50000", kind: "BILL", valuePesos: 50_000, valueCents: 5_000_000, label: "Billete $ 50.000" },
  { code: "BILL_20000", kind: "BILL", valuePesos: 20_000, valueCents: 2_000_000, label: "Billete $ 20.000" },
  { code: "BILL_10000", kind: "BILL", valuePesos: 10_000, valueCents: 1_000_000, label: "Billete $ 10.000" },
  { code: "BILL_5000", kind: "BILL", valuePesos: 5_000, valueCents: 500_000, label: "Billete $ 5.000" },
  { code: "BILL_2000", kind: "BILL", valuePesos: 2_000, valueCents: 200_000, label: "Billete $ 2.000" },
  { code: "BILL_1000", kind: "BILL", valuePesos: 1_000, valueCents: 100_000, label: "Billete $ 1.000" },
  { code: "COIN_1000", kind: "COIN", valuePesos: 1_000, valueCents: 100_000, label: "Moneda $ 1.000" },
  { code: "COIN_500", kind: "COIN", valuePesos: 500, valueCents: 50_000, label: "Moneda $ 500" },
  { code: "COIN_200", kind: "COIN", valuePesos: 200, valueCents: 20_000, label: "Moneda $ 200" },
  { code: "COIN_100", kind: "COIN", valuePesos: 100, valueCents: 10_000, label: "Moneda $ 100" },
  { code: "COIN_50", kind: "COIN", valuePesos: 50, valueCents: 5_000, label: "Moneda $ 50" }
]);

export function calculateCopDenominationsTotalCents(countsByCode: Record<string, number>): number {
  let totalCents = 0;
  for (const denom of COLOMBIA_COP_DENOMINATIONS) {
    const qty = countsByCode[denom.code] ?? 0;
    if (!Number.isInteger(qty) || qty < 0) {
      throw new Error(`Invalid piece count for ${denom.code}: ${qty}`);
    }
    totalCents += qty * denom.valueCents;
  }
  return totalCents;
}

// HU-482: Validador de formato y dígito de control GS1 (EAN-13, EAN-8, UPC-A) y CODE-128
export function computeGs1CheckDigit(digitsWithoutCheck: string): number {
  if (!/^\d+$/.test(digitsWithoutCheck)) {
    throw new Error("GS1 body must contain only digits");
  }
  const digits = digitsWithoutCheck.split("").reverse().map((d) => parseInt(d, 10));
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const weight = i % 2 === 0 ? 3 : 1;
    sum += digits[i]! * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export interface BarcodeValidationResult {
  valid: boolean;
  kind: "EAN13" | "EAN8" | "UPCA" | "CODE128" | "INVALID";
  warning?: string;
}

export function validateBarcode(rawCode: string): BarcodeValidationResult {
  const code = rawCode.trim();
  if (code.length < 3 || code.length > 64) {
    return { valid: false, kind: "INVALID", warning: "Longitud de código inválida" };
  }
  if (/^\d{13}$/.test(code)) {
    const expected = computeGs1CheckDigit(code.slice(0, 12));
    const actual = parseInt(code[12]!, 10);
    return expected === actual
      ? { valid: true, kind: "EAN13" }
      : { valid: false, kind: "EAN13", warning: "Parece haber un dígito mal escrito en el código EAN-13; verifica el empaque" };
  }
  if (/^\d{12}$/.test(code)) {
    const expected = computeGs1CheckDigit(code.slice(0, 11));
    const actual = parseInt(code[11]!, 10);
    return expected === actual
      ? { valid: true, kind: "UPCA" }
      : { valid: false, kind: "UPCA", warning: "Dígito de control UPC-A inválido" };
  }
  if (/^\d{8}$/.test(code)) {
    const expected = computeGs1CheckDigit(code.slice(0, 7));
    const actual = parseInt(code[7]!, 10);
    return expected === actual
      ? { valid: true, kind: "EAN8" }
      : { valid: false, kind: "EAN8", warning: "Dígito de control EAN-8 inválido" };
  }
  if (/^[A-Za-z0-9._-]{3,32}$/.test(code)) {
    return { valid: true, kind: "CODE128" };
  }
  return { valid: false, kind: "INVALID", warning: "Caracteres no permitidos en código de barras" };
}

/**
 * HU-075: Validador de PIN de cajero/supervisor rechazando secuencias triviales (`1234`, `0000`, dígitos repetidos).
 */
export function isWeakPin(pin: string): boolean {
  if (!/^\d{4,6}$/.test(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 1111, etc.
  const trivial = new Set(["1234", "4321", "123456", "654321", "0123", "2580"]);
  return trivial.has(pin);
}
