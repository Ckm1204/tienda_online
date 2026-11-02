import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from "react-native";
import Search from "lucide-react-native/icons/search";
import Plus from "lucide-react-native/icons/plus";
import Copy from "lucide-react-native/icons/copy";
import Printer from "lucide-react-native/icons/printer";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  basePriceCents: number;
  costCents: number;
  barcodes: { barcode: string; packQtyMilli: number }[];
  trackStock: boolean;
  stockQtyMilli?: number;
  status: "ACTIVE" | "INACTIVE";
  version: number;
}

export interface ProductListScreenProps {
  products: ProductItem[];
  onNewProduct: () => void;
  onEditProduct: (product: ProductItem) => void;
  onDuplicateProduct: (product: ProductItem) => void;
  onQuickPriceUpdate: (productId: string, newPriceCents: number, version: number) => Promise<void> | void;
}

export function ProductListScreen({
  products,
  onNewProduct,
  onEditProduct,
  onDuplicateProduct,
  onQuickPriceUpdate
}: ProductListScreenProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "low_stock" | "no_barcode" | "negative_margin">("all");
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const [showCounterSheet, setShowCounterSheet] = useState(false);

  // Filtrado reactivo de productos
  const filteredProducts = products.filter((p) => {
    // Filtro por término de búsqueda
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcodes.some((b) => b.barcode.includes(searchTerm));

    if (!matchesSearch) return false;

    // Filtros por pestaña
    if (filterTab === "low_stock") {
      const stock = (p.stockQtyMilli ?? 0) / 1000;
      return p.trackStock && stock <= 5;
    }
    if (filterTab === "no_barcode") {
      return p.barcodes.length === 0;
    }
    if (filterTab === "negative_margin") {
      return p.costCents > p.basePriceCents;
    }
    return true;
  });

  const handleStartQuickEdit = (p: ProductItem) => {
    setEditingPriceId(p.id);
    setEditingPriceValue(String(p.basePriceCents / 100));
  };

  const handleSaveQuickEdit = async (p: ProductItem) => {
    const rawNum = parseFloat(editingPriceValue) || 0;
    // Redondear a múltiplo de $50 COP
    const roundedNum = Math.round(rawNum / 50) * 50;
    const cents = Math.round(roundedNum * 100);

    await onQuickPriceUpdate(p.id, cents, p.version);
    setEditingPriceId(null);
  };

  const unbarcodedProducts = products.filter((p) => p.barcodes.length === 0);

  return (
    <View style={styles.container} testID="product-list-screen">
      {/* Modal Lista de Precios de Mostrador (HU-425) */}
      {showCounterSheet && (
        <View style={styles.modalOverlay} testID="counter-sheet-modal">
          <View style={styles.counterSheetCard}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Lista de Mostrador (Productos sin Código)</Text>
                <Text style={styles.sheetSubtitle}>Para imprimir y plastificar al lado de la caja</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCounterSheet(false)} testID="btn-close-sheet">
                <X size={20} color="#69656c" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              {unbarcodedProducts.length === 0 ? (
                <Text style={styles.emptyText}>No hay productos sin código de barras registrados.</Text>
              ) : (
                unbarcodedProducts.map((p) => (
                  <View key={p.id} style={styles.sheetRow}>
                    <Text style={styles.sheetProductName}>{p.name}</Text>
                    <Text style={styles.sheetProductSku}>{p.sku}</Text>
                    <Text style={styles.sheetProductPrice}>
                      ${(p.basePriceCents / 100).toLocaleString("es-CO")}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.printButton}
                onPress={() => window.print?.()}
                testID="btn-print-sheet"
              >
                <Printer size={18} color="#ffffff" />
                <Text style={styles.printButtonText}>Imprimir Hoja de Mostrador</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Header superior */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Catálogo de Productos</Text>
          <Text style={styles.subtitle}>{products.length} productos registrados</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.counterSheetBtn}
            onPress={() => setShowCounterSheet(true)}
            testID="btn-open-counter-sheet"
          >
            <Printer size={16} color="#49454e" />
            <Text style={styles.counterSheetBtnText}>Lista Mostrador</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newProductBtn}
            onPress={onNewProduct}
            testID="btn-new-product"
          >
            <Plus size={18} color="#ffffff" />
            <Text style={styles.newProductBtnText}>Nuevo Producto</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de búsqueda */}
      <View style={styles.searchBar}>
        <Search size={20} color="#8f8b94" />
        <TextInput
          style={styles.searchInput}
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Buscar por nombre, código de barras o SKU..."
          testID="input-search-products"
        />
        {searchTerm ? (
          <TouchableOpacity onPress={() => setSearchTerm("")}>
            <X size={18} color="#8f8b94" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Pestañas de filtros */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filterTab === "all" && styles.filterTabActive]}
          onPress={() => setFilterTab("all")}
          testID="tab-filter-all"
        >
          <Text style={[styles.filterTabText, filterTab === "all" && styles.filterTabTextActive]}>
            Todos ({products.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTab, filterTab === "low_stock" && styles.filterTabActive]}
          onPress={() => setFilterTab("low_stock")}
          testID="tab-filter-low-stock"
        >
          <Text style={[styles.filterTabText, filterTab === "low_stock" && styles.filterTabTextActive]}>
            Stock Bajo / Agotado
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTab, filterTab === "no_barcode" && styles.filterTabActive]}
          onPress={() => setFilterTab("no_barcode")}
          testID="tab-filter-no-barcode"
        >
          <Text style={[styles.filterTabText, filterTab === "no_barcode" && styles.filterTabTextActive]}>
            Sin Código
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterTab,
            filterTab === "negative_margin" && styles.filterTabActive,
            { borderColor: "#f2b8b5" }
          ]}
          onPress={() => setFilterTab("negative_margin")}
          testID="tab-filter-negative-margin"
        >
          <Text
            style={[
              styles.filterTabText,
              filterTab === "negative_margin" && styles.filterTabTextActive,
              { color: "#b3261e" }
            ]}
          >
            ⚠️ Margen Negativo (A pérdida)
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista de productos */}
      <ScrollView style={styles.tableScroll}>
        {filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No se encontraron productos con los filtros actuales.</Text>
          </View>
        ) : (
          filteredProducts.map((p) => {
            const isEditing = editingPriceId === p.id;
            const isNegativeMargin = p.costCents > p.basePriceCents;

            return (
              <View
                key={p.id}
                style={[styles.productCard, isNegativeMargin && styles.productCardNegativeMargin]}
                testID={`product-row-${p.id}`}
              >
                <View style={styles.productMainInfo}>
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.productMeta}>
                    SKU: {p.sku} ·{" "}
                    {p.barcodes.length > 0 ? `EAN: ${p.barcodes[0]?.barcode}` : "Sin código de barras"}
                  </Text>
                  {isNegativeMargin && (
                    <View style={styles.negativeMarginBadge}>
                      <TriangleAlert size={12} color="#b3261e" />
                      <Text style={styles.negativeMarginText}>
                        Costo (${(p.costCents / 100).toLocaleString("es-CO")}) supera el precio
                      </Text>
                    </View>
                  )}
                </View>

                {/* Edición rápida de precio en línea (HU-229) */}
                <View style={styles.priceContainer}>
                  <Text style={styles.priceLabel}>Precio de venta:</Text>
                  {isEditing ? (
                    <View style={styles.quickEditRow}>
                      <TextInput
                        style={styles.quickEditInput}
                        value={editingPriceValue}
                        onChangeText={setEditingPriceValue}
                        keyboardType="numeric"
                        autoFocus
                        testID={`input-quick-price-${p.id}`}
                      />
                      <TouchableOpacity
                        style={styles.quickSaveBtn}
                        onPress={() => handleSaveQuickEdit(p)}
                        testID={`btn-save-quick-price-${p.id}`}
                      >
                        <Check size={16} color="#ffffff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickCancelBtn}
                        onPress={() => setEditingPriceId(null)}
                      >
                        <X size={16} color="#69656c" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleStartQuickEdit(p)}
                      testID={`btn-quick-edit-price-${p.id}`}
                    >
                      <Text style={styles.priceValue}>
                        ${(p.basePriceCents / 100).toLocaleString("es-CO")}
                      </Text>
                      <Text style={styles.quickEditHint}>Toca para editar</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Acciones */}
                <View style={styles.actionsGroup}>
                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => onDuplicateProduct(p)}
                    testID={`btn-duplicate-${p.id}`}
                  >
                    <Copy size={16} color="#24734e" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => onEditProduct(p)}
                    testID={`btn-edit-${p.id}`}
                  >
                    <Text style={styles.editBtnText}>Editar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    maxWidth: 980,
    width: "100%",
    alignSelf: "center"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1d1b20"
  },
  subtitle: {
    fontSize: 14,
    color: "#69656c"
  },
  headerButtons: {
    flexDirection: "row",
    gap: 10
  },
  counterSheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#c4c0c8",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8
  },
  counterSheetBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#49454e"
  },
  newProductBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#24734e",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  newProductBtnText: {
    color: "#ffffff",
    fontWeight: "700"
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c4c0c8",
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 16
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 15
  },
  filterTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap"
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    backgroundColor: "#ffffff"
  },
  filterTabActive: {
    borderColor: "#24734e",
    backgroundColor: "#e8f5e9"
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#49454e"
  },
  filterTabTextActive: {
    color: "#24734e",
    fontWeight: "700"
  },
  tableScroll: {
    maxHeight: 560
  },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    marginBottom: 10
  },
  productCardNegativeMargin: {
    borderColor: "#f2b8b5",
    backgroundColor: "#fffbfa"
  },
  productMainInfo: {
    flex: 2
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1d1b20"
  },
  productMeta: {
    fontSize: 13,
    color: "#69656c",
    marginTop: 2
  },
  negativeMarginBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4
  },
  negativeMarginText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b3261e"
  },
  priceContainer: {
    flex: 1,
    alignItems: "center"
  },
  priceLabel: {
    fontSize: 11,
    color: "#69656c",
    textTransform: "uppercase"
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#24734e"
  },
  quickEditHint: {
    fontSize: 10,
    color: "#8f8b94"
  },
  quickEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  quickEditInput: {
    borderWidth: 1,
    borderColor: "#24734e",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    width: 80,
    textAlign: "right"
  },
  quickSaveBtn: {
    backgroundColor: "#24734e",
    padding: 6,
    borderRadius: 6
  },
  quickCancelBtn: {
    padding: 6
  },
  actionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  actionIconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#e8f5e9"
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#24734e"
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#24734e"
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center"
  },
  emptyText: {
    fontSize: 14,
    color: "#69656c"
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
  counterSheetCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    maxWidth: 600,
    width: "100%"
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1d1b20"
  },
  sheetSubtitle: {
    fontSize: 13,
    color: "#69656c"
  },
  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0edf1"
  },
  sheetProductName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1d1b20",
    flex: 2
  },
  sheetProductSku: {
    fontSize: 13,
    color: "#69656c",
    flex: 1
  },
  sheetProductPrice: {
    fontSize: 15,
    fontWeight: "800",
    color: "#24734e"
  },
  sheetFooter: {
    marginTop: 20,
    alignItems: "flex-end"
  },
  printButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#24734e",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  printButtonText: {
    color: "#ffffff",
    fontWeight: "700"
  }
});
