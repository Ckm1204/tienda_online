import React, { useState, useRef } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import Camera from "lucide-react-native/icons/camera";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Check from "lucide-react-native/icons/check";
import Trash from "lucide-react-native/icons/trash";

export type AdjustmentReason =
  | "MERMA"
  | "AVERIA"
  | "VENCIDO"
  | "CONSUMO_PROPIO"
  | "CONTEO_FISICO";

export interface InventoryItemRow {
  productId: string;
  name: string;
  barcode: string;
  unitCostCents: number;
  systemQtyMilli: number;
  countedQtyMilli: number;
}

export interface InventoryAdjustmentsScreenProps {
  initialItems?: InventoryItemRow[];
  onConfirmAdjustment: (reason: AdjustmentReason, items: InventoryItemRow[]) => Promise<void> | void;
  loading?: boolean;
}

export function InventoryAdjustmentsScreen({
  initialItems = [],
  onConfirmAdjustment,
  loading = false
}: InventoryAdjustmentsScreenProps) {
  const [reason, setReason] = useState<AdjustmentReason>("CONTEO_FISICO");
  const [items, setItems] = useState<InventoryItemRow[]>(initialItems);
  const [continuousScanActive, setContinuousScanActive] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const lastScanTimeRef = useRef<number>(0);

  // HU-328: Modo continuo de escaneo con debounce de 1.2s y vibración háptica
  const handleSimulateBarcodeScan = (barcode: string) => {
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1200) {
      // Debounce anti-rebote activo
      return;
    }
    lastScanTimeRef.current = now;

    // Disparar vibración háptica si está soportada
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(60);
    }

    setItems((prev) => {
      const idx = prev.findIndex((p) => p.barcode === barcode);
      if (idx >= 0) {
        const updated = [...prev];
        const current = updated[idx]!;
        updated[idx] = {
          ...current,
          countedQtyMilli: current.countedQtyMilli + 1000 // +1 unidad
        };
        return updated;
      } else {
        // Nuevo producto encontrado
        return [
          ...prev,
          {
            productId: `prod-${barcode}`,
            name: `Producto ${barcode}`,
            barcode,
            unitCostCents: 200000,
            systemQtyMilli: 0,
            countedQtyMilli: 1000
          }
        ];
      }
    });
    setScannedBarcode("");
  };

  const handleUpdateCount = (index: number, newCountUnits: number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = updated[index]!;
      updated[index] = {
        ...item,
        countedQtyMilli: Math.round(newCountUnits * 1000)
      };
      return updated;
    });
  };

  const handleRemoveRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Totales
  const totalDifferenceUnits = items.reduce(
    (sum, item) => sum + (item.countedQtyMilli - item.systemQtyMilli) / 1000,
    0
  );
  const totalDifferenceCents = items.reduce((sum, item) => {
    const diffUnits = (item.countedQtyMilli - item.systemQtyMilli) / 1000;
    return sum + diffUnits * item.unitCostCents;
  }, 0);

  return (
    <View style={styles.container} testID="inventory-adjustments-screen">
      <Text style={styles.title}>Ajustes de Inventario y Conteo Físico</Text>
      <Text style={styles.subtitle}>
        Realiza inventarios relámpago con la cámara de tu celular o registra mermas, averías y vencimientos.
      </Text>

      {/* Selector de motivo */}
      <View style={styles.reasonsRow}>
        {(["CONTEO_FISICO", "MERMA", "AVERIA", "VENCIDO", "CONSUMO_PROPIO"] as AdjustmentReason[]).map(
          (r) => {
            const isSelected = reason === r;
            const labelMap: Record<AdjustmentReason, string> = {
              CONTEO_FISICO: "Conteo Físico",
              MERMA: "Merma",
              AVERIA: "Avería",
              VENCIDO: "Vencimiento",
              CONSUMO_PROPIO: "Consumo Propio"
            };
            return (
              <TouchableOpacity
                key={r}
                style={[styles.reasonTab, isSelected && styles.reasonTabActive]}
                onPress={() => setReason(r)}
                testID={`tab-reason-${r.toLowerCase()}`}
              >
                <Text style={[styles.reasonTabText, isSelected && styles.reasonTabTextActive]}>
                  {labelMap[r]}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
      </View>

      {/* Barra de escáner continuo (HU-328) */}
      <View style={styles.scannerCard}>
        <View style={styles.scannerHeader}>
          <View style={styles.scannerTitleRow}>
            <Camera size={20} color="#24734e" />
            <Text style={styles.scannerTitle}>Escáner Continuo (Modo Ráfaga)</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggleBurstBtn, continuousScanActive && styles.toggleBurstBtnActive]}
            onPress={() => setContinuousScanActive((prev) => !prev)}
            testID="btn-toggle-continuous-scan"
          >
            <Text
              style={[
                styles.toggleBurstText,
                continuousScanActive && styles.toggleBurstTextActive
              ]}
            >
              {continuousScanActive ? "Escaneo Continuo: ACTIVO" : "Activar Escáner"}
            </Text>
          </TouchableOpacity>
        </View>

        {continuousScanActive && (
          <View style={styles.continuousInputRow}>
            <TextInput
              style={styles.scannerInput}
              value={scannedBarcode}
              onChangeText={setScannedBarcode}
              onSubmitEditing={() => handleSimulateBarcodeScan(scannedBarcode)}
              placeholder="Apunta la cámara o digita código de barras..."
              autoFocus
              testID="input-continuous-scanner"
            />
            <TouchableOpacity
              style={styles.addScanBtn}
              onPress={() => handleSimulateBarcodeScan(scannedBarcode)}
              testID="btn-submit-scan"
            >
              <Check size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tabla comparativa: Sistema vs Contado vs Diferencia (HU-234) */}
      <ScrollView style={styles.tableScroll}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 2 }]}>Producto</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "center" }]}>Sistema</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "center" }]}>Contado</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Diferencia</Text>
          <Text style={[styles.th, { width: 40 }]}> </Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No hay productos agregados al conteo.</Text>
          </View>
        ) : (
          items.map((item, index) => {
            const systemUnits = item.systemQtyMilli / 1000;
            const countedUnits = item.countedQtyMilli / 1000;
            const diffUnits = countedUnits - systemUnits;
            const diffCents = diffUnits * item.unitCostCents;

            return (
              <View key={item.productId} style={styles.tableRow} testID={`item-row-${item.productId}`}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productMeta}>EAN: {item.barcode}</Text>
                </View>

                <Text style={[styles.cellText, { flex: 1, textAlign: "center" }]}>
                  {systemUnits} und
                </Text>

                <View style={{ flex: 1, alignItems: "center" }}>
                  <TextInput
                    style={styles.countInput}
                    value={String(countedUnits)}
                    onChangeText={(val) => handleUpdateCount(index, parseFloat(val) || 0)}
                    keyboardType="numeric"
                    testID={`input-count-${item.productId}`}
                  />
                </View>

                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.diffUnitsText,
                      diffUnits < 0 ? styles.textRed : diffUnits > 0 ? styles.textGreen : styles.textGray
                    ]}
                  >
                    {diffUnits > 0 ? `+${diffUnits}` : diffUnits} und
                  </Text>
                  <Text style={styles.diffMoneyText}>
                    ${(diffCents / 100).toLocaleString("es-CO")}
                  </Text>
                </View>

                <TouchableOpacity
                  style={{ width: 40, alignItems: "center" }}
                  onPress={() => handleRemoveRow(index)}
                  testID={`btn-remove-${item.productId}`}
                >
                  <Trash size={16} color="#b3261e" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Resumen y botón de confirmación */}
      <View style={styles.summaryFooter}>
        <View>
          <Text style={styles.summaryLabel}>Diferencia neta estimada:</Text>
          <Text
            style={[
              styles.summaryTotal,
              totalDifferenceUnits < 0 ? styles.textRed : totalDifferenceUnits > 0 ? styles.textGreen : styles.textGray
            ]}
          >
            {totalDifferenceUnits > 0 ? `+${totalDifferenceUnits}` : totalDifferenceUnits} unidades ($
            {(totalDifferenceCents / 100).toLocaleString("es-CO")})
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, (loading || items.length === 0) && styles.confirmBtnDisabled]}
          disabled={loading || items.length === 0}
          onPress={() => onConfirmAdjustment(reason, items)}
          testID="btn-confirm-adjustment"
        >
          <Check size={18} color="#ffffff" />
          <Text style={styles.confirmBtnText}>
            {loading ? "Aplicando..." : "Aplicar Ajuste"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    maxWidth: 920,
    width: "100%",
    alignSelf: "center"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1d1b20",
    marginBottom: 6
  },
  subtitle: {
    fontSize: 14,
    color: "#69656c",
    marginBottom: 16
  },
  reasonsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap"
  },
  reasonTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    backgroundColor: "#ffffff"
  },
  reasonTabActive: {
    borderColor: "#24734e",
    backgroundColor: "#e8f5e9"
  },
  reasonTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#49454e"
  },
  reasonTabTextActive: {
    color: "#24734e",
    fontWeight: "700"
  },
  scannerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    padding: 16,
    marginBottom: 16
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  scannerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  scannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1d1b20"
  },
  toggleBurstBtn: {
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  toggleBurstBtnActive: {
    backgroundColor: "#24734e"
  },
  toggleBurstText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#24734e"
  },
  toggleBurstTextActive: {
    color: "#ffffff"
  },
  continuousInputRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  scannerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#24734e",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14
  },
  addScanBtn: {
    backgroundColor: "#24734e",
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center"
  },
  tableScroll: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    maxHeight: 400
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f7f5f8",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e3e1e6"
  },
  th: {
    fontSize: 12,
    fontWeight: "700",
    color: "#69656c",
    textTransform: "uppercase"
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0edf1"
  },
  productName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1d1b20"
  },
  productMeta: {
    fontSize: 12,
    color: "#8f8b94"
  },
  cellText: {
    fontSize: 14,
    color: "#49454e"
  },
  countInput: {
    borderWidth: 1,
    borderColor: "#c4c0c8",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 60,
    textAlign: "center",
    fontSize: 14
  },
  diffUnitsText: {
    fontSize: 14,
    fontWeight: "700"
  },
  diffMoneyText: {
    fontSize: 11,
    color: "#8f8b94"
  },
  textRed: {
    color: "#b3261e"
  },
  textGreen: {
    color: "#24734e"
  },
  textGray: {
    color: "#69656c"
  },
  emptyContainer: {
    padding: 30,
    alignItems: "center"
  },
  emptyText: {
    color: "#8f8b94",
    fontSize: 14
  },
  summaryFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e3e1e6"
  },
  summaryLabel: {
    fontSize: 12,
    color: "#69656c",
    textTransform: "uppercase",
    fontWeight: "600"
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: "800"
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#24734e",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10
  },
  confirmBtnDisabled: {
    opacity: 0.5
  },
  confirmBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15
  }
});
