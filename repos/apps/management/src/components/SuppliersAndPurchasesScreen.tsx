import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import Truck from "lucide-react-native/icons/truck";
import Package from "lucide-react-native/icons/package";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Plus from "lucide-react-native/icons/plus";
import Check from "lucide-react-native/icons/check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleDollarSign from "lucide-react-native/icons/circle-dollar-sign";
import Calendar from "lucide-react-native/icons/calendar";

export interface SupplierItem {
  id: string;
  name: string;
  phone: string;
  visitDays: number[]; // 1=Lunes .. 7=Domingo
  productIds: string[];
}

export interface SuggestedOrderItemRow {
  productId: string;
  productName: string;
  onHandMilli: number;
  minStockMilli: number;
  idealStockMilli: number;
  suggestedQtyMilli: number;
  avgCostCents: number;
  estimatedLineCostCents: number;
}

export interface SuggestedOrderCard {
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  visitDays: number[];
  items: SuggestedOrderItemRow[];
  totalEstimatedCostCents: number;
  whatsappOrderText: string;
}

export interface InboundReceiptLine {
  productId: string;
  productName: string;
  qtyMilli: number;
  unitCostCents: number;
  batchExpiryDate?: string;
  currentAvgCostCents?: number;
  currentOnHandMilli?: number;
}

export interface CashSessionOption {
  id: string;
  terminalCode: string;
  cashierName: string;
  expectedCashCents: number;
}

export interface SuppliersAndPurchasesScreenProps {
  suppliers: SupplierItem[];
  suggestedOrders: SuggestedOrderCard[];
  cashSessions?: CashSessionOption[];
  onCreateSupplier?: (supplier: Omit<SupplierItem, "id">) => Promise<void> | void;
  onRecordReceipt?: (params: {
    warehouseId: string;
    paidFromCashSessionId?: string | null;
    lines: Array<{ productId: string; qtyMilli: number; unitCostCents: number; batchExpiryDate?: string }>;
  }) => Promise<void> | void;
}

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatCOP(cents: number): string {
  return "$" + (cents / 100).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " COP";
}

