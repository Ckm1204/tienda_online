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
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import DollarSign from "lucide-react-native/icons/dollar-sign";

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

export interface CashSessionItem {
  id: string;
  branchId: string;
  terminalId: string;
  cashierName: string;
  openingFloatCents: number;
  serverExpectedCashCents: number;
  terminalReportedExpectedCents: number | null;
  declaredCashCents: number | null;
  differenceCents: number | null;
  status: "OPEN" | "CLOSED" | "FORCE_CLOSED";
  reviewNote: string | null;
  reviewedBy?: string | null;
  occurredAtMs: number;
}

export interface PaymentReconciliationScreenProps {
  initialPayments?: DigitalPaymentItem[];
  initialCashSessions?: CashSessionItem[];
  onReconcileBatch?: (paymentIds: string[], status: "CONFIRMED" | "FAILED") => Promise<void> | void;
  onForceCloseCashSession?: (sessionId: string, reason: string) => Promise<void> | void;
  onReviewCashDiscrepancy?: (sessionId: string, note: string) => Promise<void> | void;
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
    occurredAtMs: Date.now() - 3600000 * 1.5
  },
  {
    paymentId: "pay-br-003",
    saleId: "sale-8103",
    receiptCode: "POS-001203",
    method: "BRE_B",
    amountCents: 1500000, // $15.000 COP
    reference: "BRE-99120",
    status: "CONFIRMED",
    reconciledBy: "emp-supervisor",
    branchId: "branch-main",
    cashSessionId: "session-01",
    occurredAtMs: Date.now() - 3600000 * 3
  },
  {
    paymentId: "pay-cd-004",
    saleId: "sale-8104",
    receiptCode: "POS-001204",
    method: "CARD",
    amountCents: 6200000, // $62.000 COP
    reference: "VOUCHER-491",
    status: "CONFIRMED",
    reconciledBy: "emp-supervisor",
    branchId: "branch-sucursal-norte",
    cashSessionId: "session-02",
    occurredAtMs: Date.now() - 3600000 * 4
  }
];

const DEFAULT_SESSIONS: CashSessionItem[] = [
  {
    id: "cash-sess-turn-01",
    branchId: "branch-main",
    terminalId: "Caja Principal (POS-01)",
    cashierName: "Carlos Pérez (Cajero)",
    openingFloatCents: 10000000, // $100.000 COP
    serverExpectedCashCents: 45000000, // $450.000 COP
    terminalReportedExpectedCents: 45000000,
    declaredCashCents: 44500000, // $445.000 COP -> Faltante -$5.000
    differenceCents: -500000,
    status: "CLOSED",
    reviewNote: null,
    occurredAtMs: Date.now() - 3600000 * 5
  },
  {
    id: "cash-sess-turn-02",
    branchId: "branch-sucursal-norte",
    terminalId: "Caja Express Norte (POS-02)",
    cashierName: "Laura Rincón (Cajera)",
    openingFloatCents: 5000000, // $50.000 COP
    serverExpectedCashCents: 18500000, // $185.000 COP
    terminalReportedExpectedCents: null,
    declaredCashCents: null,
    differenceCents: null,
    status: "OPEN",
    reviewNote: null,
    occurredAtMs: Date.now() - 3600000 * 2
  }
];

function formatCOP(cents: number): string {
  const isNeg = cents < 0;
  const abs = Math.abs(cents);
  const rounded = Math.round(abs / 5000) * 50;
  const formatted = "$" + rounded.toLocaleString("es-CO");
  return isNeg ? "-" + formatted : formatted;
}

