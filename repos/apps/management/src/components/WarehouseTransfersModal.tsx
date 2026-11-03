import React, { useState, useEffect } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import Truck from "lucide-react-native/icons/truck";
import ArrowRightLeft from "lucide-react-native/icons/arrow-right-left";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleCheck from "lucide-react-native/icons/circle-check";
import X from "lucide-react-native/icons/x";
import PackagePlus from "lucide-react-native/icons/package-plus";
import PackageMinus from "lucide-react-native/icons/package-minus";

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

export interface WarehouseTransfersModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfers?: WarehouseTransferItem[];
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

export function WarehouseTransfersModal({
  isOpen,
  onClose,
  transfers = [],
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
  const [activeTab, setActiveTab] = useState<"DISPATCH" | "IN_TRANSIT" | "ADJUSTMENT">("DISPATCH");

  // Formulario de Despacho de Traslado
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouses[0]?.id || "wh-main");
  const [toWarehouseId, setToWarehouseId] = useState(warehouses[1]?.id || "wh-sucursal-norte");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "prod-001");
  const [transferQty, setTransferQty] = useState("10");

  // Formulario de Recepción
  const [receivingTransfer, setReceivingTransfer] = useState<WarehouseTransferItem | null>(null);
  const [receivedQty, setReceivedQty] = useState("");
  const [diffNote, setDiffNote] = useState("");

  // Formulario de Ajuste / Mermas
  const [adjustmentKind, setAdjustmentKind] = useState<"ADJUSTMENT_EXPIRED" | "ADJUSTMENT_DAMAGED" | "ADJUSTMENT_SHRINKAGE">("ADJUSTMENT_DAMAGED");
  const [adjustmentWarehouseId, setAdjustmentWarehouseId] = useState(warehouses[0]?.id || "wh-main");
  const [adjustmentProductId, setAdjustmentProductId] = useState(products[0]?.id || "prod-001");
  const [adjustmentQty, setAdjustmentQty] = useState("2");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Polyfill de Modern Web Guidance para closedby="any"
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

  const handleConfirmReceive = async () => {
    if (!receivingTransfer) return;
    setErrorMessage(null);
    const recUnits = parseFloat(receivedQty);
    if (isNaN(recUnits) || recUnits < 0) {
      setErrorMessage("Ingresa una cantidad recibida válida.");
      return;
    }

    const sentUnits = receivingTransfer.sentQtyMilli / 1000;
    if (recUnits !== sentUnits && (!diffNote || diffNote.trim().length < 3)) {
      setErrorMessage("Al existir diferencia con la cantidad enviada, la nota explicativa es obligatoria.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (onReceiveTransfer) {
        await onReceiveTransfer({
          transferId: receivingTransfer.id,
          receivedQtyMilli: Math.round(recUnits * 1000),
          diffNote: diffNote.trim() || undefined
        });
      }
      setFeedback(`Traslado ${receivingTransfer.id.slice(0, 8)} recibido exitosamente.`);
      setReceivingTransfer(null);
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
      setErrorMessage("Ingresa una cantidad válida a descontar.");
      return;
    }
    if (!adjustmentReason || adjustmentReason.trim().length < 3) {
      setErrorMessage("El motivo o justificación de la merma/avería es obligatorio (mínimo 3 caracteres).");
      return;
    }

    setIsSubmitting(true);
    try {
      if (onRecordAdjustment) {
        await onRecordAdjustment({
          warehouseId: adjustmentWarehouseId,
          productId: adjustmentProductId,
          kind: adjustmentKind,
          deltaMilli: -Math.round(units * 1000), // Descuento de inventario
          reason: adjustmentReason.trim()
        });
      }
      setFeedback(`Ajuste de inventario (-${units} unidades) registrado en Kardex.`);
      setAdjustmentReason("");
      setAdjustmentQty("2");
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Error al registrar ajuste de inventario.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      id="dialog-warehouse-transfers"
      open={isOpen}
      aria-labelledby="dialog-transfers-title"
      data-testid="warehouse-transfers-dialog"
      style={htmlDialogStyle as any}
      onCancel={handleClose}
    >
      <View style={styles.dialogHeader}>
        <View style={styles.dialogHeaderTitle}>
          <Truck size={22} color="#059669" />
          <Text role="heading" id="dialog-transfers-title" style={styles.title}>
            Traslados y Mermas de Inventario
          </Text>
        </View>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar modal"
          style={htmlCloseBtnStyle}
        >
          &times;
        </button>
      </View>

      {/* Tabs */}
      <View style={styles.tabNav}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "DISPATCH" && styles.tabButtonActive]}
          onPress={() => setActiveTab("DISPATCH")}
          testID="tab-dispatch"
        >
          <ArrowRightLeft size={16} color={activeTab === "DISPATCH" ? "#059669" : "#64748B"} />
          <Text style={[styles.tabText, activeTab === "DISPATCH" && styles.tabTextActive]}>
            Despachar Traslado
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "IN_TRANSIT" && styles.tabButtonActive]}
          onPress={() => setActiveTab("IN_TRANSIT")}
          testID="tab-in-transit"
        >
          <Truck size={16} color={activeTab === "IN_TRANSIT" ? "#059669" : "#64748B"} />
          <Text style={[styles.tabText, activeTab === "IN_TRANSIT" && styles.tabTextActive]}>
            En Tránsito ({transfers.filter((t) => t.status === "IN_TRANSIT").length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "ADJUSTMENT" && styles.tabButtonActive]}
          onPress={() => setActiveTab("ADJUSTMENT")}
          testID="tab-adjustment"
        >
          <PackageMinus size={16} color={activeTab === "ADJUSTMENT" ? "#DC2626" : "#64748B"} />
          <Text style={[styles.tabText, activeTab === "ADJUSTMENT" && styles.tabTextActive]}>
            Averías y Mermas
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mensajes de Feedback o Error */}
      {feedback && (
        <View style={styles.feedbackSuccess} testID="transfer-success-banner">
          <CircleCheck size={16} color="#059669" />
          <Text style={styles.feedbackSuccessText}>{feedback}</Text>
        </View>
      )}

      {errorMessage && (
        <View style={styles.feedbackError} testID="transfer-error-banner">
          <TriangleAlert size={16} color="#DC2626" />
          <Text style={styles.feedbackErrorText}>{errorMessage}</Text>
        </View>
      )}

      <ScrollView style={styles.bodyScroll}>
        {/* TAB 1: DESPACHAR TRASLADO */}
        {activeTab === "DISPATCH" && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionSubtitle}>
              Mueve stock entre sucursales o bodegas satélite con registro de trazabilidad en Kardex
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Bodega de Origen</Text>
              <select
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
                style={styles.htmlSelect as any}
                aria-label="Bodega de Origen"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Bodega de Destino</Text>
              <select
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                style={styles.htmlSelect as any}
                aria-label="Bodega de Destino"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Producto a Trasladar</Text>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                style={styles.htmlSelect as any}
                aria-label="Producto a Trasladar"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — Stock disp: {(p.stockQtyMilli ?? 0) / 1000} un
                  </option>
                ))}
              </select>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Cantidad a Enviar (Unidades)</Text>
              <TextInput
                style={styles.input}
                value={transferQty}
                onChangeText={setTransferQty}
                keyboardType="numeric"
                placeholder="Ej. 15"
                placeholderTextColor="#94A3B8"
                testID="input-transfer-qty"
              />
            </View>

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handleDispatch}
              disabled={isSubmitting}
              testID="btn-dispatch-transfer"
            >
              <Truck size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Despachar Traslado a Ruta</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* TAB 2: EN TRÁNSITO / RECEPCIÓN */}
        {activeTab === "IN_TRANSIT" && (
          <View style={styles.tabContent}>
            {receivingTransfer ? (
              <View style={styles.receivingCard}>
                <Text style={styles.receivingCardTitle}>
                  Confirmar Recepción de Traslado #{receivingTransfer.id.slice(0, 8)}
                </Text>
                <Text style={styles.receivingCardSub}>
                  Producto: {receivingTransfer.productName || receivingTransfer.productId} • Enviado: {receivingTransfer.sentQtyMilli / 1000} un
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Cantidad Realmente Recibida</Text>
                  <TextInput
                    style={styles.input}
                    value={receivedQty}
                    onChangeText={setReceivedQty}
                    placeholder={`Esperado: ${receivingTransfer.sentQtyMilli / 1000}`}
                    keyboardType="numeric"
                    testID="input-received-qty"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Nota / Justificación de Diferencia</Text>
                  <TextInput
                    style={styles.input}
                    value={diffNote}
                    onChangeText={setDiffNote}
                    placeholder="Obligatorio si la cantidad recibida difiere de la enviada..."
                    testID="input-diff-note"
                  />
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={handleConfirmReceive}
                    disabled={isSubmitting}
                    testID="btn-confirm-receive"
                  >
                    <CircleCheck size={16} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>Guardar Entrada de Almacén</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => setReceivingTransfer(null)}
                  >
                    <Text style={styles.btnSecondaryText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : transfers.length === 0 ? (
              <Text style={styles.emptyText}>No hay traslados activos en tránsito.</Text>
            ) : (
              transfers.map((t) => (
                <View key={t.id} style={styles.transferCard} testID={`transfer-card-${t.id}`}>
                  <View style={styles.transferCardHeader}>
                    <View>
                      <Text style={styles.transferCardTitle}>
                        #{t.id.slice(0, 8)}: {t.fromWarehouseId} ➔ {t.toWarehouseId}
                      </Text>
                      <Text style={styles.transferCardProduct}>
                        {t.productName || t.productId} • {t.sentQtyMilli / 1000} unidades enviadas
                      </Text>
                    </View>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 9999,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor: t.status === "IN_TRANSIT" ? "#FEF3C7" : "#DCFCE7",
                        color: t.status === "IN_TRANSIT" ? "#92400E" : "#166534"
                      }}
                    >
                      {t.status === "IN_TRANSIT" ? "En Ruta" : t.status}
                    </span>
                  </View>

                  {t.status === "IN_TRANSIT" && (
                    <TouchableOpacity
                      style={styles.btnReceiveSmall}
                      onPress={() => {
                        setReceivingTransfer(t);
                        setReceivedQty((t.sentQtyMilli / 1000).toString());
                      }}
                      testID={`btn-receive-${t.id}`}
                    >
                      <CircleCheck size={14} color="#059669" />
                      <Text style={styles.btnReceiveSmallText}>Recibir en Bodega Destino</Text>
                    </TouchableOpacity>
                  )}

                  {t.diffNote && (
                    <Text style={styles.diffNoteText}>
                      ⚠️ Novedad: {t.diffNote}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: AVERÍAS, MERMAS Y VENCIMIENTOS */}
        {activeTab === "ADJUSTMENT" && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionSubtitle}>
              Baja legal de inventario por deterioro, rotura o caducidad exigiendo motivo para auditoría DIAN
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Tipo de Ajuste</Text>
              <select
                value={adjustmentKind}
                onChange={(e) => setAdjustmentKind(e.target.value as any)}
                style={styles.htmlSelect as any}
                aria-label="Tipo de Ajuste"
              >
                <option value="ADJUSTMENT_DAMAGED">Avería / Dañado (Rotura, empaque roto)</option>
                <option value="ADJUSTMENT_EXPIRED">Vencido / Caducado (Fecha de vencimiento cumplida)</option>
                <option value="ADJUSTMENT_SHRINKAGE">Merma / Deshidratación (Pérdida natural de peso)</option>
              </select>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Bodega Afectada</Text>
              <select
                value={adjustmentWarehouseId}
                onChange={(e) => setAdjustmentWarehouseId(e.target.value)}
                style={styles.htmlSelect as any}
                aria-label="Bodega Afectada"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Producto</Text>
              <select
                value={adjustmentProductId}
                onChange={(e) => setAdjustmentProductId(e.target.value)}
                style={styles.htmlSelect as any}
                aria-label="Producto de Avería"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Cantidad a Descontar (Unidades)</Text>
              <TextInput
                style={styles.input}
                value={adjustmentQty}
                onChangeText={setAdjustmentQty}
                keyboardType="numeric"
                placeholder="Ej. 2"
                placeholderTextColor="#94A3B8"
                testID="input-adj-qty"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Motivo o Justificación Detallada</Text>
              <TextInput
                style={[styles.input, { height: 72 }]}
                value={adjustmentReason}
                onChangeText={setAdjustmentReason}
                multiline
                placeholder="Ej. Se rompieron 2 botellas de vidrio al descargar la estiba..."
                placeholderTextColor="#94A3B8"
                testID="input-adj-reason"
              />
            </View>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: "#DC2626" }]}
              onPress={handleRecordAdjustment}
              disabled={isSubmitting}
              testID="btn-record-adjustment"
            >
              <PackageMinus size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Registrar Ajuste en Kardex</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </dialog>
  );
}

const htmlDialogStyle: React.CSSProperties = {
  padding: 0,
  borderRadius: 16,
  border: "none",
  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  width: "min(680px, 94vw)",
  backgroundColor: "#FFFFFF",
  overflow: "hidden",
  overscrollBehavior: "contain"
};

const htmlCloseBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: "1.5rem",
  cursor: "pointer",
  color: "#64748B",
  padding: 4
};

