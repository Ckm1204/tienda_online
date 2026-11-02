import React, { useState, useEffect } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import Calculator from "lucide-react-native/icons/calculator";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Plus from "lucide-react-native/icons/plus";
import Trash from "lucide-react-native/icons/trash";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";

export interface ProductFormData {
  id?: string;
  sku: string;
  name: string;
  categoryId: string | null;
  unit: string;
  isWeighted: boolean;
  trackStock: boolean;
  allowNegativeStock: boolean;
  costCents: number;
  basePriceCents: number;
  taxCodes: string[];
  barcodes: { barcode: string; packQtyMilli: number; presentationName?: string }[];
}

export interface ProductFormProps {
  initialData?: Partial<ProductFormData>;
  categories?: { id: string; name: string }[];
  onSave: (data: ProductFormData) => Promise<void> | void;
  onCancel: () => void;
  loading?: boolean;
}

export function ProductForm({
  initialData,
  categories = [],
  onSave,
  onCancel,
  loading = false
}: ProductFormProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    id: initialData?.id,
    sku: initialData?.sku || `SKU-${Date.now()}`,
    name: initialData?.name || "",
    categoryId: initialData?.categoryId ?? null,
    unit: initialData?.unit || "UND",
    isWeighted: initialData?.isWeighted ?? false,
    trackStock: initialData?.trackStock ?? true,
    allowNegativeStock: initialData?.allowNegativeStock ?? false,
    costCents: initialData?.costCents ?? 0,
    basePriceCents: initialData?.basePriceCents ?? 0,
    taxCodes: initialData?.taxCodes || ["IVA_EXENTO"],
    barcodes: initialData?.barcodes || []
  });

  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [showPackCalculator, setShowPackCalculator] = useState(false);

  // Estados de la calculadora de paca (HU-357)
  const [packCostInput, setPackCostInput] = useState("43200");
  const [unitsPerPackInput, setUnitsPerPackInput] = useState("24");
  const [desiredMarginInput, setDesiredMarginInput] = useState("25");

  // Código de barras temporal para agregar
  const [newBarcode, setNewBarcode] = useState("");

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Cálculos en vivo de margen y ganancia (HU-230, HU-422)
  const profitCents = formData.basePriceCents - formData.costCents;
  const marginRatio = formData.basePriceCents > 0 ? (profitCents / formData.basePriceCents) * 100 : 0;
  const isLossMaking = formData.basePriceCents > 0 && formData.costCents > formData.basePriceCents;

  const handleApplyPackCalculation = () => {
    const packCost = parseFloat(packCostInput) || 0;
    const units = parseInt(unitsPerPackInput, 10) || 1;
    const margin = (parseFloat(desiredMarginInput) || 20) / 100;

    const unitCost = Math.round(packCost / units);
    const rawPrice = Math.round(unitCost / (1 - margin));
    // Redondeo obligatorio a múltiplos de $50 COP
    const roundedPrice = Math.round(rawPrice / 50) * 50;

    setFormData((prev) => ({
      ...prev,
      costCents: unitCost * 100, // en centavos
      basePriceCents: roundedPrice * 100
    }));
    markDirty();
    setShowPackCalculator(false);
  };

  const handleAddBarcode = () => {
    if (!newBarcode.trim()) return;
    setFormData((prev) => ({
      ...prev,
      barcodes: [...prev.barcodes, { barcode: newBarcode.trim(), packQtyMilli: 1000 }]
    }));
    setNewBarcode("");
    markDirty();
  };

  const handleRemoveBarcode = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      barcodes: prev.barcodes.filter((_, i) => i !== index)
    }));
    markDirty();
  };

  const handleCancelClick = () => {
    if (isDirty) {
      setShowUnsavedPrompt(true);
    } else {
      onCancel();
    }
  };

  return (
    <ScrollView style={styles.container} testID="product-form-container">
      {/* Diálogo de cambios sin guardar (HU-330) */}
      {showUnsavedPrompt && (
        <View style={styles.modalOverlay} testID="unsaved-changes-dialog">
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconCircle}>
              <TriangleAlert size={24} color="#d97706" />
            </View>
            <Text style={styles.dialogTitle}>¿Salir sin guardar los cambios?</Text>
            <Text style={styles.dialogMessage}>
              Has modificado datos de este producto. Si sales ahora, perderás los cambios no guardados.
            </Text>
            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.dialogKeepButton}
                onPress={() => setShowUnsavedPrompt(false)}
                testID="btn-keep-editing"
              >
                <Text style={styles.dialogKeepButtonText}>Seguir editando</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogDiscardButton}
                onPress={onCancel}
                testID="btn-discard-changes"
              >
                <Text style={styles.dialogDiscardButtonText}>Descartar cambios</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Modal Calculadora de Paca (HU-357) */}
      {showPackCalculator && (
        <View style={styles.modalOverlay} testID="pack-calculator-modal">
          <View style={styles.dialogCard}>
            <View style={styles.packHeader}>
              <Text style={styles.dialogTitle}>Calculadora Rápida de Paca</Text>
              <TouchableOpacity onPress={() => setShowPackCalculator(false)}>
                <X size={20} color="#69656c" />
              </TouchableOpacity>
            </View>
            <Text style={styles.dialogMessage}>
              Digita el precio de la caja o paca completa y el margen deseado para sugerir el precio de venta unitario redondeado a $50 COP.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Valor total de la paca ($ COP):</Text>
              <TextInput
                style={styles.input}
                value={packCostInput}
                onChangeText={setPackCostInput}
                keyboardType="numeric"
                testID="input-pack-cost"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Unidades por paca:</Text>
              <TextInput
                style={styles.input}
                value={unitsPerPackInput}
                onChangeText={setUnitsPerPackInput}
                keyboardType="numeric"
                testID="input-units-per-pack"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Margen deseado (%):</Text>
              <TextInput
                style={styles.input}
                value={desiredMarginInput}
                onChangeText={setDesiredMarginInput}
                keyboardType="numeric"
                testID="input-desired-margin"
              />
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleApplyPackCalculation}
              testID="btn-apply-pack-calc"
            >
              <Check size={18} color="#ffffff" />
              <Text style={styles.saveButtonText}>Aplicar al producto</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.headerTitle}>
        {formData.id ? "Editar Producto" : "Nuevo Producto"}
      </Text>

      {/* Alerta de margen negativo si el costo supera el precio (HU-422) */}
      {isLossMaking && (
        <View style={styles.lossBanner} testID="loss-making-banner">
          <TriangleAlert size={18} color="#b3261e" />
          <Text style={styles.lossBannerText}>
            ¡Atención! El costo de compra (${(formData.costCents / 100).toLocaleString("es-CO")}) supera el precio de venta (${(formData.basePriceCents / 100).toLocaleString("es-CO")}). Venta con pérdida.
          </Text>
        </View>
      )}

      {/* Datos básicos */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Datos del Producto</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nombre comercial del producto *</Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={(text) => {
              setFormData((prev) => ({ ...prev, name: text }));
              markDirty();
            }}
            placeholder="Ej. Arroz Diana 1kg"
            testID="input-product-name"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>SKU / Código interno</Text>
            <TextInput
              style={styles.input}
              value={formData.sku}
              onChangeText={(text) => {
                setFormData((prev) => ({ ...prev, sku: text }));
                markDirty();
              }}
              testID="input-product-sku"
            />
          </View>

          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Unidad de medida</Text>
            <TextInput
              style={styles.input}
              value={formData.unit}
              onChangeText={(text) => {
                setFormData((prev) => ({ ...prev, unit: text }));
                markDirty();
              }}
              testID="input-product-unit"
            />
          </View>
        </View>
      </View>

      {/* Precios, Costo y Margen en vivo */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Precios y Rentabilidad</Text>
          <TouchableOpacity
            style={styles.packCalcButton}
            onPress={() => setShowPackCalculator(true)}
            testID="btn-open-pack-calc"
          >
            <Calculator size={16} color="#24734e" />
            <Text style={styles.packCalcButtonText}>Calcular desde paca</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Costo de compra ($ COP)</Text>
            <TextInput
              style={styles.input}
              value={String(formData.costCents / 100)}
              onChangeText={(text) => {
                const val = parseFloat(text) || 0;
                setFormData((prev) => ({ ...prev, costCents: Math.round(val * 100) }));
                markDirty();
              }}
              keyboardType="numeric"
              testID="input-product-cost"
            />
          </View>

          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Precio de venta ($ COP) *</Text>
            <TextInput
              style={styles.input}
              value={String(formData.basePriceCents / 100)}
              onChangeText={(text) => {
                const val = parseFloat(text) || 0;
                setFormData((prev) => ({ ...prev, basePriceCents: Math.round(val * 100) }));
                markDirty();
              }}
              keyboardType="numeric"
              testID="input-product-price"
            />
          </View>
        </View>

        {/* Indicador en vivo de margen y ganancia (HU-230) */}
        <View
          style={[styles.marginIndicator, isLossMaking && styles.marginIndicatorLoss]}
          testID="margin-indicator"
        >
          <Text style={styles.marginText}>
            Ganancia: ${(profitCents / 100).toLocaleString("es-CO")} · Margen: {marginRatio.toFixed(1)} %
          </Text>
        </View>
      </View>

      {/* Códigos de barras */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Códigos de Barras (EAN-13 / UPCA)</Text>
        <View style={styles.barcodeAddRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={newBarcode}
            onChangeText={setNewBarcode}
            placeholder="Escanear o digitar código de barras..."
            testID="input-new-barcode"
          />
          <TouchableOpacity
            style={styles.addBarcodeButton}
            onPress={handleAddBarcode}
            testID="btn-add-barcode"
          >
            <Plus size={18} color="#ffffff" />
            <Text style={styles.addBarcodeButtonText}>Agregar</Text>
          </TouchableOpacity>
        </View>

        {formData.barcodes.map((item, index) => (
          <View key={index} style={styles.barcodeRow} testID={`barcode-item-${index}`}>
            <Text style={styles.barcodeText}>{item.barcode}</Text>
            <TouchableOpacity onPress={() => handleRemoveBarcode(index)}>
              <Trash size={16} color="#b3261e" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Botones de acción */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancelClick}
          testID="btn-cancel-product"
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          disabled={loading || !formData.name.trim() || formData.basePriceCents <= 0}
          onPress={() => onSave(formData)}
          testID="btn-save-product"
        >
          <Text style={styles.saveButtonText}>
            {loading ? "Guardando..." : "Guardar Producto"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center"
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1d1b20",
    marginBottom: 16
  },
  lossBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fce8e6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f2b8b5"
  },
  lossBannerText: {
    color: "#b3261e",
    fontSize: 13,
    fontWeight: "600",
    flex: 1
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    padding: 16,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1d1b20",
    marginBottom: 12
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  inputGroup: {
    marginBottom: 12
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#49454e",
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: "#c4c0c8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#ffffff"
  },
  row: {
    flexDirection: "row",
    gap: 12
  },
  packCalcButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  packCalcButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#24734e"
  },
  marginIndicator: {
    backgroundColor: "#e8f5e9",
    padding: 12,
    borderRadius: 8,
    alignItems: "center"
  },
  marginIndicatorLoss: {
    backgroundColor: "#fce8e6"
  },
  marginText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#24734e"
  },
  barcodeAddRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12
  },
  addBarcodeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#24734e",
    paddingHorizontal: 14,
    borderRadius: 8
  },
  addBarcodeButtonText: {
    color: "#ffffff",
    fontWeight: "600"
  },
  barcodeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0edf1"
  },
  barcodeText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1d1b20"
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
    marginBottom: 40
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c4c0c8"
  },
  cancelButtonText: {
    color: "#49454e",
    fontWeight: "600"
  },
  saveButton: {
    backgroundColor: "#24734e",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  saveButtonDisabled: {
    opacity: 0.5
  },
  saveButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  dialogCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    maxWidth: 420,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10
  },
  dialogIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fef3e2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  packHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1d1b20",
    marginBottom: 8
  },
  dialogMessage: {
    fontSize: 14,
    color: "#49454e",
    lineHeight: 20,
    marginBottom: 20
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10
  },
  dialogKeepButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#e8f5e9"
  },
  dialogKeepButtonText: {
    color: "#24734e",
    fontWeight: "700"
  },
  dialogDiscardButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#fce8e6"
  },
  dialogDiscardButtonText: {
    color: "#b3261e",
    fontWeight: "700"
  }
});
