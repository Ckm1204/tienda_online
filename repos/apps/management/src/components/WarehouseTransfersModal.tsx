import React, { useState, useEffect } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import Truck from "lucide-react-native/icons/truck";
import ArrowRightLeft from "lucide-react-native/icons/arrow-right-left";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleCheck from "lucide-react-native/icons/circle-check";
import X from "lucide-react-native/icons/x";
import PackagePlus from "lucide-react-native/icons/package-plus";
import PackageMinus from "lucide-react-native/icons/package-minus";
import Zap from "lucide-react-native/icons/zap";

export interface WarehouseTransferItem {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  productId: string;
  productName?: string;
  sentQtyMilli: number;
  receivedQtyMilli: number | null;
  status: "IN_TRANSIT" | "RECEIVED" | "RECEIVED_WITH_DIFF";
  diffNote: string | null;
}

export interface RebalancingSuggestionItem {
  productId: string;
  productName?: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  deficitQtyMilli: number;
  availableSurplusMilli: number;
  suggestedQtyMilli: number;
  priority: "CRITICAL" | "MODERATE";
}

export interface WarehouseTransfersModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfers?: WarehouseTransferItem[];
  suggestions?: RebalancingSuggestionItem[];
  warehouses?: { id: string; name: string }[];
  products?: { id: string; name: string; sku: string; stockQtyMilli?: number }[];
  onDispatchTransfer?: (params: {
    fromWarehouseId: string;
    toWarehouseId: string;
    productId: string;
    qtyMilli: number;
  }) => Promise<void> | void;
  onReceiveTransfer?: (params: {
    transferId: string;
    receivedQtyMilli: number;
    diffNote?: string;
  }) => Promise<void> | void;
  onRecordAdjustment?: (params: {
    warehouseId: string;
    productId: string;
    kind: "ADJUSTMENT_EXPIRED" | "ADJUSTMENT_DAMAGED" | "ADJUSTMENT_SHRINKAGE";
    deltaMilli: number;
    reason: string;
  }) => Promise<void> | void;
}

const DEFAULT_SUGGESTIONS: RebalancingSuggestionItem[] = [
  {
    productId: "prod-003",
    productName: "Leche Alquería Entera 1L",
    fromWarehouseId: "wh-main",
    toWarehouseId: "wh-sucursal-norte",
    deficitQtyMilli: 13000,
    availableSurplusMilli: 80000,
    suggestedQtyMilli: 28000,
    priority: "CRITICAL"
  }
];