export function PaymentReconciliationScreen({
  initialPayments = DEFAULT_PAYMENTS,
  initialCashSessions = DEFAULT_SESSIONS,
  onReconcileBatch,
  onForceCloseCashSession,
  onReviewCashDiscrepancy,
  loading = false
}: PaymentReconciliationScreenProps) {
  const [activeMainTab, setActiveMainTab] = useState<"DIGITAL" | "CASH">("DIGITAL");
  const [payments, setPayments] = useState<DigitalPaymentItem[]>(initialPayments);
  const [sessions, setSessions] = useState<CashSessionItem[]>(initialCashSessions);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Modales de Turnos de Caja
  const [activeForceCloseSessionId, setActiveForceCloseSessionId] = useState<string | null>(null);
  const [forceCloseReason, setForceCloseReason] = useState("");
  const [activeReviewSessionId, setActiveReviewSessionId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (methodFilter !== "ALL" && p.method !== methodFilter) return false;
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = p.reference ? p.reference.toLowerCase().includes(q) : false;
        const matchesReceipt = p.receiptCode ? p.receiptCode.toLowerCase().includes(q) : false;
        if (!matchesRef && !matchesReceipt) return false;
      }
      return true;
    });
  }, [payments, methodFilter, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    let pendingCents = 0;
    let confirmedCents = 0;
    let failedCents = 0;

    for (const p of payments) {
      if (p.status === "PENDING") pendingCents += p.amountCents;
      if (p.status === "CONFIRMED") confirmedCents += p.amountCents;
      if (p.status === "FAILED") failedCents += p.amountCents;
    }
    return { pendingCents, confirmedCents, failedCents };
  }, [payments]);

  const cashStats = useMemo(() => {
    const openCount = sessions.filter((s) => s.status === "OPEN").length;
    const closedCount = sessions.filter((s) => s.status === "CLOSED").length;
    const forceClosedCount = sessions.filter((s) => s.status === "FORCE_CLOSED").length;
    const totalDiscrepancyCents = sessions.reduce((acc, s) => acc + (s.differenceCents ?? 0), 0);
    return { openCount, closedCount, forceClosedCount, totalDiscrepancyCents };
  }, [sessions]);

  const toggleSelect = (paymentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) {
        next.delete(paymentId);
      } else {
        next.add(paymentId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPayments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPayments.map((p) => p.paymentId)));
    }
  };

  const handleBatchAction = async (status: "CONFIRMED" | "FAILED") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (onReconcileBatch) {
      await onReconcileBatch(ids, status);
    }

    setPayments((prev) =>
      prev.map((p) => (ids.includes(p.paymentId) ? { ...p, status, reconciledBy: "emp-actual" } : p))
    );
    setSelectedIds(new Set());
    setActionFeedback(
      `✓ Se confirmaron ${ids.length} pago(s) digital(es)`
    );
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleExecuteForceClose = async () => {
    if (!activeForceCloseSessionId || forceCloseReason.trim().length < 3) {
      alert("Por favor ingresa un motivo válido (mínimo 3 caracteres).");
      return;
    }
    if (onForceCloseCashSession) {
      await onForceCloseCashSession(activeForceCloseSessionId, forceCloseReason.trim());
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeForceCloseSessionId
          ? { ...s, status: "FORCE_CLOSED", reviewNote: `CIERRE_FORZADO: ${forceCloseReason.trim()}` }
          : s
      )
    );
    setActiveForceCloseSessionId(null);
    setForceCloseReason("");
    setActionFeedback("✓ Turno cerrado forzosamente de manera remota.");
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleExecuteReviewDiscrepancy = async () => {
    if (!activeReviewSessionId || reviewNote.trim().length < 3) {
      alert("Por favor ingresa una justificación válida (mínimo 3 caracteres).");
      return;
    }
    if (onReviewCashDiscrepancy) {
      await onReviewCashDiscrepancy(activeReviewSessionId, reviewNote.trim());
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeReviewSessionId
          ? { ...s, reviewNote: reviewNote.trim() }
          : s
      )
    );
    setActiveReviewSessionId(null);
    setReviewNote("");
    setActionFeedback("✓ Justificación de descuadre guardada exitosamente.");
    setTimeout(() => setActionFeedback(null), 4000);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} testID="reconciliation-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Conciliación de Pagos Digitales</Text>
          <Text style={styles.subtitle}>
            Control integral de pagos digitales (Nequi, Daviplata, Bre-B), arqueos ciegos y cierres fiscales Z.
          </Text>
        </View>
      </View>

      {/* Selector de Pestaña Principal */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.mainTabBtn, activeMainTab === "DIGITAL" && styles.mainTabBtnActive]}
          onPress={() => setActiveMainTab("DIGITAL")}
          testID="tab-digital-payments"
        >
          <Smartphone size={16} color={activeMainTab === "DIGITAL" ? "#1E3A8A" : "#64748B"} />
          <Text style={[styles.mainTabBtnText, activeMainTab === "DIGITAL" && styles.mainTabBtnTextActive]}>
            📱 Pagos Digitales ({payments.filter((p) => p.status === "PENDING").length} pendientes)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTabBtn, activeMainTab === "CASH" && styles.mainTabBtnActive]}
          onPress={() => setActiveMainTab("CASH")}
          testID="tab-cash-sessions"
        >
          <DollarSign size={16} color={activeMainTab === "CASH" ? "#1E3A8A" : "#64748B"} />
          <Text style={[styles.mainTabBtnText, activeMainTab === "CASH" && styles.mainTabBtnTextActive]}>
            💵 Turnos y Arqueos Ciegos ({sessions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {actionFeedback && (
        <View style={styles.feedbackBanner} testID="reconciliation-alert">
          <CircleCheck size={18} color="#059669" />
          <Text style={styles.feedbackText}>{actionFeedback}</Text>
        </View>
      )}

      {/* ========================================================== */}
      {/* PESTAÑA 1: CONCILIACIÓN DE PAGOS DIGITALES                  */}
      {/* ========================================================== */}
      {activeMainTab === "DIGITAL" && (
        <>
          {/* Tarjetas de Resumen COP */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { borderLeftColor: "#F59E0B" }]}>
              <View style={styles.statIconWrapper}>
                <Clock size={20} color="#F59E0B" />
              </View>
              <View>
                <Text style={styles.statLabel}>Pendientes por Conciliar</Text>
                <Text style={styles.statValue} testID="stat-pending-cents">
                  {formatCOP(stats.pendingCents)} COP
                </Text>
                <Text style={styles.statSub}>
                  {payments.filter((p) => p.status === "PENDING").length} transacciones sin verificar
                </Text>
              </View>
            </View>

            <View style={[styles.statCard, { borderLeftColor: "#10B981" }]}>
              <View style={styles.statIconWrapper}>
                <CircleCheck size={20} color="#10B981" />
              </View>
              <View>
                <Text style={styles.statLabel}>Confirmados en Extracto</Text>
                <Text style={styles.statValue} testID="stat-confirmed-cents">
                  {formatCOP(stats.confirmedCents)} COP
                </Text>
                <Text style={styles.statSub}>
                  {payments.filter((p) => p.status === "CONFIRMED").length} transacciones conciliadas
                </Text>
              </View>
            </View>

            <View style={[styles.statCard, { borderLeftColor: "#EF4444" }]}>
              <View style={styles.statIconWrapper}>
                <TriangleAlert size={20} color="#EF4444" />
              </View>
              <View>
                <Text style={styles.statLabel}>Rechazados / No Entraron</Text>
                <Text style={styles.statValue} testID="stat-failed-cents">
                  {formatCOP(stats.failedCents)} COP
                </Text>
                <Text style={styles.statSub}>
                  {payments.filter((p) => p.status === "FAILED").length} transacciones fallidas
                </Text>
              </View>
            </View>
          </View>

          {/* Filtros y Búsqueda */}
          <View style={styles.filterBar}>
            <View style={styles.searchBox}>
              <Search size={18} color="#64748B" />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por referencia o comprobante..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                accessibilityLabel="Buscar pagos digitales"
                testID="search-input"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <X size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.chipsRow}>
              {["ALL", "PENDING", "CONFIRMED", "FAILED"].map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[
                    styles.chip,
                    statusFilter === st && styles.chipActive,
                    statusFilter === st && st === "PENDING" && styles.chipActivePending,
                    statusFilter === st && st === "CONFIRMED" && styles.chipActiveConfirmed
                  ]}
                  onPress={() => setStatusFilter(st)}
                  testID={`filter-${st.toLowerCase()}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      statusFilter === st && styles.chipTextActive,
                      statusFilter === st && st === "PENDING" && styles.chipTextActivePending,
                      statusFilter === st && st === "CONFIRMED" && styles.chipTextActiveConfirmed
                    ]}
                  >
                    {st === "ALL" && "Todos"}
                    {st === "PENDING" && "Pendientes"}
                    {st === "CONFIRMED" && "Confirmados"}
                    {st === "FAILED" && "Fallidos"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Barra de Acciones por Lote */}
          {selectedIds.size > 0 && (
            <View style={styles.batchActionBar} testID="batch-actions-bar">
              <Text style={styles.batchActionCount}>
                {selectedIds.size} seleccionado(s)
              </Text>
              <View style={styles.batchButtons}>
                <TouchableOpacity
                  style={styles.btnConfirmBatch}
                  onPress={() => handleBatchAction("CONFIRMED")}
                  testID="btn-batch-confirm"
                >
                  <Check size={16} color="#FFFFFF" />
                  <Text style={styles.btnConfirmBatchText}>Confirmar en Lote</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnRejectBatch}
                  onPress={() => handleBatchAction("FAILED")}
                  testID="btn-batch-reject"
                >
                  <X size={16} color="#DC2626" />
                  <Text style={styles.btnRejectBatchText}>Rechazar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Tabla Accesible de Pagos Digitales */}
          <div
            role="region"
            tabIndex={0}
            aria-label="Listado de pagos digitales para conciliación bancaria"
            style={tableStyles.containerScroll}
          >
            <table style={tableStyles.htmlTable}>
              <thead style={tableStyles.tableHeader}>
                <tr>
                  <th style={tableStyles.thCell} scope="col">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos los pagos digitales"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredPayments.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={tableStyles.thCell} scope="col">Ticket / Venta</th>
                  <th style={tableStyles.thCell} scope="col">Medio</th>
                  <th style={tableStyles.thCell} scope="col">N° Comprobante / Ref</th>
                  <th style={tableStyles.thCell} scope="col">Monto COP</th>
                  <th style={tableStyles.thCell} scope="col">Estado</th>
                  <th style={tableStyles.thCell} scope="col">Acción Rápida</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={tableStyles.emptyCell}>
                      No se encontraron transacciones digitales con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const isSelected = selectedIds.has(p.paymentId);
                    return (
                      <tr
                        key={p.paymentId}
                        style={{
                          ...tableStyles.trRow,
                          backgroundColor: isSelected ? "rgba(59, 130, 246, 0.08)" : undefined
                        }}
                      >
                        <td style={tableStyles.tdCell}>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar pago ${p.paymentId}`}
                            checked={isSelected}
                            onChange={() => toggleSelect(p.paymentId)}
                          />
                        </td>
                        <td style={tableStyles.tdCell}>
                          <span style={{ fontWeight: 600 }}>{p.receiptCode || p.saleId}</span>
                        </td>
                        <td style={tableStyles.tdCell}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              backgroundColor:
                                p.method === "NEQUI"
                                  ? "#EDE9FE"
                                  : p.method === "DAVIPLATA"
                                  ? "#FEE2E2"
                                  : p.method === "BRE_B"
                                  ? "#FEF3C7"
                                  : "#E0F2FE",
                              color:
                                p.method === "NEQUI"
                                  ? "#6D28D9"
                                  : p.method === "DAVIPLATA"
                                  ? "#DC2626"
                                  : p.method === "BRE_B"
                                  ? "#B45309"
                                  : "#0369A1"
                            }}
                          >
                            {p.method}
                          </span>
                        </td>
                        <td style={tableStyles.tdCell}>
                          <code style={{ fontSize: "0.85rem", fontWeight: 600 }}>{p.reference || "S/R"}</code>
                        </td>
                        <td style={tableStyles.tdCell}>
                          <span style={{ fontWeight: 700, color: "#0F172A" }}>{formatCOP(p.amountCents)} COP</span>
                        </td>
                        <td style={tableStyles.tdCell}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: "0.78rem",
                              fontWeight: 600,
                              color:
                                p.status === "CONFIRMED"
                                  ? "#059669"
                                  : p.status === "PENDING"
                                  ? "#D97706"
                                  : "#DC2626"
                            }}
                          >
                            {p.status === "CONFIRMED" && "✓ Confirmado"}
                            {p.status === "PENDING" && "⏳ Pendiente"}
                            {p.status === "FAILED" && "✗ Fallido"}
                          </span>
                        </td>
                        <td style={tableStyles.tdCell}>
                          {p.status === "PENDING" ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#059669",
                                  color: "#FFF",
                                  border: "none",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  fontSize: "0.78rem"
                                }}
                                onClick={() => {
                                  setSelectedIds(new Set([p.paymentId]));
                                  handleBatchAction("CONFIRMED");
                                }}
                              >
                                Conciliar
                              </button>
                              <button
                                type="button"
                                style={{
                                  padding: "4px 8px",
                                  backgroundColor: "#FEE2E2",
                                  color: "#DC2626",
                                  border: "1px solid #FECACA",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  fontSize: "0.78rem"
                                }}
                                onClick={() => {
                                  setSelectedIds(new Set([p.paymentId]));
                                  handleBatchAction("FAILED");
                                }}
                              >
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "#64748B" }}>
                              {p.reconciledBy ? `Por: ${p.reconciledBy}` : "Cerrado"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* PESTAÑA 2: TURNOS DE CAJA Y ARQUEOS CIEGOS (CIERRES Z)     */}
      {/* ========================================================== */}
      {activeMainTab === "CASH" && (
        <>
          {/* Tarjetas Resumen Turnos */}
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { borderLeftColor: "#10B981" }]}>
              <View style={styles.statIconWrapper}>
                <CircleCheck size={20} color="#10B981" />
              </View>
              <View>
                <Text style={styles.statLabel}>Turnos Abiertos en Sucursales</Text>
                <Text style={styles.statValue} testID="stat-open-sessions-count">
                  {cashStats.openCount} turnos activos
                </Text>
                <Text style={styles.statSub}>Cajas operando en tiempo real</Text>
              </View>
            </View>

            <View style={[styles.statCard, { borderLeftColor: "#64748B" }]}>
              <View style={styles.statIconWrapper}>
                <Clock size={20} color="#64748B" />
              </View>
              <View>
                <Text style={styles.statLabel}>Turnos Cerrados (Reportes Z)</Text>
                <Text style={styles.statValue}>{cashStats.closedCount} turnos</Text>
                <Text style={styles.statSub}>{cashStats.forceClosedCount} cierres forzados remotos</Text>
              </View>
            </View>

            <View
              style={[
                styles.statCard,
                { borderLeftColor: cashStats.totalDiscrepancyCents === 0 ? "#10B981" : "#EF4444" }
              ]}
            >
              <View style={styles.statIconWrapper}>
                <TriangleAlert
                  size={20}
                  color={cashStats.totalDiscrepancyCents === 0 ? "#10B981" : "#EF4444"}
                />
              </View>
              <View>
                <Text style={styles.statLabel}>Neto Descuadre en Arqueos</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: cashStats.totalDiscrepancyCents < 0 ? "#DC2626" : "#059669" }
                  ]}
                  testID="stat-cash-discrepancy"
                >
                  {formatCOP(cashStats.totalDiscrepancyCents)} COP
                </Text>
                <Text style={styles.statSub}>
                  {cashStats.totalDiscrepancyCents === 0 ? "✓ Cajas cuadradas exactas" : "Requiere auditoría"}
                </Text>
              </View>
            </View>
          </View>

          {/* Tabla de Turnos de Caja */}
          <div
            role="region"
            tabIndex={0}
            aria-label="Listado de turnos de caja y estado de arqueos ciegos"
            style={tableStyles.containerScroll}
          >
            <table style={tableStyles.htmlTable}>
              <thead style={tableStyles.tableHeader}>
                <tr>
                  <th style={tableStyles.thCell} scope="col">Cajero / Sesión</th>
                  <th style={tableStyles.thCell} scope="col">Terminal / Sede</th>
                  <th style={tableStyles.thCell} scope="col">Base Inicial</th>
                  <th style={tableStyles.thCell} scope="col">Esperado Sistema</th>
                  <th style={tableStyles.thCell} scope="col">Declarado Arqueo</th>
                  <th style={tableStyles.thCell} scope="col">Diferencia</th>
                  <th style={tableStyles.thCell} scope="col">Estado</th>
                  <th style={tableStyles.thCell} scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const hasDiscrepancy = s.differenceCents !== null && s.differenceCents !== 0;
                  return (
                    <tr key={s.id} style={tableStyles.trRow}>
                      <td style={tableStyles.tdCell}>
                        <div style={{ fontWeight: 600 }}>{s.cashierName}</div>
                        <code style={{ fontSize: "0.75rem", color: "#64748B" }}>{s.id}</code>
                      </td>
                      <td style={tableStyles.tdCell}>
                        <div>{s.terminalId}</div>
                        <span style={{ fontSize: "0.75rem", color: "#64748B" }}>{s.branchId}</span>
                      </td>
                      <td style={tableStyles.tdCell}>{formatCOP(s.openingFloatCents)} COP</td>
                      <td style={tableStyles.tdCell}>
                        <span style={{ fontWeight: 600 }}>{formatCOP(s.serverExpectedCashCents)} COP</span>
                      </td>
                      <td style={tableStyles.tdCell}>
                        {s.declaredCashCents !== null ? (
                          <span style={{ fontWeight: 600 }}>{formatCOP(s.declaredCashCents)} COP</span>
                        ) : (
                          <span style={{ color: "#94A3B8" }}>En curso...</span>
                        )}
                      </td>
                      <td style={tableStyles.tdCell}>
                        {s.differenceCents !== null ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: "0.8rem",
                              backgroundColor:
                                s.differenceCents === 0
                                  ? "#DCFCE7"
                                  : s.differenceCents < 0
                                  ? "#FEE2E2"
                                  : "#DBEAFE",
                              color:
                                s.differenceCents === 0
                                  ? "#15803D"
                                  : s.differenceCents < 0
                                  ? "#DC2626"
                                  : "#1D4ED8"
                            }}
                          >
                            {s.differenceCents === 0
                              ? "✓ Cuadrado"
                              : s.differenceCents < 0
                              ? `Faltante ${formatCOP(s.differenceCents)}`
                              : `Sobrante +${formatCOP(s.differenceCents)}`}
                          </span>
                        ) : (
                          <span style={{ color: "#94A3B8" }}>—</span>
                        )}
                        {s.reviewNote && (
                          <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: 4 }}>
                            📝 {s.reviewNote}
                          </div>
                        )}
                      </td>
                      <td style={tableStyles.tdCell}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            backgroundColor:
                              s.status === "OPEN"
                                ? "#DCFCE7"
                                : s.status === "CLOSED"
                                ? "#F1F5F9"
                                : "#FEF3C7",
                            color:
                              s.status === "OPEN"
                                ? "#15803D"
                                : s.status === "CLOSED"
                                ? "#475569"
                                : "#B45309"
                          }}
                        >
                          {s.status === "OPEN" && "ABIERTO"}
                          {s.status === "CLOSED" && "CERRADO (Z)"}
                          {s.status === "FORCE_CLOSED" && "CIERRE FORZADO"}
                        </span>
                      </td>
                      <td style={tableStyles.tdCell}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {s.status === "OPEN" && (
                            <button
                              type="button"
                              style={{
                                padding: "4px 8px",
                                backgroundColor: "#FEF2F2",
                                color: "#DC2626",
                                border: "1px solid #FECACA",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontSize: "0.75rem",
                                fontWeight: 600
                              }}
                              onClick={() => setActiveForceCloseSessionId(s.id)}
                              data-testid={`btn-force-close-${s.id}`}
                            >
                              Cierre Forzado
                            </button>
                          )}
                          {s.status === "CLOSED" && hasDiscrepancy && (
                            <button
                              type="button"
                              style={{
                                padding: "4px 8px",
                                backgroundColor: "#F0F9FF",
                                color: "#0284C7",
                                border: "1px solid #BAE6FD",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontSize: "0.75rem",
                                fontWeight: 600
                              }}
                              onClick={() => {
                                setActiveReviewSessionId(s.id);
                                setReviewNote(s.reviewNote || "");
                              }}
                              data-testid={`btn-review-${s.id}`}
                            >
                              Justificar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ========================================================== */}
      {/* MODAL CIERRE FORZADO REMOTO (HU-087)                        */}
      {/* ========================================================== */}
      {activeForceCloseSessionId && (
        <dialog
          open
          aria-labelledby="dialog-force-close-title"
          style={dialogStyles.htmlDialog}
          data-testid="modal-force-close"
        >
          <div style={dialogStyles.header}>
            <h3 id="dialog-force-close-title" style={dialogStyles.title}>
              ⚠️ Cierre Forzado Remoto de Turno
            </h3>
            <button
              type="button"
              style={dialogStyles.closeBtn}
              onClick={() => setActiveForceCloseSessionId(null)}
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
          <div style={dialogStyles.body}>
            <p style={{ fontSize: "0.88rem", color: "#475569", marginBottom: 12 }}>
              Vas a forzar el cierre del turno <strong>{activeForceCloseSessionId}</strong>. Esta acción
              queda registrada en el log inmutable de auditoría para fines contables y de supervisión.
            </p>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>
              Motivo Operativo / Justificación:
            </label>
            <input
              type="text"
              placeholder="Ej: Cajero olvidó cerrar turno al finalizar jornada..."
              value={forceCloseReason}
              onChange={(e) => setForceCloseReason(e.target.value)}
              style={dialogStyles.input}
              data-testid="input-force-close-reason"
            />
          </div>
          <div style={dialogStyles.footer}>
            <button
              type="button"
              style={dialogStyles.btnCancel}
              onClick={() => setActiveForceCloseSessionId(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              style={dialogStyles.btnConfirmDanger}
              onClick={handleExecuteForceClose}
              data-testid="btn-confirm-force-close"
            >
              Confirmar Cierre Forzado
            </button>
          </div>
        </dialog>
      )}

      {/* ========================================================== */}
      {/* MODAL JUSTIFICACIÓN DE DESCUADRE (HU-195)                   */}
      {/* ========================================================== */}
      {activeReviewSessionId && (
        <dialog
          open
          aria-labelledby="dialog-review-title"
          style={dialogStyles.htmlDialog}
          data-testid="modal-review-discrepancy"
        >
          <div style={dialogStyles.header}>
            <h3 id="dialog-review-title" style={dialogStyles.title}>
              📝 Justificación de Descuadre de Turno
            </h3>
            <button
              type="button"
              style={dialogStyles.closeBtn}
              onClick={() => setActiveReviewSessionId(null)}
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
          <div style={dialogStyles.body}>
            <p style={{ fontSize: "0.88rem", color: "#475569", marginBottom: 12 }}>
              Registra la nota de auditoría para el descuadre del turno{" "}
              <strong>{activeReviewSessionId}</strong>:
            </p>
            <textarea
              rows={4}
              placeholder="Ej: Descuadre verificado: vueltas entregadas de más en hora pico..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              style={dialogStyles.textarea}
              data-testid="input-review-note"
            />
          </div>
          <div style={dialogStyles.footer}>
            <button
              type="button"
              style={dialogStyles.btnCancel}
              onClick={() => setActiveReviewSessionId(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              style={dialogStyles.btnConfirmPrimary}
              onClick={handleExecuteReviewDiscrepancy}
              data-testid="btn-confirm-review-note"
            >
              Guardar Justificación
            </button>
          </div>
        </dialog>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC"
  },
  contentContainer: {
    padding: 20
  },
  header: {
    marginBottom: 16
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B"
  },
  tabSelector: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 8
  },
  mainTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#F1F5F9"
  },
  mainTabBtnActive: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#93C5FD"
  },
  mainTabBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B"
  },
  mainTabBtnTextActive: {
    color: "#1E3A8A"
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  feedbackText: {
    color: "#065F46",
    fontSize: 14,
    fontWeight: "500"
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap"
  },
  statCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  statIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center"
  },
  statLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500"
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginVertical: 2
  },
  statSub: {
    fontSize: 11,
    color: "#94A3B8"
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap"
  },
  searchBox: {
    flex: 1,
    minWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
    height: 40
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#0F172A"
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1"
  },
  chipActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7"
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
  }
});

