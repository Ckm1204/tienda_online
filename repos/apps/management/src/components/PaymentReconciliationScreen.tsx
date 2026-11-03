import React, { useState, useMemo } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import Smartphone from "lucide-react-native/icons/smartphone";
import CreditCard from "lucide-react-native/icons/credit-card";
import Building from "lucide-react-native/icons/building";
import Search from "lucide-react-native/icons/search";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";
import Clock from "lucide-react-native/icons/clock";
import CircleCheck from "lucide-react-native/icons/circle-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";

export type DigitalPaymentMethod = "NEQUI" | "DAVIPLATA" | "BRE_B" | "TRANSFER" | "CARD";
export type ReconciliationStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface DigitalPaymentItem {
  paymentId: string;
  saleId: string;
  receiptCode: string | null;
  method: DigitalPaymentMethod | string;
  amountCents: number;
  reference: string | null;
  status: ReconciliationStatus;
  reconciledBy: string | null;
  branchId: string;
  cashSessionId: string;
  occurredAtMs: number;
}

export interface PaymentReconciliationScreenProps {
  initialPayments?: DigitalPaymentItem[];
  onReconcileBatch?: (paymentIds: string[], status: "CONFIRMED" | "FAILED") => Promise<void> | void;
  loading?: boolean;
}

const DEFAULT_PAYMENTS: DigitalPaymentItem[] = [
  {
    paymentId: "pay-nq-001",
    saleId: "sale-8101",
    receiptCode: "POS-001201",
    method: "NEQUI",
    amountCents: 4500000, // $45.000 COP
    reference: "M102938",
    status: "PENDING",
    reconciledBy: null,
    branchId: "branch-main",
    cashSessionId: "session-01",
    occurredAtMs: Date.now() - 3600000 * 2
  },
  {
    paymentId: "pay-dv-002",
    saleId: "sale-8102",
    receiptCode: "POS-001202",
    method: "DAVIPLATA",
    amountCents: 2850000, // $28.500 COP
    reference: "D883712",
    status: "PENDING",
    reconciledBy: null,
    branchId: "branch-main",
    cashSessionId: "session-01",
    occurredAtMs: Date.now() - 3600000 * 3
  },
  {
    paymentId: "pay-bb-003",
    saleId: "sale-8103",
    receiptCode: "POS-001203",
    method: "BRE_B",
    amountCents: 6200000, // $62.000 COP
    reference: "BRB-99120",
    status: "CONFIRMED",
    reconciledBy: "usr-owner-001",
    branchId: "branch-main",
    cashSessionId: "session-01",
    occurredAtMs: Date.now() - 3600000 * 5
  },
  {
    paymentId: "pay-tr-004",
    saleId: "sale-8104",
    receiptCode: "POS-001204",
    method: "TRANSFER",
    amountCents: 12000000, // $120.000 COP
    reference: "BC-672910",
    status: "PENDING",
    reconciledBy: null,
    branchId: "branch-main",
    cashSessionId: "session-01",
    occurredAtMs: Date.now() - 3600000 * 6
  }
];

