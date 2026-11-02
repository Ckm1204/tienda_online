import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import Sparkles from "lucide-react-native/icons/sparkles";
import FileSpreadsheet from "lucide-react-native/icons/file-spreadsheet";
import Camera from "lucide-react-native/icons/camera";
import Download from "lucide-react-native/icons/download";
import Check from "lucide-react-native/icons/check";
import ArrowRight from "lucide-react-native/icons/arrow-right";

export interface CategoryPreset {
  id: string;
  name: string;
  iconName: string;
  description: string;
  productCount: number;
  sampleProducts: string[];
}

export const COLOMBIAN_CATALOG_PRESETS: CategoryPreset[] = [
  {
    id: "abarrotes",
    name: "Abarrotes y Granos",
    iconName: "shopping-basket",
    description: "Arroz Diana 1kg, Aceite Premier, Azúcar, Sal Refisal, Panela, Café Sello Rojo, Pastas Doria",
    productCount: 12,
    sampleProducts: ["Arroz Diana 1kg", "Aceite Premier 1000ml", "Café Sello Rojo 250g"]
  },
  {
    id: "lacteos",
    name: "Lácteos y Huevos",
    iconName: "milk",
    description: "Leche Alquería Entera 1L, Colanta Deslactosada, Mantequilla Rama, Cubeta Huevos AA x30",
    productCount: 8,
    sampleProducts: ["Leche Alquería 1L", "Huevos AA x30", "Mantequilla Rama 250g"]
  },
  {
    id: "bebidas",
    name: "Gaseosas y Bebidas",
    iconName: "cup-soda",
    description: "Coca-Cola 400ml, Postobón Manzana 400ml, Pony Malta 330ml, Agua Cristal, Jugos Hit",
    productCount: 10,
    sampleProducts: ["Coca-Cola 400ml", "Postobón Manzana 400ml", "Pony Malta 330ml"]
  },
  {
    id: "snacks",
    name: "Snacks y Dulces",
    iconName: "cookie",
    description: "Papas Margarita Pollo/Natural 25g, Chocoramo 65g, Galletas Festival, Chocolatina Jet",
    productCount: 9,
    sampleProducts: ["Chocoramo 65g", "Papas Margarita Pollo 25g", "Jet Tradicional 12g"]
  },
  {
    id: "aseo",
    name: "Aseo Personal y Hogar",
    iconName: "sparkles",
    description: "Detergente Fab 1kg, Jabón Rey, Clorox 1000ml, Jabón Protex, Crema Colgate Triple Acción",
    productCount: 8,
    sampleProducts: ["Jabón Rey 300g", "Clorox 1000ml", "Crema Colgate 75ml"]
  },
  {
    id: "licores",
    name: "Licores y Cervezas",
    iconName: "wine",
    description: "Cerveza Poker Lata 330ml, Cerveza Águila 330ml, Aguardiente Antioqueño 375ml",
    productCount: 6,
    sampleProducts: ["Cerveza Poker 330ml", "Aguardiente Antioqueño 375ml"]
  }
];

export interface InitialCatalogWizardProps {
  onCompletePreload: (selectedCategoryIds: string[]) => Promise<void> | void;
  onOpenExcelUpload: () => void;
  onOpenCameraScanner: () => void;
  onDownloadTemplate?: () => void;
}