const styles = StyleSheet.create({
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0"
  },
  dialogHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A"
  },
  tabNav: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF"
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  tabButtonActive: {
    borderBottomColor: "#059669"
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B"
  },
  tabTextActive: {
    color: "#059669",
    fontWeight: "700"
  },
  bodyScroll: {
    maxHeight: 520,
    padding: 20
  },
  tabContent: {
    gap: 14
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 4
  },
  formGroup: {
    gap: 6
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155"
  },
  htmlSelect: {
    width: "100%",
    height: 42,
    borderRadius: 8,
    borderColor: "#CBD5E1",
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#FFFFFF"
  },
  input: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#FFFFFF"
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    backgroundColor: "#059669",
    borderRadius: 8,
    marginTop: 8
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600"
  },
  btnSecondary: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 16
  },
  btnSecondaryText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600"
  },
  feedbackSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 10,
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 8
  },
  feedbackSuccessText: {
    fontSize: 13,
    color: "#065F46",
    fontWeight: "500"
  },
  feedbackError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 10,
    marginHorizontal: 20,
    marginTop: 14,
    borderRadius: 8
  },
  feedbackErrorText: {
    fontSize: 13,
    color: "#991B1B",
    fontWeight: "500"
  },
  transferCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    gap: 10
  },
  transferCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  transferCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A"
  },
  transferCardProduct: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2
  },
  btnReceiveSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6
  },
  btnReceiveSmallText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#065F46"
  },
  diffNoteText: {
    fontSize: 12,
    color: "#DC2626",
    backgroundColor: "#FEF2F2",
    padding: 6,
    borderRadius: 6
  },
  receivingCard: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#059669",
    backgroundColor: "#F0FDF4",
    gap: 12
  },
  receivingCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#065F46"
  },
  receivingCardSub: {
    fontSize: 13,
    color: "#047857"
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },
  emptyText: {
    textAlign: "center",
    color: "#94A3B8",
    paddingVertical: 30,
    fontSize: 14
  }
});