export function PaymentReconciliationScreen({
  initialPayments = DEFAULT_PAYMENTS,
  onReconcileBatch,
  loading = false
}: PaymentReconciliationScreenProps) {
  const [payments, setPayments] = useState<DigitalPaymentItem[]>(initialPayments);
  const [statusFilter, setStatusFilter] = useState<"ALL" | ReconciliationStatus>("ALL");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Totales en centavos
  const pendingTotalCents = useMemo(
    () => payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amountCents, 0),
    [payments]
  );
  const confirmedTotalCents = useMemo(
    () => payments.filter((p) => p.status === "CONFIRMED").reduce((s, p) => s + p.amountCents, 0),
    [payments]
  );

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (methodFilter !== "ALL" && p.method !== methodFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const refMatch = p.reference?.toLowerCase().includes(q);
        const codeMatch = p.receiptCode?.toLowerCase().includes(q);
        if (!refMatch && !codeMatch) return false;
      }
      return true;
    });
  }, [payments, statusFilter, methodFilter, searchQuery]);

  const allFilteredSelected =
    filteredPayments.length > 0 && filteredPayments.every((p) => selectedIds.includes(p.paymentId));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPayments.map((p) => p.paymentId));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchAction = async (status: "CONFIRMED" | "FAILED") => {
    if (selectedIds.length === 0) return;

    if (onReconcileBatch) {
      await onReconcileBatch(selectedIds, status);
    }

    setPayments((prev) =>
      prev.map((p) =>
        selectedIds.includes(p.paymentId)
          ? { ...p, status, reconciledBy: "usr-owner-001" }
          : p
      )
    );

    const count = selectedIds.length;
    setSelectedIds([]);
    setFeedbackMessage(
      status === "CONFIRMED"
        ? `Se confirmaron ${count} pago(s) digital(es) exitosamente.`
        : `Se marcaron como no recibidos ${count} pago(s).`
    );
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const formatCOP = (cents: number) => {
    return "$" + (cents / 100).toLocaleString("es-CO");
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case "NEQUI":
        return { label: "Nequi", bg: "#7000FF15", color: "#7000FF", icon: Smartphone };
      case "DAVIPLATA":
        return { label: "Daviplata", bg: "#ED1C2415", color: "#ED1C24", icon: Smartphone };
      case "BRE_B":
        return { label: "Bre-B (Interoperable)", bg: "#0284C715", color: "#0284C7", icon: CreditCard };
      case "CARD":
        return { label: "Datáfono / Tarjeta", bg: "#10B98115", color: "#10B981", icon: CreditCard };
      default:
        return { label: "Transferencia", bg: "#64748B15", color: "#64748B", icon: Building };
    }
  };

  return (
    <View style={styles.container} testID="reconciliation-screen">
      {/* Encabezado */}
      <View style={styles.header}>
        <View>
          <Text role="heading" style={styles.title}>
            Conciliación de Pagos Digitales
          </Text>
          <Text style={styles.subtitle}>
            Verifica y confirma transferencias de Nequi, Daviplata y Bre-B contra los extractos de tus apps
          </Text>
        </View>
      </View>

      {/* Banner de Retroalimentación */}
      {feedbackMessage && (
        <View style={styles.alertBanner} testID="reconciliation-alert">
          <CircleCheck size={18} color="#10B981" />
          <Text style={styles.alertText}>{feedbackMessage}</Text>
        </View>
      )}

      {/* Tarjetas de Resumen Financiero */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, styles.metricCardPending]}>
          <View style={styles.metricHeader}>
            <Clock size={18} color="#D97706" />
            <Text style={styles.metricLabel}>Por Verificar en Banco</Text>
          </View>
          <Text style={styles.metricValue}>{formatCOP(pendingTotalCents)} COP</Text>
          <Text style={styles.metricSub}>
            {payments.filter((p) => p.status === "PENDING").length} transacciones pendientes
          </Text>
        </View>

        <View style={[styles.metricCard, styles.metricCardConfirmed]}>
          <View style={styles.metricHeader}>
            <CircleCheck size={18} color="#059669" />
            <Text style={styles.metricLabel}>Total Conciliado y Verificado</Text>
          </View>
          <Text style={styles.metricValue}>{formatCOP(confirmedTotalCents)} COP</Text>
          <Text style={styles.metricSub}>
            {payments.filter((p) => p.status === "CONFIRMED").length} transacciones confirmadas
          </Text>
        </View>
      </View>

      {/* Barra de Filtros y Búsqueda */}
      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <Search size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por referencia M102..., código POS-001..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Buscar pagos digitales"
          />
        </View>

        {/* Filtros de Estado */}
        <View style={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, statusFilter === "ALL" && styles.chipActive]}
            onPress={() => setStatusFilter("ALL")}
            testID="filter-all"
          >
            <Text style={[styles.chipText, statusFilter === "ALL" && styles.chipTextActive]}>
              Todos ({payments.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === "PENDING" && styles.chipActivePending]}
            onPress={() => setStatusFilter("PENDING")}
            testID="filter-pending"
          >
            <Text style={[styles.chipText, statusFilter === "PENDING" && styles.chipTextActivePending]}>
              Pendientes ({payments.filter((p) => p.status === "PENDING").length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === "CONFIRMED" && styles.chipActiveConfirmed]}
            onPress={() => setStatusFilter("CONFIRMED")}
            testID="filter-confirmed"
          >
            <Text style={[styles.chipText, statusFilter === "CONFIRMED" && styles.chipTextActiveConfirmed]}>
              Confirmados ({payments.filter((p) => p.status === "CONFIRMED").length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de Acciones Masivas */}
      {selectedIds.length > 0 && (
        <View style={styles.batchActionBar} testID="batch-actions-bar">
          <Text style={styles.batchActionCount}>
            {selectedIds.length} seleccionado(s)
          </Text>
          <View style={styles.batchButtons}>
            <TouchableOpacity
              style={styles.btnConfirmBatch}
              onPress={() => handleBatchAction("CONFIRMED")}
              disabled={loading}
              testID="btn-batch-confirm"
            >
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.btnConfirmBatchText}>Confirmar en Lote</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnRejectBatch}
              onPress={() => handleBatchAction("FAILED")}
              disabled={loading}
              testID="btn-batch-reject"
            >
              <X size={16} color="#DC2626" />
              <Text style={styles.btnRejectBatchText}>Rechazar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tabla Accesible conforme a Modern Web Guidance (responsive-table) */}
      <View
        tabIndex={0}
        role="region"
        aria-label="Tabla de conciliación de pagos digitales"
        style={styles.tableWrapper as any}
      >
        <table style={tableStyles.htmlTable}>
          <thead style={tableStyles.tableHeader}>
            <tr>
              <th style={{ width: 44, textAlign: "center", padding: "12px 8px" }}>
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  aria-label="Seleccionar todos los pagos digitales"
                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#059669" }}
                />
              </th>
              <th style={tableStyles.thCell}>Método</th>
              <th style={tableStyles.thCell}>Comprobante</th>
              <th style={tableStyles.thCell}>Referencia</th>
              <th style={tableStyles.thCell}>Monto</th>
              <th style={tableStyles.thCell}>Estado</th>
              <th style={tableStyles.thCell}>Fecha/Hora</th>
              <th style={{ ...tableStyles.thCell, textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={8} style={tableStyles.emptyCell}>
                  No se encontraron pagos con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredPayments.map((p) => {
                const badge = getMethodBadge(p.method);
                const IconComponent = badge.icon;
                const isSelected = selectedIds.includes(p.paymentId);

                return (
                  <tr
                    key={p.paymentId}
                    style={{
                      ...tableStyles.trRow,
                      backgroundColor: isSelected ? "rgba(16, 185, 129, 0.08)" : undefined
                    }}
                  >
                    <td style={{ textAlign: "center", padding: "12px 8px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(p.paymentId)}
                        aria-label={`Seleccionar pago ${p.reference || p.paymentId}`}
                        style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#059669" }}
                      />
                    </td>
                    <td style={tableStyles.tdCell}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 8px",
                          borderRadius: 6,
                          backgroundColor: badge.bg,
                          color: badge.color,
                          fontWeight: 600,
                          fontSize: "0.82rem"
                        }}
                      >
                        <IconComponent size={14} color={badge.color} />
                        {badge.label}
                      </span>
                    </td>
                    <td style={tableStyles.tdCell}>
                      <span style={{ fontWeight: 600, color: "#1E293B" }}>
                        {p.receiptCode || "S/N"}
                      </span>
                    </td>
                    <td style={tableStyles.tdCell}>
                      <span style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "#334155" }}>
                        {p.reference || "Sin Ref"}
                      </span>
                    </td>
                    <td style={tableStyles.tdCell}>
                      <span style={{ fontWeight: 700, color: "#0F172A", fontSize: "0.95rem" }}>
                        {formatCOP(p.amountCents)}
                      </span>
                    </td>
                    <td style={tableStyles.tdCell}>
                      {p.status === "PENDING" && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            borderRadius: 9999,
                            backgroundColor: "#FEF3C7",
                            color: "#92400E",
                            fontSize: "0.75rem",
                            fontWeight: 600
                          }}
                        >
                          <Clock size={12} color="#92400E" />
                          Pendiente
                        </span>
                      )}
                      {p.status === "CONFIRMED" && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            borderRadius: 9999,
                            backgroundColor: "#DCFCE7",
                            color: "#166534",
                            fontSize: "0.75rem",
                            fontWeight: 600
                          }}
                        >
                          <Check size={12} color="#166534" />
                          Verificado
                        </span>
                      )}
                      {p.status === "FAILED" && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 8px",
                            borderRadius: 9999,
                            backgroundColor: "#FEE2E2",
                            color: "#991B1B",
                            fontSize: "0.75rem",
                            fontWeight: 600
                          }}
                        >
                          <X size={12} color="#991B1B" />
                          Rechazado
                        </span>
                      )}
                    </td>
                    <td style={tableStyles.tdCell}>
                      <span style={{ fontSize: "0.8rem", color: "#64748B" }}>
                        {new Date(p.occurredAtMs).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    </td>
                    <td style={{ ...tableStyles.tdCell, textAlign: "right" }}>
                      {p.status === "PENDING" && (
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIds([p.paymentId]);
                              handleBatchAction("CONFIRMED");
                            }}
                            title="Confirmar recepción"
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#059669",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: "0.8rem"
                            }}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIds([p.paymentId]);
                              handleBatchAction("FAILED");
                            }}
                            title="Rechazar"
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#EF4444",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: "0.8rem"
                            }}
                          >
                            ✗
                          </button>
                        </div>
                      )}
                      {p.status === "CONFIRMED" && (
                        <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 500 }}>
                          Conciliado
                        </span>
                      )}
                      {p.status === "FAILED" && (
                        <span style={{ fontSize: "0.75rem", color: "#DC2626", fontWeight: 500 }}>
                          No recibido
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
  },
  header: {
    marginBottom: 16
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A"
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16
  },
  alertText: {
    fontSize: 14,
    color: "#065F46",
    fontWeight: "500"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap"
  },
  metricCard: {
    flex: 1,
    minWidth: 260,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1
  },
  metricCardPending: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A"
  },
  metricCardConfirmed: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0"
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569"
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5
  },
  metricSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap"
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    flex: 1,
    minWidth: 260
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A"
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  chipActive: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A"
  },
  chipActivePending: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B"
  },
  chipActiveConfirmed: {
    backgroundColor: "#DCFCE7",
    borderColor: "#10B981"
  },
  chipText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500"
  },
  chipTextActive: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  chipTextActivePending: {
    color: "#B45309",
    fontWeight: "600"
  },
  chipTextActiveConfirmed: {
    color: "#15803D",
    fontWeight: "600"
  },
  batchActionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14
  },
  batchActionCount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B"
  },
  batchButtons: {
    flexDirection: "row",
    gap: 8
  },
  btnConfirmBatch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#059669",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6
  },
  btnConfirmBatchText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600"
  },
  btnRejectBatch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEE2E2",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FECACA"
  },
  btnRejectBatchText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "600"
  },
  tableWrapper: {
    overflow: "scroll",
    maxWidth: "100%",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF"
  }
});

const tableStyles: Record<string, React.CSSProperties> = {
  htmlTable: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0
  },
  tableHeader: {
    position: "sticky",
    insetBlockStart: 0,
    zIndex: 1,
    backgroundColor: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0"
  },
  thCell: {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "#475569",
    borderBottom: "1px solid #E2E8F0",
    letterSpacing: "0.3px"
  },
  trRow: {
    borderBottom: "1px solid #F1F5F9",
    transition: "background-color 0.15s ease"
  },
  tdCell: {
    padding: "12px 14px",
    fontSize: "0.88rem",
    color: "#334155",
    borderBottom: "1px solid #F1F5F9"
  },
  emptyCell: {
    textAlign: "center",
    padding: 32,
    color: "#94A3B8",
    fontSize: "0.9rem"
  }
};