export function InitialCatalogWizard({
  onCompletePreload,
  onOpenExcelUpload,
  onOpenCameraScanner,
  onDownloadTemplate
}: InitialCatalogWizardProps) {
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([
    "abarrotes",
    "lacteos",
    "bebidas",
    "snacks"
  ]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"choose" | "preset_selection">("choose");

  const totalProducts = COLOMBIAN_CATALOG_PRESETS.filter((p) =>
    selectedPresetIds.includes(p.id)
  ).reduce((sum, p) => sum + p.productCount, 0);

  const toggleCategory = (id: string) => {
    setSelectedPresetIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleApplyPreset = async () => {
    setLoading(true);
    try {
      await onCompletePreload(selectedPresetIds);
    } finally {
      setLoading(false);
    }
  };

  if (mode === "choose") {
    return (
      <View style={styles.container} testID="initial-catalog-wizard">
        <Text style={styles.badge}>Onboarding de Catálogo</Text>
        <Text style={styles.title}>¿Cómo deseas comenzar tu inventario?</Text>
        <Text style={styles.subtitle}>
          No necesitas empezar desde cero. Elige la opción que mejor se ajuste a tu tienda.
        </Text>

        <View style={styles.optionsGrid}>
          {/* Opción 1: Catálogo base colombiano */}
          <TouchableOpacity
            style={[styles.card, styles.cardFeatured]}
            onPress={() => setMode("preset_selection")}
            testID="option-base-catalog"
          >
            <View style={styles.iconCircle}>
              <Sparkles size={24} color="#24734e" />
            </View>
            <Text style={styles.cardTitle}>Catálogo Base Colombiano</Text>
            <Text style={styles.cardDesc}>
              Pre-carga en 5 segundos las marcas y productos más vendidos en tiendas de barrio (Arroz Diana, Coca-Cola, Leche Alquería, Chocoramo, etc.) con sus códigos EAN-13 oficiales.
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.actionLink}>Seleccionar categorías</Text>
              <ArrowRight size={16} color="#24734e" />
            </View>
          </TouchableOpacity>

          {/* Opción 2: Subir archivo Excel */}
          <TouchableOpacity
            style={styles.card}
            onPress={onOpenExcelUpload}
            testID="option-excel-upload"
          >
            <View style={[styles.iconCircle, { backgroundColor: "#e8f0fe" }]}>
              <FileSpreadsheet size={24} color="#1a73e8" />
            </View>
            <Text style={styles.cardTitle}>Subir archivo Excel</Text>
            <Text style={styles.cardDesc}>
              Si ya tienes tu lista de productos en una hoja de cálculo, puedes importarla directamente usando nuestra plantilla oficial.
            </Text>
            <TouchableOpacity
              style={styles.templateButton}
              onPress={onDownloadTemplate}
              testID="btn-download-template"
            >
              <Download size={14} color="#1a73e8" />
              <Text style={styles.templateButtonText}>Descargar plantilla Excel</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Opción 3: Crear con la cámara */}
          <TouchableOpacity
            style={styles.card}
            onPress={onOpenCameraScanner}
            testID="option-camera-scanner"
          >
            <View style={[styles.iconCircle, { backgroundColor: "#fef3e2" }]}>
              <Camera size={24} color="#d97706" />
            </View>
            <Text style={styles.cardTitle}>Escanear con la Cámara</Text>
            <Text style={styles.cardDesc}>
              Toma tu teléfono y camina por los estantes de tu negocio escaneando los códigos de barras para crearlos en vivo.
            </Text>
            <View style={styles.cardFooter}>
              <Text style={[styles.actionLink, { color: "#d97706" }]}>Abrir cámara</Text>
              <ArrowRight size={16} color="#d97706" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="preset-selection-view">
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setMode("choose")}
        testID="btn-back-to-options"
      >
        <Text style={styles.backButtonText}>← Volver a opciones</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Selecciona qué productos vendes en tu tienda</Text>
      <Text style={styles.subtitle}>
        Crearemos los productos con nombres comerciales oficiales y códigos de barras. Solo tendrás que ajustar tus precios de venta.
      </Text>

      <ScrollView style={styles.presetsList}>
        {COLOMBIAN_CATALOG_PRESETS.map((preset) => {
          const isSelected = selectedPresetIds.includes(preset.id);
          return (
            <TouchableOpacity
              key={preset.id}
              style={[styles.presetRow, isSelected && styles.presetRowSelected]}
              onPress={() => toggleCategory(preset.id)}
              testID={`preset-toggle-${preset.id}`}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                {isSelected && <Check size={16} color="#ffffff" />}
              </View>
              <View style={styles.presetContent}>
                <View style={styles.presetHeader}>
                  <Text style={styles.presetName}>{preset.name}</Text>
                  <Text style={styles.presetCount}>({preset.productCount} productos)</Text>
                </View>
                <Text style={styles.presetDesc}>{preset.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footerBar}>
        <View>
          <Text style={styles.summaryTitle}>Total a crear:</Text>
          <Text style={styles.summaryCount}>{totalProducts} productos base</Text>
        </View>
        <TouchableOpacity
          style={[styles.submitButton, (loading || totalProducts === 0) && styles.submitButtonDisabled]}
          disabled={loading || totalProducts === 0}
          onPress={handleApplyPreset}
          testID="btn-preload-catalog"
        >
          <Sparkles size={18} color="#ffffff" />
          <Text style={styles.submitButtonText}>
            {loading ? "Cargando catálogo..." : `Pre-cargar catálogo (${totalProducts})`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    maxWidth: 880,
    width: "100%",
    alignSelf: "center"
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#e8f5e9",
    color: "#24734e",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1d1b20",
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14,
    color: "#69656c",
    lineHeight: 20,
    marginBottom: 24
  },
  optionsGrid: {
    gap: 16
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e3e1e6",
    borderRadius: 16,
    padding: 20
  },
  cardFeatured: {
    borderColor: "#24734e",
    borderWidth: 2,
    backgroundColor: "#fbfdfa"
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e8f5e9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1d1b20",
    marginBottom: 6
  },
  cardDesc: {
    fontSize: 14,
    color: "#49454e",
    lineHeight: 20,
    marginBottom: 16
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  actionLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#24734e"
  },
  templateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#e8f0fe",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  templateButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a73e8"
  },
  backButton: {
    marginBottom: 16,
    alignSelf: "flex-start"
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#24734e"
  },
  presetsList: {
    maxHeight: 380,
    marginBottom: 20
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    marginBottom: 12
  },
  presetRowSelected: {
    borderColor: "#24734e",
    backgroundColor: "#f4fbf7"
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#8f8b94",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16
  },
  checkboxActive: {
    backgroundColor: "#24734e",
    borderColor: "#24734e"
  },
  presetContent: {
    flex: 1
  },
  presetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4
  },
  presetName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1d1b20"
  },
  presetCount: {
    fontSize: 13,
    color: "#69656c"
  },
  presetDesc: {
    fontSize: 13,
    color: "#49454e",
    lineHeight: 18
  },
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e3e1e6"
  },
  summaryTitle: {
    fontSize: 12,
    color: "#69656c",
    textTransform: "uppercase",
    fontWeight: "600"
  },
  summaryCount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#24734e"
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#24734e",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12
  },
  submitButtonDisabled: {
    opacity: 0.5
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  }
});
