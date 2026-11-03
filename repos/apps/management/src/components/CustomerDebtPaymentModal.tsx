import React, { useState, useId } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View, TextInput, ScrollView } from "react-native";
import Banknote from "lucide-react-native/icons/banknote";
import CircleCheck from "lucide-react-native/icons/circle-check";
import AlertTriangle from "lucide-react-native/icons/triangle-alert";
import Printer from "lucide-react-native/icons/printer";
import X from "lucide-react-native/icons/x";
import ShieldCheck from "lucide-react-native/icons/shield-check";

export type PaymentMethod = "CASH" | "DEBIT" | "CREDIT_CARD" | "NEQUI" | "DAVIPLATA" | "BRE_B" | "TRANSFER";

export interface FiadoCustomerPaymentData {
  id: string;
  name: string;
  docNumber: string;
  phone: string;
  balanceCents: number;
}

export interface PaymentReceiptResult {
  receiptNumber: string;
  customerId: string;
  customerName: string;
  previousBalanceCents: number;
  amountPaidCents: number;
  newBalanceCents: number;
  method: PaymentMethod;
  reference?: string | null;
  receivedBy: string;
  occurredAt: string;
  legalNotice: string;
}

export interface CustomerDebtPaymentModalProps {
  visible: boolean;
  customer: FiadoCustomerPaymentData | null;
  storeName?: string;
  onClose: () => void;
  onConfirmPayment: (params: {
    customerId: string;
    amountCents: number;
    method: PaymentMethod;
    reference?: string;
  }) => Promise<PaymentReceiptResult>;
}

