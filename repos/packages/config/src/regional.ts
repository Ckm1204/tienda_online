/**
 * HU-496: Internacionalización y parametrización regional centralizada.
 * Valores por defecto para Colombia: locale `es-CO`, moneda `COP`, huso `America/Bogota`.
 */
export interface RegionalConfig {
  readonly locale: string;
  readonly currency: string;
  readonly timeZone: string;
  readonly thousandsSeparator: string;
  readonly decimalSeparator: string;
  readonly cashRoundingStepCents: number;
}

export const DEFAULT_COLOMBIA_REGIONAL_CONFIG: RegionalConfig = Object.freeze({
  locale: "es-CO",
  currency: "COP",
  timeZone: "America/Bogota",
  thousandsSeparator: ".",
  decimalSeparator: ",",
  cashRoundingStepCents: 5000 // $50 COP = 5.000 centavos
});

/**
 * Formatea centavos enteros a representación monetaria regional (ej. 5000000 -> "$ 50.000").
 * HU-321 & HU-496: nunca usa coma flotante para almacenar dinero.
 */
export function formatMoneyCents(
  amountCents: number | bigint,
  config: RegionalConfig = DEFAULT_COLOMBIA_REGIONAL_CONFIG,
  includeCents = false
): string {
  const centsBig = typeof amountCents === "bigint" ? amountCents : BigInt(Math.trunc(amountCents));
  const isNegative = centsBig < 0n;
  const absCents = isNegative ? -centsBig : centsBig;
  const wholePesos = absCents / 100n;
  const remainderCents = absCents % 100n;

  const digits = wholePesos.toString();
  const withThousands = digits.replace(/\B(?=(\d{3})+(?!\d))/g, config.thousandsSeparator);
  const sign = isNegative ? "-" : "";
  const symbol = config.currency === "COP" ? "$" : config.currency;

  if (includeCents || remainderCents !== 0n) {
    const centsStr = remainderCents.toString().padStart(2, "0");
    return `${sign}${symbol} ${withThousands}${config.decimalSeparator}${centsStr}`;
  }
  return `${sign}${symbol} ${withThousands}`;
}

/**
 * Convierte una cadena digitada por el tendero (ej. "$ 50.000") a centavos enteros (5000000).
 */
export function parsePesosInputToCents(input: string): number {
  const digitsOnly = input.replace(/[^\d-]/g, "");
  if (!digitsOnly || digitsOnly === "-") return 0;
  const pesos = parseInt(digitsOnly, 10);
  if (!Number.isSafeInteger(pesos)) {
    throw new RangeError("Valor fuera de rango seguro");
  }
  return pesos * 100;
}

/**
 * HU-483 & HU-496: Obtiene la fecha calendario local (YYYY-MM-DD) en la zona horaria de la tienda
 * (`America/Bogota`, UTC-5 sin horario de verano), independientemente de la zona del servidor.
 */
export function toLocalCalendarDate(
  isoOrDate: string | Date,
  config: RegionalConfig = DEFAULT_COLOMBIA_REGIONAL_CONFIG
): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${String(isoOrDate)}`);
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(d);
}