const tableStyles: Record<string, React.CSSProperties> = {
  containerScroll: {
    overflow: "auto",
    maxWidth: "100%",
    borderRadius: 8,
    border: "1px solid #E2E8F0",
    backgroundColor: "#FFFFFF"
  },
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
    borderBottom: "1px solid #F1F5F9"
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

const dialogStyles: Record<string, React.CSSProperties> = {
  htmlDialog: {
    position: "fixed",
    inset: 0,
    margin: "auto",
    maxWidth: 480,
    width: "90%",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    backgroundColor: "#FFFFFF",
    padding: 0,
    zIndex: 1000,
    overscrollBehavior: "contain"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 18px",
    borderBottom: "1px solid #E2E8F0",
    backgroundColor: "#F8FAFC"
  },
  title: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#0F172A"
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    fontSize: "1.2rem",
    cursor: "pointer",
    color: "#64748B"
  },
  body: {
    padding: "16px 18px"
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #CBD5E1",
    fontSize: "0.9rem",
    boxSizing: "border-box"
  },
  textarea: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #CBD5E1",
    fontSize: "0.9rem",
    boxSizing: "border-box",
    fontFamily: "inherit"
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "12px 18px",
    borderTop: "1px solid #E2E8F0",
    backgroundColor: "#F8FAFC"
  },
  btnCancel: {
    padding: "8px 14px",
    borderRadius: 6,
    border: "1px solid #CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#475569",
    fontWeight: 600,
    cursor: "pointer"
  },
  btnConfirmDanger: {
    padding: "8px 14px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#DC2626",
    color: "#FFFFFF",
    fontWeight: 600,
    cursor: "pointer"
  },
  btnConfirmPrimary: {
    padding: "8px 14px",
    borderRadius: 6,
    border: "none",
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    fontWeight: 600,
    cursor: "pointer"
  }
};
