import { describe, it, expect } from "vitest";
import {
  newId,
  isUuidV7,
  canonicalJsonStringify,
  canonicalSha256,
  findMunicipalityByDaneCode,
  calculateNitDv,
  validateNitWithDv,
  DEFAULT_COLOMBIA_TAX_SEEDS,
  calculateCopDenominationsTotalCents,
  validateBarcode,
  computeGs1CheckDigit,
  EventEnvelopeSchema,
  createEventEnvelope,
  CashSessionOpenedV1Schema,
  CashSessionClosedV1Schema,
  CashMovementRecordedV1Schema,
  SaleCompletedV1Schema,
  SaleVoidedV1Schema,
  SaleReturnedV1Schema,
  CustomerCreatedV1Schema,
  AuditRecordedV1Schema,
  POS_UPSTREAM_EVENT_SCHEMAS,
  DOMAIN_EVENT_SCHEMAS,
  BASELINE_CONTRACT_DESCRIPTORS,
  checkBackwardCompatibility,
  generateRustContractsCode,
  generateOpenApiSpec
} from "../index.js";

describe("FT-01.2 — Contratos Compartidos, Semillas Colombia y Generación de Tipos", () => {
  it("HU-151: genera UUIDv7 válidos que mantienen orden lexicográfico creciente en el tiempo", () => {
    const id1 = newId(1_760_000_000_000);
    const id2 = newId(1_760_000_000_001);
    const id3 = newId(1_760_000_000_001);
    expect(isUuidV7(id1)).toBe(true);
    expect(isUuidV7(id2)).toBe(true);
    expect(isUuidV7(id3)).toBe(true);
    expect(id1 < id2).toBe(true);
    expect(id2 < id3).toBe(true);
  });

  it("HU-152 & HU-006: serializa JSON canónicamente (RFC 8785) produciendo el mismo SHA-256 sin importar el orden de llaves y valida EventEnvelope", () => {
    const objA = { b: 1, a: 2, nested: { z: "hola", m: "mundo" } };
    const objB = { nested: { m: "mundo", z: "hola" }, a: 2, b: 1 };

    expect(canonicalJsonStringify(objA)).toBe(canonicalJsonStringify(objB));
    expect(canonicalSha256(objA)).toBe(canonicalSha256(objB));

    const env = createEventEnvelope({
      event_id: newId(),
      event_type: "sale.completed",
      schema_version: 1,
      tenant_id: newId(),
      branch_id: newId(),
      terminal_id: newId(),
      terminal_seq: 101,
      occurred_at: "2026-10-31T15:20:00-05:00",
      hlc: "1761942000000:0001:term-1",
      actor_id: newId(),
      payload: objA
    });

    expect(env.payload_hash).toBe(canonicalSha256(objB));

    // Escenario negativo: secuencia 0 o UUID inválido
    const invalidRes = EventEnvelopeSchema.safeParse({
      ...env,
      terminal_seq: 0,
      event_id: "not-a-uuid"
    });
    expect(invalidRes.success).toBe(false);
  });

  it("HU-007: valida SaleCompletedV1 con pagos mixtos y rechaza si la suma de pagos no coincide con total_cents", () => {
    const validSale = {
      sale_id: newId(),
      receipt_prefix: "C01",
      receipt_number: 42,
      cash_session_id: newId(),
      cashier_id: newId(),
      customer_id: null,
      lines: [
        {
          line_id: newId(),
          line_no: 1,
          product_id: newId(),
          description: "Gaseosa 400ml",
          qty_milli: 2000,
          unit_price_cents: 250_000,
          discount_cents: 0,
          tax_detail: [
            {
              tax_code: "IVA19",
              kind: "PERCENT" as const,
              rate_bp: 1900,
              base_cents: 420_168,
              tax_cents: 79_832
            }
          ],
          line_total_cents: 500_000,
          is_generic_item: false
        }
      ],
      payments: [
        {
          payment_id: newId(),
          method: "CASH" as const,
          amount_cents: 300_000,
          tendered_cents: 500_000,
          change_cents: 200_000,
          reference: null
        },
        {
          payment_id: newId(),
          method: "NEQUI" as const,
          amount_cents: 200_000,
          tendered_cents: null,
          change_cents: null,
          reference: "M48192"
        }
      ],
      totals: {
        subtotal_cents: 420_168,
        discount_cents: 0,
        tax_cents: 79_832,
        rounding_cents: 0,
        total_cents: 500_000
      },
      is_credit: false
    };

    expect(SaleCompletedV1Schema.safeParse(validSale).success).toBe(true);

    const mismatchedPayments = {
      ...validSale,
      payments: [{ ...validSale.payments[0]!, amount_cents: 100_000 }]
    };
    expect(SaleCompletedV1Schema.safeParse(mismatchedPayments).success).toBe(false);
  });

  it("HU-008 & HU-009: genera código Rust de contratos y el verificador BACKWARD bloquea campos obligatorios nuevos o eliminados en la misma versión", () => {
    const rustCode = generateRustContractsCode([...BASELINE_CONTRACT_DESCRIPTORS]);
    expect(rustCode).toContain("pub struct SaleCompletedV1");
    expect(rustCode).toContain("pub receipt_number: i64");

    const baseSale = BASELINE_CONTRACT_DESCRIPTORS[0]!;
    const brokenCandidate = {
      ...baseSale,
      fields: [
        ...baseSale.fields,
        { name: "mandatory_new_field", type: "string" as const, required: true }
      ]
    };
    const violations = checkBackwardCompatibility(baseSale, brokenCandidate);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.kind).toBe("NEW_REQUIRED_FIELD_WITHOUT_VERSION_BUMP");
  });

  it("HU-141: consulta de municipio por código DANE devuelve Bogotá, D.C. (11001) y Medellín (Antioquia) (05001)", () => {
    expect(findMunicipalityByDaneCode("11001")?.displayName).toBe("Bogotá, D.C.");
    expect(findMunicipalityByDaneCode("05001")?.displayName).toBe("Medellín (Antioquia)");
  });

  it("HU-142: calcula exactamente el dígito de verificación de un NIT con Módulo 11 DIAN y rechaza dígitos incorrectos", () => {
    const dv = calculateNitDv("900123456");
    expect(validateNitWithDv("900123456", dv)).toBe(true);
    expect(validateNitWithDv("900123456", (dv + 1) % 10)).toBe(false);
  });

  it("HU-143: semillas de impuestos por defecto contienen IVA19, IVA5, EXENTO, EXCLUIDO, INC8 y BOLSA", () => {
    const codes = DEFAULT_COLOMBIA_TAX_SEEDS.map((t) => t.code);
    expect(codes).toEqual(["IVA19", "IVA5", "EXENTO", "EXCLUIDO", "INC8", "BOLSA"]);
  });

  it("HU-144: suma de 8 billetes de $50.000 y 15 monedas de $1.000 da exactamente $415.000 (41.500.000 centavos)", () => {
    const totalCents = calculateCopDenominationsTotalCents({
      BILL_50000: 8,
      COIN_1000: 15
    });
    expect(totalCents).toBe(41_500_000);
  });

  it("HU-145 & HU-146: valida apertura/cierre de turno (difference_cents exacto) y rechaza movimientos de caja sin motivo", () => {
    expect(
      CashSessionOpenedV1Schema.safeParse({
        cash_session_id: newId(),
        opened_by: newId(),
        opened_at: "2026-10-31T07:00:00-05:00",
        opening_float_cents: 10_000_000
      }).success
    ).toBe(true);

    const closedOk = CashSessionClosedV1Schema.safeParse({
      cash_session_id: newId(),
      closed_by: newId(),
      closed_at: "2026-10-31T21:00:00-05:00",
      opening_float_cents: 10_000_000,
      expected_cash_cents: 34_250_000,
      declared_cash_cents: 34_000_000,
      difference_cents: -250_000,
      declared_denominations: { BILL_50000: 6, BILL_20000: 2 }
    });
    expect(closedOk.success).toBe(true);

    const badMovement = CashMovementRecordedV1Schema.safeParse({
      movement_id: newId(),
      cash_session_id: newId(),
      kind: "CASH_OUT",
      amount_cents: 500_000,
      reason: "  ",
      approved_by: null,
      created_by: newId(),
      occurred_at: "2026-10-31T12:00:00-05:00"
    });
    expect(badMovement.success).toBe(false);
  });

  it("HU-147, HU-148 & HU-149: valida devoluciones (aprobador != solicitante salvo self_approved), Habeas Data en alta de cliente y hash SHA-256 en auditoría", () => {
    const userA = newId();
    const userB = newId();

    expect(
      SaleVoidedV1Schema.safeParse({
        return_id: newId(),
        original_sale_id: newId(),
        cash_session_id: newId(),
        requested_by: userA,
        approved_by: userA,
        self_approved: false,
        reason: "Error en cobro",
        refund_total_cents: 500_000,
        refund_method: "CASH",
        occurred_at: "2026-10-31T12:00:00-05:00"
      }).success
    ).toBe(false);

    expect(
      SaleReturnedV1Schema.safeParse({
        return_id: newId(),
        original_sale_id: newId(),
        cash_session_id: newId(),
        kind: "PARTIAL_RETURN",
        requested_by: userA,
        approved_by: userB,
        reason: "Producto abollado",
        lines: [{ product_id: newId(), qty_milli: 1000, refund_line_cents: 250_000 }],
        refund_total_cents: 250_000,
        refund_method: "CASH",
        occurred_at: "2026-10-31T12:00:00-05:00"
      }).success
    ).toBe(true);

    // HU-148: Cliente con teléfono pero sin data_consent_at falla por Habeas Data
    expect(
      CustomerCreatedV1Schema.safeParse({
        customer_id: newId(),
        full_name: "Marta Gómez",
        alias: "Doña Marta",
        doc_type: null,
        doc_number: null,
        phone: "3105551234",
        email: null,
        data_consent_at: null,
        created_at: "2026-10-31T12:00:00-05:00"
      }).success
    ).toBe(false);

    // HU-149: AuditRecordedV1 exige hash de 64 hex
    expect(
      AuditRecordedV1Schema.safeParse({
        audit_id: newId(),
        action: "cart.item.remove_after_scan",
        actor_id: userA,
        approved_by: null,
        entity_type: "product",
        entity_id: newId(),
        data: { price_cents: 1200000 },
        occurred_at: "2026-10-31T12:00:00-05:00",
        prev_hash: null,
        hash: "a".repeat(64)
      }).success
    ).toBe(true);
  });

  it("HU-150, HU-482 & HU-497: todos los tópicos de dominio tienen esquema, el validador EAN-13 verifica módulo 10 y OpenAPI 3.1 se genera completo", () => {
    expect(Object.keys(POS_UPSTREAM_EVENT_SCHEMAS)).toHaveLength(11);
    expect(Object.keys(DOMAIN_EVENT_SCHEMAS).length).toBeGreaterThanOrEqual(12);

    const check = computeGs1CheckDigit("770200400350");
    const validEan = `770200400350${check}`;
    expect(validateBarcode(validEan).valid).toBe(true);

    const badEan = `770200400350${(check + 1) % 10}`;
    const badRes = validateBarcode(badEan);
    expect(badRes.valid).toBe(false);
    expect(badRes.warning).toContain("EAN-13");

    const openApi = generateOpenApiSpec();
    expect(openApi.openapi).toBe("3.1.0");
    expect(Object.keys(openApi.paths).length).toBeGreaterThanOrEqual(25);
  });
});