export function SuppliersAndPurchasesScreen({
  suppliers = [],
  suggestedOrders = [],
  cashSessions = [],
  onCreateSupplier,
  onRecordReceipt
}: SuppliersAndPurchasesScreenProps) {
  const [activeTab, setActiveTab] = useState<"suppliers" | "suggested" | "receipt">("suppliers");
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupDays, setNewSupDays] = useState<number[]>([1, 3, 5]);

  // Formulario de Recepción
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("wh-main");
  const [selectedCashSessionId, setSelectedCashSessionId] = useState<string>("");
  const [receiptLines, setReceiptLines] = useState<InboundReceiptLine[]>([
    {
      productId: "prod-pan-tajado",
      productName: "Pan Tajado Familiar 500g",
      qtyMilli: 20000,
      unitCostCents: 250000,
      currentAvgCostCents: 240000,
      currentOnHandMilli: 10000
    }
  ]);

  const handleAddReceiptLine = () => {
    setReceiptLines((prev) => [
      ...prev,
      {
        productId: `prod-item-${prev.length + 1}`,
        productName: `Nuevo Producto ${prev.length + 1}`,
        qtyMilli: 10000,
        unitCostCents: 200000,
        currentAvgCostCents: 190000,
        currentOnHandMilli: 5000
      }
    ]);
  };

  const handleSaveSupplier = async () => {
    if (!newSupName.trim()) return;
    if (onCreateSupplier) {
      await onCreateSupplier({
        name: newSupName.trim(),
        phone: newSupPhone.trim(),
        visitDays: newSupDays,
        productIds: []
      });
    }
    setIsNewSupplierModalOpen(false);
    setNewSupName("");
    setNewSupPhone("");
  };

  const handleLoadOrderIntoReceipt = (order: SuggestedOrderCard) => {
    const lines: InboundReceiptLine[] = order.items.map((it) => ({
      productId: it.productId,
      productName: it.productName,
      qtyMilli: it.suggestedQtyMilli,
      unitCostCents: it.avgCostCents > 0 ? it.avgCostCents : 200000,
      currentAvgCostCents: it.avgCostCents,
      currentOnHandMilli: it.onHandMilli
    }));
    setReceiptLines(lines);
    setActiveTab("receipt");
  };

  const calculateReceiptTotalCents = () => {
    return receiptLines.reduce((acc, l) => acc + Math.round((l.qtyMilli * l.unitCostCents) / 1000), 0);
  };

  return (
    <View style={styles.container} testID="suppliers-and-purchases-screen">
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text role="heading" style={styles.title}>
            Gestión de Proveedores & Compras
          </Text>
          <Text style={styles.subtitle}>
            Proveedores directos, pedidos sugeridos de preventa y recepción de mercancía (HU-089, HU-191, HU-304, HU-356)
          </Text>
        </View>
        {activeTab === "suppliers" && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setIsNewSupplierModalOpen(true)}
            testID="btn-open-new-supplier"
          >
            <Plus size={16} color="#ffffff" />
            <Text style={styles.primaryBtnText}>Nuevo Proveedor</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Navegación por pestañas */}
      <View style={styles.tabBar} role="tablist">
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "suppliers" && styles.tabButtonActive]}
          onPress={() => setActiveTab("suppliers")}
          testID="tab-suppliers"
        >
          <Truck size={16} color={activeTab === "suppliers" ? "#1e40af" : "#64748b"} />
          <Text style={[styles.tabText, activeTab === "suppliers" && styles.tabTextActive]}>
            Proveedores ({suppliers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "suggested" && styles.tabButtonActive]}
          onPress={() => setActiveTab("suggested")}
          testID="tab-suggested-orders"
        >
          <MessageCircle size={16} color={activeTab === "suggested" ? "#1e40af" : "#64748b"} />
          <Text style={[styles.tabText, activeTab === "suggested" && styles.tabTextActive]}>
            Pedidos Sugeridos ({suggestedOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "receipt" && styles.tabButtonActive]}
          onPress={() => setActiveTab("receipt")}
          testID="tab-receipt"
        >
          <Package size={16} color={activeTab === "receipt" ? "#1e40af" : "#64748b"} />
          <Text style={[styles.tabText, activeTab === "receipt" && styles.tabTextActive]}>
            Recepción de Mercancía
          </Text>
        </TouchableOpacity>
      </View>

      {/* Contenido Pestaña 1: Proveedores */}
      {activeTab === "suppliers" && (
        <ScrollView style={styles.content}>
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }} role="region" aria-label="Tabla de Proveedores">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "12px 16px", color: "#475569" }}>Proveedor</th>
                  <th style={{ padding: "12px 16px", color: "#475569" }}>WhatsApp / Contacto</th>
                  <th style={{ padding: "12px 16px", color: "#475569" }}>Días de Visita (Preventa)</th>
                  <th style={{ padding: "12px 16px", color: "#475569" }}>Productos Asociados</th>
                  <th style={{ padding: "12px 16px", color: "#475569", textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }} data-testid="empty-suppliers">
                      No hay proveedores registrados aún. Agrega uno con el botón superior.
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }} data-testid={`supplier-row-${s.id}`}>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>{s.name}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <a
                          href={`https://wa.me/57${s.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#16a34a", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                          data-testid={`link-whatsapp-${s.id}`}
                        >
                          <MessageCircle size={14} color="#16a34a" /> {s.phone || "Sin teléfono"}
                        </a>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {s.visitDays.map((d) => (
                            <span
                              key={d}
                              style={{ backgroundColor: "#eff6ff", color: "#1e40af", padding: "2px 6px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 600 }}
                            >
                              {DAY_NAMES[d - 1] ?? `Día ${d}`}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#64748b" }}>
                        {s.productIds.length} productos
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <button
                          type="button"
                          style={{
                            padding: "6px 12px",
                            backgroundColor: "#eff6ff",
                            color: "#1e40af",
                            border: "1px solid #bfdbfe",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            fontWeight: 600
                          }}
                          data-testid={`btn-order-sup-${s.id}`}
                          onClick={() => {
                            const foundOrder = suggestedOrders.find((o) => o.supplierId === s.id);
                            if (foundOrder) handleLoadOrderIntoReceipt(foundOrder);
                            else setActiveTab("suggested");
                          }}
                        >
                          Ver Pedido
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ScrollView>
      )}

      {/* Contenido Pestaña 2: Pedidos Sugeridos */}
      {activeTab === "suggested" && (
        <ScrollView style={styles.content}>
          {suggestedOrders.length === 0 ? (
            <View style={styles.emptyCard} testID="empty-suggested-orders">
              <Check size={32} color="#16a34a" />
              <Text style={styles.emptyTitle}>Inventario Óptimo</Text>
              <Text style={styles.emptyText}>
                No hay productos por debajo del stock mínimo para los proveedores registrados.
              </Text>
            </View>
          ) : (
            suggestedOrders.map((order) => (
              <View key={order.supplierId} style={styles.orderCard} testID={`suggested-card-${order.supplierId}`}>
                <View style={styles.orderCardHeader}>
                  <View>
                    <Text style={styles.orderSupName}>{order.supplierName}</Text>
                    <Text style={styles.orderSupPhone}>Teléfono preventa: {order.supplierPhone}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.orderTotalTitle}>Total Estimado Pedido</Text>
                    <Text style={styles.orderTotalValue}>{formatCOP(order.totalEstimatedCostCents)}</Text>
                  </View>
                </View>

                {/* Tabla de ítems sugeridos */}
                <div style={{ overflowX: "auto", margin: "12px 0" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", textAlign: "left" }}>
                        <th style={{ padding: "8px 6px" }}>Producto</th>
                        <th style={{ padding: "8px 6px", textAlign: "center" }}>Stock Actual</th>
                        <th style={{ padding: "8px 6px", textAlign: "center" }}>Mínimo</th>
                        <th style={{ padding: "8px 6px", textAlign: "center" }}>Sugerido</th>
                        <th style={{ padding: "8px 6px", textAlign: "right" }}>Costo Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((it) => (
                        <tr key={it.productId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 6px", fontWeight: 600 }}>{it.productName || it.productId}</td>
                          <td style={{ padding: "8px 6px", textAlign: "center", color: "#dc2626", fontWeight: 700 }}>
                            {it.onHandMilli / 1000} und
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "center" }}>{it.minStockMilli / 1000} und</td>
                          <td style={{ padding: "8px 6px", textAlign: "center", color: "#16a34a", fontWeight: 700 }}>
                            +{it.suggestedQtyMilli / 1000} und
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>{formatCOP(it.estimatedLineCostCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Acciones */}
                <View style={styles.orderActions}>
                  <a
                    href={`https://wa.me/57${order.supplierPhone.replace(/\D/g, "")}?text=${encodeURIComponent(order.whatsappOrderText)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: "#16a34a",
                      color: "#ffffff",
                      padding: "8px 16px",
                      borderRadius: 6,
                      textDecoration: "none",
                      fontSize: "0.85rem",
                      fontWeight: 600
                    }}
                    data-testid={`btn-whatsapp-order-${order.supplierId}`}
                  >
                    <MessageCircle size={16} color="#ffffff" />
                    Enviar Pedido por WhatsApp
                  </a>

                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => handleLoadOrderIntoReceipt(order)}
                    testID={`btn-load-receipt-${order.supplierId}`}
                  >
                    <Package size={16} color="#1e40af" />
                    <Text style={styles.secondaryBtnText}>Cargar en Recepción</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Contenido Pestaña 3: Recepción de Mercancía */}
      {activeTab === "receipt" && (
        <ScrollView style={styles.content}>
          <View style={styles.receiptFormCard}>
            <Text style={styles.sectionHeaderTitle}>Entrada de Almacén & Actualización de Costo Promedio</Text>

            {/* Opciones de Bodega y Turno de Caja */}
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <label style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>Bodega de Destino:</label>
                <select
                  style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", padding: "0 8px", marginTop: 4 }}
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  data-testid="select-receipt-warehouse"
                >
                  <option value="wh-main">Bodega Principal (Sede Central)</option>
                  <option value="wh-sucursal-norte">Sucursal Norte</option>
                </select>
              </View>

              <View style={{ flex: 1 }}>
                <label style={{ fontSize: "0.8rem", color: "#475569", fontWeight: 600 }}>
                  💵 Pagar de Caja (Egreso Turno Activo - HU-304):
                </label>
                <select
                  style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", padding: "0 8px", marginTop: 4 }}
                  value={selectedCashSessionId}
                  onChange={(e) => setSelectedCashSessionId(e.target.value)}
                  data-testid="select-receipt-cash-session"
                >
                  <option value="">No deducir de caja (Factura a Crédito / Transferencia)</option>
                  {cashSessions.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {cs.terminalCode} - {cs.cashierName} (Disponible: {formatCOP(cs.expectedCashCents)})
                    </option>
                  ))}
                </select>
              </View>
            </View>

            {/* Tabla de Productos a Recibir */}
            <div style={{ overflowX: "auto", margin: "16px 0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px" }}>Producto</th>
                    <th style={{ padding: "8px 12px", width: 120 }}>Cantidad</th>
                    <th style={{ padding: "8px 12px", width: 140 }}>Costo Compra</th>
                    <th style={{ padding: "8px 12px", width: 140 }}>Vencimiento</th>
                    <th style={{ padding: "8px 12px" }}>Nuevo Costo Ponderado</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptLines.map((line, idx) => {
                    const lineSubtotalCents = Math.round((line.qtyMilli * line.unitCostCents) / 1000);
                    // Recálculo en vivo de costo promedio ponderado
                    const currentPosOnHand = Math.max(0, line.currentOnHandMilli ?? 0);
                    const currentAvgCost = line.currentAvgCostCents ?? line.unitCostCents;
                    const newTotalQty = currentPosOnHand + line.qtyMilli;
                    const newAvgCostCents = newTotalQty > 0
                      ? Math.round((currentPosOnHand * currentAvgCost + line.qtyMilli * line.unitCostCents) / newTotalQty)
                      : line.unitCostCents;

                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }} data-testid={`receipt-line-${idx}`}>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{line.productName}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="number"
                            min="1"
                            value={line.qtyMilli / 1000}
                            style={{ width: "100%", height: 32, borderRadius: 4, border: "1px solid #cbd5e1", padding: "0 6px" }}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setReceiptLines((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx]!, qtyMilli: Math.round(val * 1000) };
                                return next;
                              });
                            }}
                            data-testid={`input-receipt-qty-${idx}`}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="number"
                            min="100"
                            step="100"
                            value={line.unitCostCents / 100}
                            style={{ width: "100%", height: 32, borderRadius: 4, border: "1px solid #cbd5e1", padding: "0 6px" }}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setReceiptLines((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx]!, unitCostCents: Math.round(val * 100) };
                                return next;
                              });
                            }}
                            data-testid={`input-receipt-cost-${idx}`}
                          />
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <input
                            type="date"
                            value={line.batchExpiryDate || ""}
                            style={{ width: "100%", height: 32, borderRadius: 4, border: "1px solid #cbd5e1", padding: "0 6px" }}
                            onChange={(e) => {
                              const val = e.target.value;
                              setReceiptLines((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx]!, batchExpiryDate: val };
                                return next;
                              });
                            }}
                            data-testid={`input-receipt-expiry-${idx}`}
                          />
                        </td>
                        <td style={{ padding: "8px 12px", color: "#1e40af", fontWeight: 700 }} data-testid={`text-new-avg-cost-${idx}`}>
                          {formatCOP(newAvgCostCents)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>
                          {formatCOP(lineSubtotalCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleAddReceiptLine} testID="btn-add-receipt-row">
                <Plus size={16} color="#1e40af" />
                <Text style={styles.secondaryBtnText}>+ Agregar Otra Línea</Text>
              </TouchableOpacity>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: "0.85rem", color: "#64748b" }}>Total Factura Recepción:</Text>
                <Text style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1e293b" }} testID="text-receipt-grand-total">
                  {formatCOP(calculateReceiptTotalCents())}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 20, alignSelf: "flex-end" }]}
              onPress={async () => {
                if (onRecordReceipt) {
                  await onRecordReceipt({
                    warehouseId: selectedWarehouseId,
                    paidFromCashSessionId: selectedCashSessionId || null,
                    lines: receiptLines.map((l) => ({
                      productId: l.productId,
                      qtyMilli: l.qtyMilli,
                      unitCostCents: l.unitCostCents,
                      batchExpiryDate: l.batchExpiryDate
                    }))
                  });
                }
              }}
              testID="btn-confirm-receipt"
            >
              <Check size={16} color="#ffffff" />
              <Text style={styles.primaryBtnText}>Confirmar Recepción y Actualizar Stock</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Modal Nuevo Proveedor (Modern Web Guidance Native Dialog) */}
      {isNewSupplierModalOpen && (
        <dialog
          open
          closedby="any"
          aria-labelledby="modal-new-supplier-title"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "#ffffff",
            padding: 24,
            borderRadius: 12,
            border: "1px solid #cbd5e1",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            width: "90%",
            maxWidth: 480,
            zIndex: 1000,
            overscrollBehavior: "contain"
          }}
          data-testid="modal-new-supplier"
        >
          <h3 id="modal-new-supplier-title" style={{ margin: "0 0 16px 0", fontSize: "1.2rem", color: "#1e293b" }}>
            Registrar Nuevo Proveedor
          </h3>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600 }}>Nombre Comercial:</label>
            <input
              type="text"
              placeholder="ej. Distribuidora Bavaria / Postobón"
              value={newSupName}
              onChange={(e) => setNewSupName(e.target.value)}
              style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", padding: "0 10px", marginTop: 4 }}
              data-testid="input-supplier-name"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600 }}>WhatsApp Preventista:</label>
            <input
              type="tel"
              placeholder="ej. 3101234567"
              value={newSupPhone}
              onChange={(e) => setNewSupPhone(e.target.value)}
              style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid #cbd5e1", padding: "0 10px", marginTop: 4 }}
              data-testid="input-supplier-phone"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600 }}>Días de Visita de Preventa:</label>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {[1, 2, 3, 4, 5, 6].map((dayNum) => {
                const isSelected = newSupDays.includes(dayNum);
                return (
                  <button
                    key={dayNum}
                    type="button"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: isSelected ? "1px solid #1e40af" : "1px solid #cbd5e1",
                      backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                      color: isSelected ? "#1e40af" : "#475569",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "0.8rem"
                    }}
                    onClick={() => {
                      setNewSupDays((prev) =>
                        prev.includes(dayNum) ? prev.filter((d) => d !== dayNum) : [...prev, dayNum]
                      );
                    }}
                    data-testid={`btn-day-${dayNum}`}
                  >
                    {DAY_NAMES[dayNum - 1]}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #cbd5e1", backgroundColor: "#ffffff", cursor: "pointer" }}
              onClick={() => setIsNewSupplierModalOpen(false)}
              data-testid="btn-cancel-supplier"
            >
              Cancelar
            </button>
            <button
              type="button"
              style={{ padding: "8px 16px", borderRadius: 6, border: "none", backgroundColor: "#1e40af", color: "#ffffff", fontWeight: 700, cursor: "pointer" }}
              onClick={handleSaveSupplier}
              data-testid="btn-save-supplier"
            >
              Guardar Proveedor
            </button>
          </div>
        </dialog>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 24
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a"
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1e40af",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  primaryBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6
  },
  secondaryBtnText: {
    color: "#1e40af",
    fontWeight: "600",
    fontSize: 13
  },
  tabBar: {
    flexDirection: "row",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    marginBottom: 16
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  tabButtonActive: {
    borderBottomColor: "#1e40af"
  },
  tabText: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "500"
  },
  tabTextActive: {
    color: "#1e40af",
    fontWeight: "700"
  },
  content: {
    flex: 1
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginTop: 12
  },
  emptyText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4
  },
  orderCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 16
  },
  orderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 10
  },
  orderSupName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b"
  },
  orderSupPhone: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2
  },
  orderTotalTitle: {
    fontSize: 11,
    color: "#64748b"
  },
  orderTotalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e40af"
  },
  orderActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 10
  },
  receiptFormCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 16
  },
  formRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16
  }
});