export function CustomerDebtPaymentModal({
  visible,
  customer,
  storeName = "Tienda La Esmeralda",
  onClose,
  onConfirmPayment
}: CustomerDebtPaymentModalProps) {
  const [amountStr, setAmountStr] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState<boolean>(false);
  const [receipt, setReceipt] = useState<PaymentReceiptResult | null>(null);

  const titleId = useId();

  if (!visible || !customer) return null;

  const maxBalanceCents = customer.balanceCents;
  const parsedAmountCop = parseInt(amountStr.replace(/\D/g, "") || "0", 10);
  const enteredAmountCents = parsedAmountCop * 100;

  const isExceeding = enteredAmountCents > maxBalanceCents;
  const isZeroOrNegative = enteredAmountCents <= 0;
  const isValid = !isZeroOrNegative && !isExceeding;

  const handlePreset = (cents: number) => {
    setTouched(true);
    setErrorMessage(null);
    const capped = Math.min(cents, maxBalanceCents);
    setAmountStr((capped / 100).toLocaleString("es-CO"));
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!isValid) {
      if (isZeroOrNegative) {
        setErrorMessage("El valor del abono debe ser mayor a cero.");
      } else if (isExceeding) {
        setErrorMessage(
          `El abono no puede superar la deuda total pendiente ($${(maxBalanceCents / 100).toLocaleString("es-CO")} COP).`
        );
      }
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await onConfirmPayment({
        customerId: customer.id,
        amountCents: enteredAmountCents,
        method,
        reference: reference.trim() || undefined
      });
      setReceipt(res);
    } catch (err: any) {
      setErrorMessage(err.message || "Error al procesar el abono a cartera.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setAmountStr("");
    setMethod("CASH");
    setReference("");
    setReceipt(null);
    setErrorMessage(null);
    setTouched(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      testID="customer-debt-payment-modal"
    >
      <View style={styles.backdrop}>
        <View
          style={styles.modalCard}
          accessibilityRole="dialog"
          accessibilityLabel={receipt ? "Recibo de Abono a Cartera" : "Registrar Abono a Cartera de Fiado"}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Banknote size={20} color="#15803d" aria-hidden />
              <Text id={titleId} style={styles.title}>
                {receipt ? "Comprobante de Abono Emitido" : "Registrar Abono a Cartera"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Cerrar ventana"
            >
              <X size={18} color="#64748b" aria-hidden />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
            {receipt ? (
              /* Vista del Recibo de Abono */
              <View style={styles.receiptContainer} testID="payment-receipt-view">
                <View style={styles.receiptHeader}>
                  <CircleCheck size={36} color="#16a34a" aria-hidden />
                  <Text style={styles.receiptSuccessText}>¡Abono Registrado con Éxito!</Text>
                  <Text style={styles.receiptNumberText}>{receipt.receiptNumber}</Text>
                  <Text style={styles.receiptStoreText}>{storeName}</Text>
                </View>

                <View style={styles.receiptVoucher}>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Cliente:</Text>
                    <Text style={styles.voucherValue}>{receipt.customerName}</Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Documento:</Text>
                    <Text style={styles.voucherValue}>{customer.docNumber}</Text>
                  </View>
                  <View style={styles.voucherDivider} />
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Saldo Anterior:</Text>
                    <Text style={styles.voucherValue}>
                      ${(receipt.previousBalanceCents / 100).toLocaleString("es-CO")} COP
                    </Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={[styles.voucherLabel, { color: "#16a34a", fontWeight: "700" }]}>
                      Valor Abonado:
                    </Text>
                    <Text style={[styles.voucherValue, { color: "#16a34a", fontWeight: "700", fontSize: 16 }]}>
                      - ${(receipt.amountPaidCents / 100).toLocaleString("es-CO")} COP
                    </Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={[styles.voucherLabel, { fontWeight: "700" }]}>Nuevo Saldo Pendiente:</Text>
                    <Text
                      style={[
                        styles.voucherValue,
                        {
                          fontWeight: "800",
                          color: receipt.newBalanceCents === 0 ? "#16a34a" : "#dc2626"
                        }
                      ]}
                    >
                      ${(receipt.newBalanceCents / 100).toLocaleString("es-CO")} COP
                    </Text>
                  </View>
                  <View style={styles.voucherDivider} />
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Medio de Pago:</Text>
                    <Text style={styles.voucherValue}>{receipt.method}</Text>
                  </View>
                  {receipt.reference ? (
                    <View style={styles.voucherRow}>
                      <Text style={styles.voucherLabel}>Referencia / Transacción:</Text>
                      <Text style={styles.voucherValue}>{receipt.reference}</Text>
                    </View>
                  ) : null}
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Fecha y Hora:</Text>
                    <Text style={styles.voucherValue}>
                      {new Date(receipt.occurredAt).toLocaleString("es-CO")}
                    </Text>
                  </View>
                  <View style={styles.voucherRow}>
                    <Text style={styles.voucherLabel}>Cajero / Recibido por:</Text>
                    <Text style={styles.voucherValue}>{receipt.receivedBy}</Text>
                  </View>

                  <View style={styles.legalNoticeBox}>
                    <ShieldCheck size={14} color="#64748b" aria-hidden />
                    <Text style={styles.legalNoticeText}>{receipt.legalNotice}</Text>
                  </View>
                </View>

                <View style={styles.receiptActions}>
                  <TouchableOpacity
                    style={styles.printBtn}
                    onPress={() => {
                      alert(`✓ Tiquete térmico ${receipt.receiptNumber} enviado a impresora ESC/POS 80mm.`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Imprimir tiquete de abono"
                  >
                    <Printer size={16} color="#ffffff" aria-hidden />
                    <Text style={styles.printBtnText}>Imprimir Recibo Térmico</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.finishBtn}
                    onPress={handleClose}
                    accessibilityRole="button"
                    accessibilityLabel="Finalizar y cerrar"
                  >
                    <Text style={styles.finishBtnText}>Finalizar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Formulario de Registro de Abono */
              <View>
                {/* Resumen del Cliente */}
                <View style={styles.customerSummaryCard}>
                  <View>
                    <Text style={styles.customerSummaryName}>{customer.name}</Text>
                    <Text style={styles.customerSummaryMeta}>
                      CC: {customer.docNumber} • Tel: {customer.phone}
                    </Text>
                  </View>
                  <View style={styles.customerSummaryBalance}>
                    <Text style={styles.balanceLabel}>Deuda Total Actual:</Text>
                    <Text style={styles.balanceValue}>
                      ${(maxBalanceCents / 100).toLocaleString("es-CO")} COP
                    </Text>
                  </View>
                </View>

                {/* Input de Valor a Abonar */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Monto del Abono (COP):</Text>
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputPrefix}>$</Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        touched && !isValid && styles.textInputError
                      ]}
                      placeholder="0"
                      keyboardType="numeric"
                      value={amountStr}
                      onChangeText={(val) => {
                        setTouched(true);
                        setErrorMessage(null);
                        const clean = val.replace(/\D/g, "");
                        setAmountStr(clean ? parseInt(clean, 10).toLocaleString("es-CO") : "");
                      }}
                      testID="input-payment-amount"
                      accessibilityLabel="Monto del abono en pesos colombianos"
                    />
                    <Text style={styles.inputSuffix}>COP</Text>
                  </View>

                  {/* Botones de Montos Rápidos / Presets */}
                  <View style={styles.presetRow}>
                    <TouchableOpacity
                      style={styles.presetBtn}
                      onPress={() => handlePreset(1000000)}
                    >
                      <Text style={styles.presetBtnText}>+$10.000</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.presetBtn}
                      onPress={() => handlePreset(2000000)}
                    >
                      <Text style={styles.presetBtnText}>+$20.000</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.presetBtn}
                      onPress={() => handlePreset(5000000)}
                    >
                      <Text style={styles.presetBtnText}>+$50.000</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.presetBtn, styles.presetBtnFull]}
                      onPress={() => handlePreset(maxBalanceCents)}
                    >
                      <Text style={[styles.presetBtnText, styles.presetBtnFullText]}>
                        Pagar Todo ($
                        {(maxBalanceCents / 100).toLocaleString("es-CO")})
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {touched && isExceeding ? (
                    <View style={styles.errorBanner}>
                      <AlertTriangle size={14} color="#dc2626" aria-hidden />
                      <Text style={styles.errorText}>
                        El monto supera la deuda actual (${(maxBalanceCents / 100).toLocaleString("es-CO")} COP).
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Selector de Medio de Pago */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Medio de Pago:</Text>
                  <View style={styles.methodGrid}>
                    {(
                      [
                        { id: "CASH", label: "💵 Efectivo" },
                        { id: "NEQUI", label: "📱 Nequi" },
                        { id: "DAVIPLATA", label: "🔴 Daviplata" },
                        { id: "BRE_B", label: "⚡ Bre-B" },
                        { id: "TRANSFER", label: "🏦 Transferencia" }
                      ] as const
                    ).map((m) => {
                      const isSelected = method === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.methodBtn, isSelected && styles.methodBtnActive]}
                          onPress={() => setMethod(m.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[
                              styles.methodBtnText,
                              isSelected && styles.methodBtnTextActive
                            ]}
                          >
                            {m.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Referencia o Comprobante Digital (Opcional) */}
                {method !== "CASH" && (
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>
                      Número de Referencia / Comprobante (opcional):
                    </Text>
                    <TextInput
                      style={styles.textInputStandard}
                      placeholder="Ej. M1234567 o # de aprobación"
                      value={reference}
                      onChangeText={setReference}
                      testID="input-payment-reference"
                      accessibilityLabel="Número de referencia de pago digital"
                    />
                  </View>
                )}

                {/* Previsualización del Saldo Remanente */}
                {isValid && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewLabel}>Nuevo Saldo Tras el Abono:</Text>
                    <Text
                      style={[
                        styles.previewValue,
                        maxBalanceCents - enteredAmountCents === 0 ? styles.textZero : styles.textRemaining
                      ]}
                    >
                      ${((maxBalanceCents - enteredAmountCents) / 100).toLocaleString("es-CO")} COP
                      {maxBalanceCents - enteredAmountCents === 0 ? " (¡Deuda Saldada Totalmente!)" : ""}
                    </Text>
                  </View>
                )}

                {errorMessage ? (
                  <View style={styles.errorBanner}>
                    <AlertTriangle size={14} color="#dc2626" aria-hidden />
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                ) : null}

                {/* Acciones */}
                <View style={styles.footerActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={handleClose}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.confirmBtn, (!isValid || isSubmitting) && styles.btnDisabled]}
                    onPress={handleSubmit}
                    disabled={!isValid || isSubmitting}
                    testID="btn-confirm-payment"
                  >
                    <Banknote size={16} color="#ffffff" aria-hidden />
                    <Text style={styles.confirmBtnText}>
                      {isSubmitting ? "Procesando..." : "Registrar Abono"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
    maxHeight: "90%"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#f8fafc"
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  title: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: "#0f172a",
    letterSpacing: -0.3
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#e2e8f0"
  },
  body: {
    padding: 20
  },
  customerSummaryCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16
  },
  customerSummaryName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: "#0f172a"
  },
  customerSummaryMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2
  },
  customerSummaryBalance: {
    alignItems: "flex-end"
  },
  balanceLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600"
  },
  balanceValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: "#dc2626"
  },
  fieldGroup: {
    marginBottom: 16
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff"
  },
  inputPrefix: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginRight: 6
  },
  textInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 10
  },
  textInputError: {
    color: "#dc2626"
  },
  inputSuffix: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b"
  },
  textInputStandard: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#ffffff"
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8
  },
  presetBtn: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155"
  },
  presetBtnFull: {
    backgroundColor: "#e0f2fe",
    borderColor: "#bae6fd"
  },
  presetBtnFullText: {
    color: "#0284c7"
  },
  methodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  methodBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc"
  },
  methodBtnActive: {
    backgroundColor: "#dcfce7",
    borderColor: "#16a34a"
  },
  methodBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569"
  },
  methodBtnTextActive: {
    color: "#15803d"
  },
  previewBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  previewLabel: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600"
  },
  previewValue: {
    fontSize: 14,
    fontWeight: "700"
  },
  textRemaining: {
    color: "#dc2626"
  },
  textZero: {
    color: "#16a34a"
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 10,
    borderRadius: 8,
    marginBottom: 14
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    flex: 1
  },
  footerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1"
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b"
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff"
  },
  btnDisabled: {
    opacity: 0.5
  },
  /* Estilos del Recibo */
  receiptContainer: {
    alignItems: "center"
  },
  receiptHeader: {
    alignItems: "center",
    marginBottom: 16
  },
  receiptSuccessText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: "#16a34a",
    marginTop: 8
  },
  receiptNumberText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 2
  },
  receiptStoreText: {
    fontSize: 12,
    color: "#64748b"
  },
  receiptVoucher: {
    width: "100%",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16
  },
  voucherRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 4
  },
  voucherLabel: {
    fontSize: 12,
    color: "#64748b"
  },
  voucherValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a"
  },
  voucherDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 8
  },
  legalNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 8,
    borderRadius: 6,
    marginTop: 12
  },
  legalNoticeText: {
    fontSize: 10,
    color: "#64748b",
    flex: 1
  },
  receiptActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    justifyContent: "flex-end"
  },
  printBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0284c7",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  printBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff"
  },
  finishBtn: {
    backgroundColor: "#334155",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8
  },
  finishBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff"
  }
});