export function WarehouseTransfersModal({
  isOpen,
  onClose,
  transfers = [],
  suggestions = DEFAULT_SUGGESTIONS,
  warehouses = [
    { id: "wh-main", name: "Bodega Principal (Sede Centro)" },
    { id: "wh-sucursal-norte", name: "Bodega Sucursal Norte" }
  ],
  products = [
    { id: "prod-001", name: "Arroz Diana Tradicional 1kg", sku: "SKU-ARR-01", stockQtyMilli: 45000 },
    { id: "prod-002", name: "Aceite Premier Girasol 1000ml", sku: "SKU-ACT-02", stockQtyMilli: 18000 },
    { id: "prod-003", name: "Leche Alquería Entera 1L", sku: "SKU-LEC-03", stockQtyMilli: 8000 }
  ],
  onDispatchTransfer,
  onReceiveTransfer,
  onRecordAdjustment
}: WarehouseTransfersModalProps) {
  const [activeTab, setActiveTab] = useState<"DISPATCH" | "TRANSIT" | "ADJUSTMENT" | "SUGGESTIONS">("DISPATCH");

  // Formulario Despacho
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id || "wh-main");
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id || "wh-sucursal-norte");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "prod-001");
  const [transferQty, setTransferQty] = useState("10");

  // Formulario Recepción
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [receivedQty, setReceivedQty] = useState("");
  const [diffNote, setDiffNote] = useState("");

  // Formulario Ajuste Avería / Merma
  const [adjustmentKind, setAdjustmentKind] = useState<"ADJUSTMENT_EXPIRED" | "ADJUSTMENT_DAMAGED" | "ADJUSTMENT_SHRINKAGE">("ADJUSTMENT_DAMAGED");
  const [adjustmentWarehouseId, setAdjustmentWarehouseId] = useState(warehouses[0]?.id || "wh-main");
  const [adjustmentProductId, setAdjustmentProductId] = useState(products[0]?.id || "prod-001");
  const [adjustmentQty, setAdjustmentQty] = useState("2");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = document.getElementById("dialog-warehouse-transfers") as HTMLDialogElement | null;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    const dialog = document.getElementById("dialog-warehouse-transfers") as HTMLDialogElement | null;
    if (dialog && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
    setFeedback(null);
    setErrorMessage(null);
    onClose();
  };

  const handleDispatch = async () => {
    setErrorMessage(null);
    if (fromWarehouseId === toWarehouseId) {
      setErrorMessage("La bodega de origen y destino no pueden ser iguales.");
      return;
    }
    const units = parseFloat(transferQty);
    if (isNaN(units) || units <= 0) {
      setErrorMessage("Ingresa una cantidad válida mayor a 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (onDispatchTransfer) {
        await onDispatchTransfer({
          fromWarehouseId,
          toWarehouseId,
          productId: selectedProductId,
          qtyMilli: Math.round(units * 1000)
        });
      }
      setFeedback(`Traslado de ${units} unidades despachado en estado 'EN TRÁNSITO'.`);
      setTransferQty("10");
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Error al despachar traslado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplySuggestion = (sugg: RebalancingSuggestionItem) => {
    setSelectedProductId(sugg.productId);
    setFromWarehouseId(sugg.fromWarehouseId);
    setToWarehouseId(sugg.toWarehouseId);
    setTransferQty((sugg.suggestedQtyMilli / 1000).toString());
    setActiveTab("DISPATCH");
    setFeedback(
      `✓ Sugerencia precargada: Despachando ${sugg.suggestedQtyMilli / 1000} unidades de ${sugg.fromWarehouseId} a ${sugg.toWarehouseId}`
    );
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleReceive = async () => {
    setErrorMessage(null);
    if (!selectedTransferId) {
      setErrorMessage("Selecciona una remisión de traslado para recibir.");
      return;
    }
    const units = parseFloat(receivedQty);
    if (isNaN(units) || units < 0) {
      setErrorMessage("Ingresa una cantidad válida.");
      return;
    }

    const tr = transfers.find((t) => t.id === selectedTransferId);
    const sentUnits = tr ? tr.sentQtyMilli / 1000 : 0;
    if (units !== sentUnits && diffNote.trim().length < 3) {
      setErrorMessage("Si recibes una cantidad diferente a la despachada, debes ingresar una nota explicativa (mínimo 3 caracteres).");
      return;
    }

    setIsSubmitting(true);
    try {
      if (onReceiveTransfer) {
        await onReceiveTransfer({
          transferId: selectedTransferId,
          receivedQtyMilli: Math.round(units * 1000),
          diffNote: units !== sentUnits ? diffNote.trim() : undefined
        });
      }
      setFeedback(`Recepción de ${units} unidades confirmada en bodega de destino.`);
      setSelectedTransferId(null);
      setReceivedQty("");
      setDiffNote("");
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Error al confirmar recepción.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordAdjustment = async () => {
    setErrorMessage(null);
    const units = parseFloat(adjustmentQty);
    if (isNaN(units) || units <= 0) {
      setErrorMessage("Ingresa una cantidad válida mayor a 0 para el ajuste.");
      return;
    }
    if (adjustmentReason.trim().length < 3) {
      setErrorMessage("El motivo o justificación de la merma/avería es obligatorio (mínimo 3 caracteres, DIAN Art. 616).");
      return;
    }

    setIsSubmitting(true);
    try {
      if (onRecordAdjustment) {
        await onRecordAdjustment({
          warehouseId: adjustmentWarehouseId,
          productId: adjustmentProductId,
          kind: adjustmentKind,
          deltaMilli: -Math.round(units * 1000),
          reason: adjustmentReason.trim()
        });
      }
      setFeedback(`Ajuste de inventario (-${units} unidades) registrado en Kardex Fiscal.`);
      setAdjustmentReason("");
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Error al registrar ajuste.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inTransitTransfers = transfers.filter((t) => t.status === "IN_TRANSIT");

  return (
    <dialog
      id="dialog-warehouse-transfers"
      open={isOpen}
      closedby="any"
      aria-labelledby="modal-transfers-title"
      data-testid="warehouse-transfers-dialog"
      style={htmlDialogStyle}
    >
      <View style={styles.dialogHeader}>
        <View style={styles.headerTitleRow}>
          <Truck size={22} color="#0284C7" />
          <Text id="modal-transfers-title" style={styles.modalTitle}>
            Traslados y Mermas de Inventario
          </Text>
        </View>
        <TouchableOpacity onPress={handleClose} accessibilityLabel="Cerrar modal" testID="btn-close-modal">
          <X size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Selector de Pestañas */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "DISPATCH" && styles.tabBtnActive]}
          onPress={() => setActiveTab("DISPATCH")}
          testID="tab-dispatch"
        >
          <ArrowRightLeft size={16} color={activeTab === "DISPATCH" ? "#0284C7" : "#64748B"} />
          <Text style={[styles.tabBtnText, activeTab === "DISPATCH" && styles.tabBtnTextActive]}>
            Despachar Traslado
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "TRANSIT" && styles.tabBtnActive]}
          onPress={() => setActiveTab("TRANSIT")}
          testID="tab-in-transit"
        >
          <Truck size={16} color={activeTab === "TRANSIT" ? "#0284C7" : "#64748B"} />
          <Text style={[styles.tabBtnText, activeTab === "TRANSIT" && styles.tabBtnTextActive]}>
            En Tránsito ({inTransitTransfers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "SUGGESTIONS" && styles.tabBtnActive]}
          onPress={() => setActiveTab("SUGGESTIONS")}
          testID="tab-suggestions"
        >
          <Zap size={16} color={activeTab === "SUGGESTIONS" ? "#D97706" : "#64748B"} />
          <Text style={[styles.tabBtnText, activeTab === "SUGGESTIONS" && styles.tabBtnTextActive]}>
            ⚡ Rebalanceo ({suggestions.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "ADJUSTMENT" && styles.tabBtnActive]}
          onPress={() => setActiveTab("ADJUSTMENT")}
          testID="tab-adjustment"
        >
          <PackageMinus size={16} color={activeTab === "ADJUSTMENT" ? "#0284C7" : "#64748B"} />
          <Text style={[styles.tabBtnText, activeTab === "ADJUSTMENT" && styles.tabBtnTextActive]}>
            Averías y Mermas
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.dialogBody} contentContainerStyle={{ paddingBottom: 24 }}>
        {feedback && (
          <View style={styles.feedbackBanner} testID="transfer-success-banner">
            <CircleCheck size={18} color="#059669" />
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorBanner} testID="transfer-error-banner">
            <TriangleAlert size={18} color="#DC2626" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* PESTAÑA 1: DESPACHAR TRASLADO */}
        {activeTab === "DISPATCH" && (
          <View style={styles.formContainer}>
            <Text style={styles.formHelp}>
              Despacha mercancía desde una bodega central o sede secundaria. El stock se deducirá
              inmediatamente del origen y quedará en tránsito hasta su recepción.
            </Text>

            <View style={styles.rowTwoCols}>
              <View style={styles.col}>
                <Text style={styles.label}>Bodega Origen (Remitente):</Text>
                <select
                  aria-label="Bodega Origen"
                  value={fromWarehouseId}
                  onChange={(e) => setFromWarehouseId(e.target.value)}
                  style={selectStyle}
                  data-testid="select-from-warehouse"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </View>

              <View style={styles.col}>
                <Text style={styles.label}>Bodega Destino (Receptora):</Text>
                <select
                  aria-label="Bodega Destino"
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  style={selectStyle}
                  data-testid="select-to-warehouse"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Producto a Trasladar:</Text>
              <select
                aria-label="Producto a Trasladar"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                style={selectStyle}
                data-testid="select-transfer-product"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Cantidad a Despachar (Unidades / Kilos):</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={transferQty}
                onChangeText={setTransferQty}
                placeholder="Ej: 10"
                accessibilityLabel="Cantidad a trasladar"
                testID="input-transfer-qty"
              />
            </View>

            <TouchableOpacity
              style={[styles.btnPrimary, isSubmitting && styles.btnDisabled]}
              onPress={handleDispatch}
              disabled={isSubmitting}
              testID="btn-dispatch-transfer"
            >
              <Truck size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>
                {isSubmitting ? "Despachando..." : "Confirmar Despacho y Generar Remisión"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* PESTAÑA 2: EN TRÁNSITO / RECEPCIÓN */}
        {activeTab === "TRANSIT" && (
          <View style={styles.formContainer}>
            <Text style={styles.formHelp}>
              Confirma la llegada física de la mercancía. Si faltan unidades o llegaron deterioradas, ingresa
              la cantidad exacta recibida y la nota de diferencia.
            </Text>

            {inTransitTransfers.length === 0 ? (
              <View style={styles.emptyBox}>
                <CircleCheck size={28} color="#10B981" />
                <Text style={styles.emptyTitle}>No hay traslados en tránsito</Text>
                <Text style={styles.emptySub}>Todos los envíos entre bodegas han sido recibidos.</Text>
              </View>
            ) : (
              <>
                <View style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {inTransitTransfers.map((t) => (
                    <View
                      key={t.id}
                      style={{
                        padding: 10,
                        backgroundColor: "#FFFFFF",
                        borderWidth: 1,
                        borderColor: "#CBD5E1",
                        borderRadius: 6,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <View>
                        <Text style={{ fontWeight: "700", fontSize: 13, color: "#0F172A" }}>
                          #{t.id}: {t.fromWarehouseId} ➔ {t.toWarehouseId}
                        </Text>
                        <Text style={{ fontSize: 12, color: "#64748B" }}>
                          {t.productName || t.productId} • Cantidad: {t.sentQtyMilli / 1000} un.
                        </Text>
                      </View>
                      <button
                        type="button"
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#0284C7",
                          color: "#FFF",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 600
                        }}
                        onClick={() => {
                          setSelectedTransferId(t.id);
                          setReceivedQty((t.sentQtyMilli / 1000).toString());
                        }}
                        data-testid={`btn-receive-${t.id}`}
                      >
                        Recibir
                      </button>
                    </View>
                  ))}
                </View>

                {selectedTransferId && (
                  <View style={{ marginTop: 14, backgroundColor: "#F8FAFC", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" }}>
                    <Text style={{ fontWeight: "700", fontSize: 14, marginBottom: 8, color: "#0F172A" }}>
                      Confirmar Recepción de Traslado #{selectedTransferId}
                    </Text>

                    <Text style={styles.label}>Cantidad Recibida Efectivamente:</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      value={receivedQty}
                      onChangeText={setReceivedQty}
                      placeholder="Cantidad recibida"
                      testID="input-received-qty"
                    />

                    <Text style={[styles.label, { marginTop: 10 }]}>Nota de Discrepancia / Faltante (si aplica):</Text>
                    <TextInput
                      style={[styles.textInput, { height: 60 }]}
                      multiline
                      value={diffNote}
                      onChangeText={setDiffNote}
                      placeholder="Ej: Llegó 1 bolsa rota en transporte..."
                      testID="input-diff-note"
                    />

                    <TouchableOpacity
                      style={[styles.btnSuccess, isSubmitting && styles.btnDisabled]}
                      onPress={handleReceive}
                      disabled={isSubmitting}
                      testID="btn-confirm-receive"
                    >
                      <CircleCheck size={18} color="#FFFFFF" />
                      <Text style={styles.btnPrimaryText}>
                        {isSubmitting ? "Recibiendo..." : "Confirmar Recepción en Bodega"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* PESTAÑA 3: SUGERENCIAS DE REBALANCEO (HU-304 / HU-356) */}
        {activeTab === "SUGGESTIONS" && (
          <View style={styles.formContainer}>
            <Text style={styles.formHelp}>
              El motor de inventario detecta sedes satélite donde el stock cayó por debajo del mínimo de seguridad
              y busca automáticamente bodegas con excedentes para balancear la carga.
            </Text>

            {suggestions.length === 0 ? (
              <View style={styles.emptyBox}>
                <CircleCheck size={28} color="#10B981" />
                <Text style={styles.emptyTitle}>Inventario Óptimo</Text>
                <Text style={styles.emptySub}>No se detectan quiebres de stock ni desbalances entre sedes.</Text>
              </View>
            ) : (
              <View style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {suggestions.map((sugg, idx) => (
                  <View
                    key={`${sugg.productId}-${idx}`}
                    style={{
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: sugg.priority === "CRITICAL" ? "#FCA5A5" : "#FDE68A",
                      borderLeftWidth: 4,
                      borderLeftColor: sugg.priority === "CRITICAL" ? "#EF4444" : "#F59E0B",
                      borderRadius: 8,
                      padding: 12
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontWeight: "700", fontSize: 15, color: "#0F172A" }}>
                        {sugg.productName || sugg.productId}
                      </Text>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 4,
                          backgroundColor: sugg.priority === "CRITICAL" ? "#FEE2E2" : "#FEF3C7",
                          color: sugg.priority === "CRITICAL" ? "#DC2626" : "#B45309"
                        }}
                      >
                        {sugg.priority === "CRITICAL" ? "🔴 QUIEBRE CRÍTICO" : "🟡 BAJO MÍNIMO"}
                      </span>
                    </View>

                    <Text style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
                      Déficit en <strong>{sugg.toWarehouseId}</strong> ({sugg.deficitQtyMilli / 1000} un.) • Excedente en <strong>{sugg.fromWarehouseId}</strong> ({sugg.availableSurplusMilli / 1000} un. disponibles)
                    </Text>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#0284C7" }}>
                        Sugerido a trasladar: {sugg.suggestedQtyMilli / 1000} unidades
                      </Text>
                      <button
                        type="button"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: "#0284C7",
                          color: "#FFFFFF",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 12px",
                          cursor: "pointer",
                          fontSize: "0.82rem",
                          fontWeight: 600
                        }}
                        onClick={() => handleApplySuggestion(sugg)}
                        data-testid={`btn-apply-suggestion-${sugg.productId}`}
                      >
                        ⚡ Despachar Traslado
                      </button>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* PESTAÑA 4: AVERÍAS, MERMAS Y VENCIMIENTOS */}
        {activeTab === "ADJUSTMENT" && (
          <View style={styles.formContainer}>
            <Text style={styles.formHelp}>
              Baja legal de inventario por deterioro, avería, vencimiento o merma física.
              Cumplimiento estricto de la DIAN Art. 616 E.T. con justificación obligatoria.
            </Text>

            <View style={{ marginTop: 8 }}>
              <Text style={styles.label}>Tipo de Baja / Ajuste Legal:</Text>
              <select
                aria-label="Tipo de Ajuste"
                value={adjustmentKind}
                onChange={(e) => setAdjustmentKind(e.target.value as any)}
                style={selectStyle}
                data-testid="select-adjustment-kind"
              >
                <option value="ADJUSTMENT_DAMAGED">Avería / Producto Roto o Deteriorado</option>
                <option value="ADJUSTMENT_EXPIRED">Vencimiento / Fecha Límite Cumplida</option>
                <option value="ADJUSTMENT_SHRINKAGE">Merma Operativa / Descongelación / Merma Granel</option>
              </select>
            </View>

            <View style={styles.rowTwoCols}>
              <View style={styles.col}>
                <Text style={styles.label}>Bodega Afectada:</Text>
                <select
                  aria-label="Bodega Afectada"
                  value={adjustmentWarehouseId}
                  onChange={(e) => setAdjustmentWarehouseId(e.target.value)}
                  style={selectStyle}
                  data-testid="select-adjustment-warehouse"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </View>

              <View style={styles.col}>
                <Text style={styles.label}>Producto:</Text>
                <select
                  aria-label="Producto a Ajustar"
                  value={adjustmentProductId}
                  onChange={(e) => setAdjustmentProductId(e.target.value)}
                  style={selectStyle}
                  data-testid="select-adjustment-product"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Cantidad a Dar de Baja:</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={adjustmentQty}
                onChangeText={setAdjustmentQty}
                placeholder="Ej: 2"
                testID="input-adj-qty"
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Motivo Legal / Explicativo (Obligatorio DIAN):</Text>
              <TextInput
                style={[styles.textInput, { height: 60 }]}
                multiline
                value={adjustmentReason}
                onChangeText={setAdjustmentReason}
                placeholder="Ej: Frasco de vidrio quebrado al descargar estiba..."
                testID="input-adj-reason"
              />
            </View>

            <TouchableOpacity
              style={[styles.btnDanger, isSubmitting && styles.btnDisabled]}
              onPress={handleRecordAdjustment}
              disabled={isSubmitting}
              testID="btn-record-adjustment"
            >
              <PackageMinus size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>
                {isSubmitting ? "Registrando..." : "Registrar Baja y Asentar en Kardex Fiscal"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </dialog>
  );
}

const htmlDialogStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  margin: "auto",
  maxWidth: 620,
  width: "92%",
  maxHeight: "88vh",
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  backgroundColor: "#FFFFFF",
  padding: 0,
  zIndex: 1000,
  overscrollBehavior: "contain"
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  borderRadius: 6,
  border: "1px solid #CBD5E1",
  padding: "0 10px",
  backgroundColor: "#FFFFFF",
  fontSize: "0.9rem",
  color: "#0F172A",
  boxSizing: "border-box"
};

const styles = StyleSheet.create({
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC"
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A"
  },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0"
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  tabBtnActive: {
    backgroundColor: "#FFFFFF",
    borderBottomColor: "#0284C7"
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B"
  },
  tabBtnTextActive: {
    color: "#0284C7"
  },
  dialogBody: {
    padding: 16
  },
  formContainer: {
    marginTop: 4
  },
  formHelp: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 12,
    lineHeight: 18
  },
  rowTwoCols: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8
  },
  col: {
    flex: 1
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    backgroundColor: "#FFFFFF",
    color: "#0F172A"
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0284C7",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 18
  },
  btnSuccess: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 14
  },
  btnDanger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#DC2626",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 18
  },
  btnDisabled: {
    opacity: 0.6
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600"
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  feedbackText: {
    color: "#065F46",
    fontSize: 13,
    fontWeight: "500"
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  errorText: {
    color: "#991B1B",
    fontSize: 13,
    fontWeight: "500"
  },
  emptyBox: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8
  },
  emptySub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2
  }
});
