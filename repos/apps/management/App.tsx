import React, { useState, useMemo } from "react";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Store from "lucide-react-native/icons/store";
import CircleHelp from "lucide-react-native/icons/circle-help";
import LogOut from "lucide-react-native/icons/log-out";
import Sparkles from "lucide-react-native/icons/sparkles";
import Plus from "lucide-react-native/icons/plus";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import QrCode from "lucide-react-native/icons/qr-code";
import Check from "lucide-react-native/icons/check";
import Lock from "lucide-react-native/icons/lock";
import Unlock from "lucide-react-native/icons/unlock";

import { OnlineGate } from "./src/components/OnlineGate";
import { onlineSession } from "./src/network/runtime";
import {
  AdaptiveNavigation,
  NavigationSection
} from "./src/components/AdaptiveNavigation";
import { LoginForm } from "./src/components/LoginForm";
import { OwnerActivationWizard } from "./src/components/OwnerActivationWizard";
import { InitialCatalogWizard } from "./src/components/InitialCatalogWizard";
import { ProductListScreen, ProductItem } from "./src/components/ProductListScreen";
import { ProductForm, ProductFormData } from "./src/components/ProductForm";
import {
  InventoryAdjustmentsScreen,
  InventoryItemRow,
  AdjustmentReason
} from "./src/components/InventoryAdjustmentsScreen";
import {
  SubscriptionBillingScreen,
  QuotaItem,
  InvoiceItem
} from "./src/components/SubscriptionBillingScreen";
import { HelpCenterModal } from "./src/components/HelpCenterModal";
import { StepUpMfaModal } from "./src/components/StepUpMfaModal";
import { ManagementAuthService, ManagementUser } from "./src/auth/auth-state";

// Datos iniciales de demostración para tienda de barrio típica colombiana
const DEFAULT_USER: ManagementUser = {
  id: "usr-owner-001",
  fullName: "Don Pedro Pérez",
  email: "pedro@tiendita.co",
  roleCode: "OWNER",
  permissions: [
    "reports.read",
    "catalog.read",
    "catalog.write",
    "inventory.read",
    "inventory.write",
    "customer.read",
    "customer.write",
    "terminal.read",
    "terminal.write",
    "user.read",
    "user.write",
    "billing.read",
    "billing.write"
  ]
};

const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: "prod-001",
    sku: "SKU-ARR-01",
    name: "Arroz Diana Tradicional 1kg",
    categoryId: "cat-abarrotes",
    basePriceCents: 480000, // $4.800 COP
    costCents: 370000,      // $3.700 COP
    barcodes: [{ barcode: "7702001001002", packQtyMilli: 1000 }],
    trackStock: true,
    stockQtyMilli: 45000,   // 45 unidades
    status: "ACTIVE",
    version: 1
  },
  {
    id: "prod-002",
    sku: "SKU-ACT-02",
    name: "Aceite Premier Girasol 1000ml",
    categoryId: "cat-abarrotes",
    basePriceCents: 1150000, // $11.500 COP
    costCents: 920000,       // $9.200 COP
    barcodes: [{ barcode: "7702002002008", packQtyMilli: 1000 }],
    trackStock: true,
    stockQtyMilli: 18000,    // 18 unidades
    status: "ACTIVE",
    version: 1
  },
  {
    id: "prod-003",
    sku: "SKU-LEC-03",
    name: "Leche Alquería Entera 1L",
    categoryId: "cat-lacteos",
    basePriceCents: 450000,  // $4.500 COP
    costCents: 360000,       // $3.600 COP
    barcodes: [{ barcode: "7702004003508", packQtyMilli: 1000 }],
    trackStock: true,
    stockQtyMilli: 8000,     // 8 unidades (bajo stock)
    status: "ACTIVE",
    version: 1
  },
  {
    id: "prod-004",
    sku: "SKU-PST-04",
    name: "Postobón Manzana 400ml No Retornable",
    categoryId: "cat-bebidas",
    basePriceCents: 250000,  // $2.500 COP
    costCents: 180000,       // $1.800 COP
    barcodes: [{ barcode: "7702004003515", packQtyMilli: 1000 }],
    trackStock: true,
    stockQtyMilli: 32000,    // 32 unidades
    status: "ACTIVE",
    version: 1
  },
  {
    id: "prod-005",
    sku: "SKU-CHO-05",
    name: "Chocoramo Tradicional 65g",
    categoryId: "cat-snacks",
    basePriceCents: 280000,  // $2.800 COP
    costCents: 210000,       // $2.100 COP
    barcodes: [{ barcode: "7702004003522", packQtyMilli: 1000 }],
    trackStock: true,
    stockQtyMilli: 3000,     // 3 unidades (stock crítico)
    status: "ACTIVE",
    version: 1
  }
];

const INITIAL_INVENTORY_ITEMS: InventoryItemRow[] = [
  {
    productId: "prod-001",
    name: "Arroz Diana Tradicional 1kg",
    barcode: "7702001001002",
    unitCostCents: 370000,
    systemQtyMilli: 45000,
    countedQtyMilli: 45000
  },
  {
    productId: "prod-002",
    name: "Aceite Premier Girasol 1000ml",
    barcode: "7702002002008",
    unitCostCents: 920000,
    systemQtyMilli: 18000,
    countedQtyMilli: 17000 // Faltante de 1
  },
  {
    productId: "prod-003",
    name: "Leche Alquería Entera 1L",
    barcode: "7702004003508",
    unitCostCents: 360000,
    systemQtyMilli: 8000,
    countedQtyMilli: 8000
  }
];

const BILLING_QUOTAS: QuotaItem[] = [
  { label: "Cajas POS Registradas", used: 2, max: 5, unit: "cajas" },
  { label: "Productos en Catálogo", used: 240, max: 5000, unit: "ítems" },
  { label: "Facturas DIAN emitidas", used: 310, max: 1000, unit: "docs" },
  { label: "Usuarios y Cajeros", used: 3, max: 10, unit: "cuentas" }
];

const BILLING_INVOICES: InvoiceItem[] = [
  {
    id: "inv-2026-10",
    reference: "REC-2026-1092",
    period: "Octubre 2026",
    amountCents: 7990000, // $79.900 COP
    status: "PAID",
    dueDate: "2026-10-05"
  },
  {
    id: "inv-2026-11",
    reference: "REC-2026-1184",
    period: "Noviembre 2026",
    amountCents: 7990000, // $79.900 COP
    status: "PENDING",
    dueDate: "2026-11-10"
  }
];

interface FiadoCustomer {
  id: string;
  name: string;
  docNumber: string;
  phone: string;
  creditLimitCents: number;
  balanceCents: number;
}

interface PosTerminal {
  id: string;
  code: string;
  name: string;
  status: "ONLINE" | "OFFLINE" | "REVOKED";
  lastSync: string;
}

interface StoreEmployee {
  id: string;
  fullName: string;
  role: string;
  pinSet: boolean;
  isLocked: boolean;
}

export default function App() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_600SemiBold });
  const authService = useMemo(() => new ManagementAuthService(), []);

  // Estado de sesión y autenticación
  const [currentUser, setCurrentUser] = useState<ManagementUser | null>(DEFAULT_USER);
  const [activeSection, setActiveSection] = useState<NavigationSection>("dashboard");
  const [showActivationWizard, setShowActivationWizard] = useState(false);

  // Modales
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showCatalogWizard, setShowCatalogWizard] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [pendingMfaAction, setPendingMfaAction] = useState<(() => void) | null>(null);

  // Datos en vivo
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRow[]>(INITIAL_INVENTORY_ITEMS);
  const [feedMessage, setFeedMessage] = useState<string | null>(null);

  // Clientes con crédito (Fiado)
  const [customers, setCustomers] = useState<FiadoCustomer[]>([
    {
      id: "cust-01",
      name: "Doña Martha Gómez",
      docNumber: "51.849.201",
      phone: "+57 310 445 8821",
      creditLimitCents: 20000000, // $200.000 COP
      balanceCents: 8500000      // $85.000 COP
    },
    {
      id: "cust-02",
      name: "Don Carlos Ramírez (Taller)",
      docNumber: "19.340.590",
      phone: "+57 301 234 9910",
      creditLimitCents: 35000000, // $350.000 COP
      balanceCents: 14500000     // $145.000 COP
    },
    {
      id: "cust-03",
      name: "Lucía Beltrán (Vecina Casa 4)",
      docNumber: "1.020.345.890",
      phone: "+57 312 888 1204",
      creditLimitCents: 15000000, // $150.000 COP
      balanceCents: 0            // Sin saldo
    }
  ]);

  // Terminales de caja
  const [terminals, setTerminals] = useState<PosTerminal[]>([
    { id: "term-01", code: "CAJA-01", name: "Caja Principal Entrada", status: "ONLINE", lastSync: "Hace 12 seg" },
    { id: "term-02", code: "CAJA-02", name: "Caja Pasillo 2 (Abarrotes)", status: "ONLINE", lastSync: "Hace 45 seg" }
  ]);
  const [enrollmentQr, setEnrollmentQr] = useState<string | null>(null);

  // Empleados y cajeros
  const [employees, setEmployees] = useState<StoreEmployee[]>([
    { id: "emp-01", fullName: "Don Pedro Pérez", role: "Dueño / Administrador", pinSet: true, isLocked: false },
    { id: "emp-02", fullName: "Brayan Stiven Peña", role: "Cajero Turno Mañana", pinSet: true, isLocked: false },
    { id: "emp-03", fullName: "Yurany Andrea Silva", role: "Cajera Turno Tarde", pinSet: true, isLocked: false }
  ]);

  const triggerStepUpMfa = (action: () => void) => {
    setPendingMfaAction(() => action);
    setShowMfaModal(true);
  };

  const handleMfaSuccess = () => {
    setShowMfaModal(false);
    if (pendingMfaAction) {
      pendingMfaAction();
      setPendingMfaAction(null);
    }
  };

  // Acciones de Productos
  const handleSaveProduct = (formData: ProductFormData) => {
    if (editingProduct) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: formData.name,
                sku: formData.sku,
                basePriceCents: formData.basePriceCents,
                costCents: formData.costCents,
                barcodes: formData.barcodes,
                trackStock: formData.trackStock,
                version: p.version + 1
              }
            : p
        )
      );
      setFeedMessage(`Producto "${formData.name}" actualizado correctamente.`);
    } else {
      const newProduct: ProductItem = {
        id: `prod-${Date.now()}`,
        sku: formData.sku,
        name: formData.name,
        categoryId: formData.categoryId,
        basePriceCents: formData.basePriceCents,
        costCents: formData.costCents,
        barcodes: formData.barcodes,
        trackStock: formData.trackStock,
        stockQtyMilli: 0,
        status: "ACTIVE",
        version: 1
      };
      setProducts((prev) => [newProduct, ...prev]);
      setFeedMessage(`Producto "${formData.name}" creado exitosamente.`);
    }
    setShowProductForm(false);
    setEditingProduct(null);
  };

  const handleQuickPriceUpdate = (productId: string, newPriceCents: number, version: number) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, basePriceCents: newPriceCents, version: version + 1 } : p
      )
    );
    setFeedMessage(`Precio actualizado a $${(newPriceCents / 100).toLocaleString("es-CO")} COP`);
  };

  const handleConfirmInventory = (reason: AdjustmentReason, items: InventoryItemRow[]) => {
    setInventoryItems(items);
    setFeedMessage(`Ajuste de inventario (${reason}) guardado en Kardex.`);
  };

  // Acciones de Enrolamiento y Revocación de Cajas
  const handleGenerateEnrollmentQr = () => {
    const code = `TIENDITA-ENROLL-POS-${Math.floor(100000 + Math.random() * 900000)}`;
    setEnrollmentQr(code);
    setFeedMessage("Código QR de enrolamiento generado (Vigencia 15 min).");
  };

  const handleRevokeTerminal = (terminalId: string) => {
    triggerStepUpMfa(() => {
      setTerminals((prev) =>
        prev.map((t) => (t.id === terminalId ? { ...t, status: "REVOKED" } : t))
      );
      setFeedMessage("Caja revocada y desconectada de inmediato.");
    });
  };

  // Acciones de Habeas Data y Condonación de Cartera
  const handleCustomerWriteOff = (customerId: string) => {
    triggerStepUpMfa(() => {
      setCustomers((prev) =>
        prev.map((c) => (c.id === customerId ? { ...c, balanceCents: 0 } : c))
      );
      setFeedMessage("Deuda condonada con autorización MFA. Saldo en $0.");
    });
  };

  const handleCustomerAnonymize = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;
    if (cust.balanceCents > 0) {
      setFeedMessage(
        "Bloqueo Ley 1581 (Habeas Data): No se puede suprimir cliente con saldo pendiente de pago."
      );
      return;
    }
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    setFeedMessage("Datos del cliente anonimizados según Ley 1581.");
  };

  // Toggle de bloqueo de cajero
  const handleToggleEmployeeLock = (empId: string) => {
    setEmployees((prev) =>
      prev.map((e) => (e.id === empId ? { ...e, isLocked: !e.isLocked } : e))
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        {/* Encabezado Superior */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Store size={26} color="#24734e" aria-hidden />
            <Text style={styles.brand}>TienditaOnline</Text>
            <View style={styles.divider} />
            <Text style={styles.storeName}>Tienda La Esmeralda</Text>
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>En Línea</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.helpButton}
              onPress={() => setShowHelpModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Centro de Ayuda y WhatsApp"
            >
              <CircleHelp size={20} color="#24734e" aria-hidden />
              <Text style={styles.helpButtonText}>Ayuda</Text>
            </TouchableOpacity>

            {currentUser ? (
              <View style={styles.userProfilePill}>
                <Text style={styles.userName}>{currentUser.fullName}</Text>
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={() => setCurrentUser(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar sesión"
                >
                  <LogOut size={16} color="#69656c" aria-hidden />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        {/* Notificación informativa temporal */}
        {feedMessage ? (
          <View style={styles.notificationBanner}>
            <Check size={18} color="#15803d" aria-hidden />
            <Text style={styles.notificationText}>{feedMessage}</Text>
            <TouchableOpacity onPress={() => setFeedMessage(null)} style={styles.bannerClose}>
              <Text style={styles.bannerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Cuerpo Principal protegido por OnlineGate (HU-096) */}
        <ScrollView contentContainerStyle={styles.body}>
          <OnlineGate session={onlineSession}>
            <View style={styles.session} testID="management-session">
              {!currentUser ? (
                // Pantalla de No Autenticado / Login / Activación
                <View style={styles.authContainer}>
                  {showActivationWizard ? (
                    <OwnerActivationWizard
                      activationToken="tok-act-demo"
                      onActivated={() => {
                        setShowActivationWizard(false);
                        setCurrentUser(DEFAULT_USER);
                      }}
                    />
                  ) : (
                    <View style={styles.loginCard}>
                      <Text role="heading" style={styles.loginTitle}>
                        Portal de Administración
                      </Text>
                      <Text style={styles.loginSubtitle}>
                        Inicia sesión con tus credenciales de tendero o activa tu tienda nueva.
                      </Text>

                      <LoginForm
                        authService={authService}
                        onSuccess={() => {
                          const session = authService.getSession();
                          setCurrentUser(session?.user ?? DEFAULT_USER);
                        }}
                      />

                      <View style={styles.authDivider}>
                        <View style={styles.authDividerLine} />
                        <Text style={styles.authDividerText}>o</Text>
                        <View style={styles.authDividerLine} />
                      </View>

                      <TouchableOpacity
                        style={styles.activationButton}
                        onPress={() => setShowActivationWizard(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Activar tienda nueva"
                      >
                        <Sparkles size={18} color="#24734e" aria-hidden />
                        <Text style={styles.activationButtonText}>¿Nuevo Dueño? Activa tu Tienda</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.demoLoginBtn}
                        onPress={() => setCurrentUser(DEFAULT_USER)}
                        accessibilityRole="button"
                        accessibilityLabel="Ingreso Rápido de Demostración"
                      >
                        <Text style={styles.demoLoginText}>⚡ Ingreso Rápido Demo (Dueño)</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                // Consola de Administración Completa con Navegación Adaptativa
                <AdaptiveNavigation
                  user={currentUser}
                  activeSection={activeSection}
                  onSelectSection={setActiveSection}
                >
                  {/* SECCIÓN 1: DASHBOARD / RESUMEN */}
                  {activeSection === "dashboard" && (
                    <View style={styles.dashboardView}>
                      <View style={styles.viewHeader}>
                        <View>
                          <Text role="heading" style={styles.viewTitle}>
                            Resumen Operativo
                          </Text>
                          <Text style={styles.viewSubtitle}>
                            Indicadores en vivo de ventas, cajas y cumplimiento fiscal en Colombia
                          </Text>
                        </View>
                        <View style={styles.liveStreamBadge}>
                          <View style={styles.liveStreamDot} />
                          <Text style={styles.liveStreamText}>SSE Stream: Activo (38ms)</Text>
                        </View>
                      </View>

                      {/* Tarjetas de Métricas Clave */}
                      <View style={styles.kpiGrid}>
                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>Ventas de Hoy</Text>
                          <Text style={styles.kpiValue}>$1.485.000 COP</Text>
                          <Text style={styles.kpiDelta}>+18.4% vs promedio semanal</Text>
                        </View>

                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>Margen Bruto Global</Text>
                          <Text style={styles.kpiValue}>28.2%</Text>
                          <Text style={styles.kpiDelta}>Utilidad: $418.770 COP</Text>
                        </View>

                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>Cajas en Operación</Text>
                          <Text style={styles.kpiValue}>2 / 2 Cajas</Text>
                          <Text style={styles.kpiSub}>Arqueo ciego cuadrado</Text>
                        </View>

                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>Cartera Fiada Activa</Text>
                          <Text style={styles.kpiValue}>$230.000 COP</Text>
                          <Text style={styles.kpiDeltaNeg}>2 clientes con saldo</Text>
                        </View>

                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>Facturación DIAN UBL 2.1</Text>
                          <Text style={styles.kpiValue}>310 docs</Text>
                          <Text style={styles.kpiDelta}>CUDE SHA-384 verificado</Text>
                        </View>

                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>Alertas de Inventario</Text>
                          <Text style={styles.kpiValue}>2 productos</Text>
                          <Text style={styles.kpiDeltaNeg}>Stock en nivel crítico</Text>
                        </View>
                      </View>

                      {/* Botones de Acceso Rápido */}
                      <View style={styles.quickActionsContainer}>
                        <Text style={styles.quickActionsTitle}>Acciones Frecuentes</Text>
                        <View style={styles.quickActionsRow}>
                          <TouchableOpacity
                            style={styles.actionBtnPrimary}
                            onPress={() => {
                              setEditingProduct(null);
                              setShowProductForm(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Crear nuevo producto"
                          >
                            <Plus size={18} color="#ffffff" aria-hidden />
                            <Text style={styles.actionBtnPrimaryText}>Nuevo Producto</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnSecondary}
                            onPress={() => setShowCatalogWizard(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Asistente de Catálogo Inicial"
                          >
                            <Sparkles size={18} color="#24734e" aria-hidden />
                            <Text style={styles.actionBtnSecondaryText}>Asistente Catálogo</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.actionBtnSecondary}
                            onPress={handleGenerateEnrollmentQr}
                            accessibilityRole="button"
                            accessibilityLabel="Enrolar Nueva Caja POS"
                          >
                            <QrCode size={18} color="#24734e" aria-hidden />
                            <Text style={styles.actionBtnSecondaryText}>Enrolar Caja QR</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* SECCIÓN 2: CATÁLOGO */}
                  {activeSection === "catalog" && (
                    <View style={styles.sectionWrapper}>
                      <View style={styles.subHeaderActionRow}>
                        <TouchableOpacity
                          style={styles.wizardBadgeBtn}
                          onPress={() => setShowCatalogWizard(true)}
                          accessibilityRole="button"
                        >
                          <Sparkles size={16} color="#24734e" aria-hidden />
                          <Text style={styles.wizardBadgeText}>Precargar Catálogo de Barrio</Text>
                        </TouchableOpacity>
                      </View>

                      <ProductListScreen
                        products={products}
                        onNewProduct={() => {
                          setEditingProduct(null);
                          setShowProductForm(true);
                        }}
                        onEditProduct={(prod) => {
                          setEditingProduct(prod);
                          setShowProductForm(true);
                        }}
                        onDuplicateProduct={(prod) => {
                          const dup: ProductItem = {
                            ...prod,
                            id: `prod-${Date.now()}`,
                            name: `${prod.name} (Copia)`,
                            sku: `SKU-${Date.now()}`,
                            version: 1
                          };
                          setProducts((prev) => [dup, ...prev]);
                          setFeedMessage(`Copia creada para "${prod.name}"`);
                        }}
                        onQuickPriceUpdate={handleQuickPriceUpdate}
                      />
                    </View>
                  )}

                  {/* SECCIÓN 3: INVENTARIO Y CONTEOS */}
                  {activeSection === "inventory" && (
                    <View style={styles.sectionWrapper}>
                      <InventoryAdjustmentsScreen
                        initialItems={inventoryItems}
                        onConfirmAdjustment={handleConfirmInventory}
                      />
                    </View>
                  )}

                  {/* SECCIÓN 4: CLIENTES Y CARTERA (FIADO) */}
                  {activeSection === "customers" && (
                    <View style={styles.sectionWrapper} testID="customers-screen">
                      <View style={styles.viewHeader}>
                        <View>
                          <Text role="heading" style={styles.viewTitle}>
                            Clientes y Crédito en Tienda (Fiado)
                          </Text>
                          <Text style={styles.viewSubtitle}>
                            Control de cupos, abonos y cumplimiento estricto de Ley 1581 (Habeas Data)
                          </Text>
                        </View>
                      </View>

                      <View style={styles.customerList}>
                        {customers.map((c) => {
                          const hasDebt = c.balanceCents > 0;
                          return (
                            <View key={c.id} style={styles.customerCard}>
                              <View style={styles.customerInfo}>
                                <Text style={styles.customerName}>{c.name}</Text>
                                <Text style={styles.customerMeta}>
                                  CC: {c.docNumber} • Tel: {c.phone}
                                </Text>
                                <Text style={styles.customerLimit}>
                                  Cupo Máx: ${(c.creditLimitCents / 100).toLocaleString("es-CO")} COP
                                </Text>
                              </View>

                              <View style={styles.customerBalanceBox}>
                                <Text style={styles.customerBalanceLabel}>Saldo Pendiente:</Text>
                                <Text
                                  style={[
                                    styles.customerBalanceValue,
                                    hasDebt ? styles.textDebt : styles.textZero
                                  ]}
                                >
                                  ${(c.balanceCents / 100).toLocaleString("es-CO")} COP
                                </Text>

                                <View style={styles.customerActionRow}>
                                  {hasDebt ? (
                                    <TouchableOpacity
                                      style={styles.writeOffBtn}
                                      onPress={() => handleCustomerWriteOff(c.id)}
                                      accessibilityRole="button"
                                      accessibilityLabel="Condonar Deuda con MFA"
                                    >
                                      <ShieldAlert size={14} color="#dc2626" aria-hidden />
                                      <Text style={styles.writeOffBtnText}>Condonar Deuda (MFA)</Text>
                                    </TouchableOpacity>
                                  ) : null}

                                  <TouchableOpacity
                                    style={styles.anonymizeBtn}
                                    onPress={() => handleCustomerAnonymize(c.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel="Anonimizar Habeas Data"
                                  >
                                    <Text style={styles.anonymizeBtnText}>
                                      Suprimir Datos (Ley 1581)
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* SECCIÓN 5: TERMINALES / CAJAS */}
                  {activeSection === "terminals" && (
                    <View style={styles.sectionWrapper} testID="terminals-screen">
                      <View style={styles.viewHeader}>
                        <View>
                          <Text role="heading" style={styles.viewTitle}>
                            Cajas Registradoras POS
                          </Text>
                          <Text style={styles.viewSubtitle}>
                            Terminales autorizadas, sincronización bidireccional y enrolamiento seguro
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.actionBtnPrimary}
                          onPress={handleGenerateEnrollmentQr}
                          accessibilityRole="button"
                          accessibilityLabel="Generar QR de Enrolamiento"
                        >
                          <QrCode size={18} color="#ffffff" aria-hidden />
                          <Text style={styles.actionBtnPrimaryText}>Nuevo Enrolamiento</Text>
                        </TouchableOpacity>
                      </View>

                      {enrollmentQr ? (
                        <View style={styles.qrEnrollmentCard}>
                          <Text style={styles.qrTitle}>Código de Activación de Terminal</Text>
                          <Text style={styles.qrCodeText}>{enrollmentQr}</Text>
                          <Text style={styles.qrSubtitle}>
                            Escanea este código desde la app POS en Windows/Linux para autorizar la caja.
                            Expira en 15 minutos con token TOTP firmado por KMS.
                          </Text>
                          <TouchableOpacity
                            style={styles.qrCloseBtn}
                            onPress={() => setEnrollmentQr(null)}
                          >
                            <Text style={styles.qrCloseBtnText}>Cerrar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      <View style={styles.terminalList}>
                        {terminals.map((t) => (
                          <View key={t.id} style={styles.terminalCard}>
                            <View>
                              <Text style={styles.terminalCode}>{t.code}</Text>
                              <Text style={styles.terminalName}>{t.name}</Text>
                              <Text style={styles.terminalMeta}>Último Sync: {t.lastSync}</Text>
                            </View>

                            <View style={styles.terminalRight}>
                              <View
                                style={[
                                  styles.statusPill,
                                  t.status === "ONLINE"
                                    ? styles.statusOnline
                                    : t.status === "REVOKED"
                                      ? styles.statusRevoked
                                      : styles.statusOffline
                                ]}
                              >
                                <Text style={styles.statusPillText}>{t.status}</Text>
                              </View>

                              {t.status !== "REVOKED" ? (
                                <TouchableOpacity
                                  style={styles.revokeBtn}
                                  onPress={() => handleRevokeTerminal(t.id)}
                                  accessibilityRole="button"
                                  accessibilityLabel="Revocar terminal con Step-up MFA"
                                >
                                  <Text style={styles.revokeBtnText}>Revocar (MFA)</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* SECCIÓN 6: EMPLEADOS Y ROLES */}
                  {activeSection === "users" && (
                    <View style={styles.sectionWrapper} testID="users-screen">
                      <View style={styles.viewHeader}>
                        <View>
                          <Text role="heading" style={styles.viewTitle}>
                            Cajeros y Empleados de Tienda
                          </Text>
                          <Text style={styles.viewSubtitle}>
                            Control de accesos por PIN de 4 dígitos (con sal única Argon2id) y roles
                          </Text>
                        </View>
                      </View>

                      <View style={styles.employeeList}>
                        {employees.map((emp) => (
                          <View key={emp.id} style={styles.employeeCard}>
                            <View>
                              <Text style={styles.employeeName}>{emp.fullName}</Text>
                              <Text style={styles.employeeRole}>{emp.role}</Text>
                              <Text style={styles.employeePinStatus}>
                                {emp.pinSet ? "✓ PIN de 4 dígitos configurado" : "⚠ Sin PIN"}
                              </Text>
                            </View>

                            <View style={styles.employeeRight}>
                              <TouchableOpacity
                                style={[styles.lockToggleBtn, emp.isLocked && styles.btnLocked]}
                                onPress={() => handleToggleEmployeeLock(emp.id)}
                                accessibilityRole="button"
                              >
                                {emp.isLocked ? (
                                  <>
                                    <Lock size={16} color="#dc2626" aria-hidden />
                                    <Text style={styles.textLocked}>Bloqueado</Text>
                                  </>
                                ) : (
                                  <>
                                    <Unlock size={16} color="#15803d" aria-hidden />
                                    <Text style={styles.textUnlocked}>Activo</Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* SECCIÓN 7: FACTURACIÓN Y SUSCRIPCIÓN SAAS */}
                  {activeSection === "profile" && (
                    <View style={styles.sectionWrapper}>
                      <SubscriptionBillingScreen
                        planName="Plan Negocio Barrio"
                        planCode="NEGOCIO"
                        status="ACTIVE"
                        monthlyPriceCents={7990000} // $79.900 COP / mes
                        quotas={BILLING_QUOTAS}
                        invoices={BILLING_INVOICES}
                        onPayInvoice={(invId) => {
                          setFeedMessage(`Redirigiendo a pasarela Wompi para pago de ${invId}...`);
                        }}
                        onChangePlan={() => {
                          setFeedMessage("Contactando a soporte para cambio de plan.");
                        }}
                      />
                    </View>
                  )}
                </AdaptiveNavigation>
              )}
            </View>
          </OnlineGate>
        </ScrollView>

        {/* MODAL 1: Formulario de Creación / Edición de Producto */}
        {showProductForm ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContainer}>
              <ProductForm
                initialData={
                  editingProduct
                    ? {
                        id: editingProduct.id,
                        name: editingProduct.name,
                        sku: editingProduct.sku,
                        basePriceCents: editingProduct.basePriceCents,
                        costCents: editingProduct.costCents,
                        trackStock: editingProduct.trackStock,
                        categoryId: editingProduct.categoryId,
                        barcodes: editingProduct.barcodes
                      }
                    : undefined
                }
                onSave={handleSaveProduct}
                onCancel={() => {
                  setShowProductForm(false);
                  setEditingProduct(null);
                }}
              />
            </View>
          </View>
        ) : null}

        {/* MODAL 2: Asistente de Catálogo de Tienda de Barrio */}
        {showCatalogWizard ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContainer}>
              <InitialCatalogWizard
                onCompletePreload={(selectedIds) => {
                  setFeedMessage(
                    `Se precargaron los productos base para ${selectedIds.length} categorías seleccionadas.`
                  );
                  setShowCatalogWizard(false);
                }}
                onOpenExcelUpload={() => {
                  setFeedMessage("Cargador de archivo Excel activado (soporta .xlsx).");
                  setShowCatalogWizard(false);
                }}
                onOpenCameraScanner={() => {
                  setFeedMessage("Escáner de código de barras por cámara activado.");
                  setShowCatalogWizard(false);
                }}
              />
            </View>
          </View>
        ) : null}

        {/* MODAL 3: Centro de Ayuda y WhatsApp */}
        {showHelpModal ? (
          <HelpCenterModal
            storeName="Tienda La Esmeralda"
            terminalCode="CAJA-01"
            appVersion="1.2.0"
            onClose={() => setShowHelpModal(false)}
            onOpenWhatsApp={(url) => {
              setFeedMessage("Abriendo chat directo de soporte en WhatsApp...");
              setShowHelpModal(false);
            }}
          />
        ) : null}

        {/* MODAL 4: Step-Up MFA Challenge */}
        {showMfaModal ? (
          <StepUpMfaModal
            visible={showMfaModal}
            actionTitle="Confirmar Acción de Alto Riesgo"
            actionDescription="Se requiere verificación en dos pasos (código TOTP de 6 dígitos) para continuar con esta operación."
            onConfirm={async (_code: string) => {
              handleMfaSuccess();
              return true;
            }}
            onCancel={() => {
              setShowMfaModal(false);
              setPendingMfaAction(null);
            }}
          />
        ) : null}

        {/* Pie de Página */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>TienditaOnline v1.2.0 • Edición Colombia</Text>
          <Text style={styles.footerText}>Régimen Simple & Facturación DIAN UBL 2.1</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 12 },
  brand: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 20,
    color: "#0f172a",
    letterSpacing: -0.3
  },
  divider: { width: 1, height: 20, backgroundColor: "#cbd5e1" },
  storeName: { fontFamily: "DMSans_400Regular", fontSize: 14, color: "#475569" },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#15803d" },
  onlineText: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#15803d" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc"
  },
  helpButtonText: { fontFamily: "DMSans_600SemiBold", fontSize: 13, color: "#24734e" },
  userProfilePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 20
  },
  userName: { fontFamily: "DMSans_600SemiBold", fontSize: 13, color: "#1e293b" },
  logoutBtn: { padding: 4 },
  notificationBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderBottomWidth: 1,
    borderBottomColor: "#bbf7d0",
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10
  },
  notificationText: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "#166534"
  },
  bannerClose: { padding: 4 },
  bannerCloseText: { fontSize: 14, color: "#166534", fontWeight: "bold" },
  body: { flexGrow: 1 },
  session: { flex: 1, minHeight: 400 },
  authContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loginCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3
  },
  loginTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 22,
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 6
  },
  loginSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 20
  },
  authDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 16
  },
  authDividerLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  authDividerText: { fontSize: 12, color: "#94a3b8" },
  activationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#24734e",
    borderRadius: 8,
    paddingVertical: 12,
    backgroundColor: "#f0fdf4"
  },
  activationButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: "#24734e"
  },
  demoLoginBtn: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 8
  },
  demoLoginText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: "#3b82f6"
  },
  sectionWrapper: { flex: 1 },
  subHeaderActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "#f8fafc"
  },
  wizardBadgeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#e6f4ea",
    borderWidth: 1,
    borderColor: "#24734e"
  },
  wizardBadgeText: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#24734e" },
  dashboardView: { padding: 24 },
  viewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20
  },
  viewTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 24, color: "#0f172a" },
  viewSubtitle: { fontFamily: "DMSans_400Regular", fontSize: 14, color: "#64748b", marginTop: 2 },
  liveStreamBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe"
  },
  liveStreamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2563eb" },
  liveStreamText: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#1e40af" },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  kpiLabel: { fontFamily: "DMSans_400Regular", fontSize: 13, color: "#64748b" },
  kpiValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 22,
    color: "#0f172a",
    marginVertical: 4
  },
  kpiDelta: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#15803d" },
  kpiDeltaNeg: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#b91c1c" },
  kpiSub: { fontFamily: "DMSans_400Regular", fontSize: 12, color: "#475569" },
  quickActionsContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  quickActionsTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: "#0f172a",
    marginBottom: 14
  },
  quickActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  actionBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#24734e",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  actionBtnPrimaryText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: "#ffffff"
  },
  actionBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#24734e",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  actionBtnSecondaryText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: "#24734e"
  },
  customerList: { gap: 12 },
  customerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  customerInfo: { flex: 1, minWidth: 240 },
  customerName: { fontFamily: "DMSans_600SemiBold", fontSize: 16, color: "#0f172a" },
  customerMeta: { fontFamily: "DMSans_400Regular", fontSize: 13, color: "#64748b", marginTop: 2 },
  customerLimit: { fontFamily: "DMSans_400Regular", fontSize: 13, color: "#475569", marginTop: 4 },
  customerBalanceBox: { alignItems: "flex-end", minWidth: 200 },
  customerBalanceLabel: { fontFamily: "DMSans_400Regular", fontSize: 12, color: "#64748b" },
  customerBalanceValue: { fontFamily: "DMSans_600SemiBold", fontSize: 18, marginTop: 2 },
  textDebt: { color: "#dc2626" },
  textZero: { color: "#15803d" },
  customerActionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  writeOffBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  writeOffBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 11, color: "#dc2626" },
  anonymizeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc"
  },
  anonymizeBtnText: { fontFamily: "DMSans_400Regular", fontSize: 11, color: "#475569" },
  terminalList: { gap: 12 },
  terminalCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  terminalCode: { fontFamily: "DMSans_600SemiBold", fontSize: 16, color: "#24734e" },
  terminalName: { fontFamily: "DMSans_600SemiBold", fontSize: 14, color: "#0f172a", marginTop: 2 },
  terminalMeta: { fontFamily: "DMSans_400Regular", fontSize: 12, color: "#64748b", marginTop: 2 },
  terminalRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusOnline: { backgroundColor: "#dcfce7" },
  statusOffline: { backgroundColor: "#fef3c7" },
  statusRevoked: { backgroundColor: "#fee2e2" },
  statusPillText: { fontFamily: "DMSans_600SemiBold", fontSize: 11, color: "#0f172a" },
  revokeBtn: {
    backgroundColor: "#fef2f2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca"
  },
  revokeBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#dc2626" },
  qrEnrollmentCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#24734e",
    alignItems: "center",
    marginBottom: 16
  },
  qrTitle: { fontFamily: "DMSans_600SemiBold", fontSize: 16, color: "#0f172a" },
  qrCodeText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 20,
    color: "#24734e",
    letterSpacing: 2,
    marginVertical: 12,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  qrSubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    maxWidth: 500
  },
  qrCloseBtn: { marginTop: 12, paddingVertical: 6, paddingHorizontal: 16 },
  qrCloseBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 13, color: "#64748b" },
  employeeList: { gap: 12 },
  employeeCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  employeeName: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: "#0f172a" },
  employeeRole: { fontFamily: "DMSans_400Regular", fontSize: 13, color: "#64748b", marginTop: 2 },
  employeePinStatus: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: "#15803d",
    marginTop: 4
  },
  employeeRight: {},
  lockToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4"
  },
  btnLocked: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  textUnlocked: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#15803d" },
  textLocked: { fontFamily: "DMSans_600SemiBold", fontSize: 12, color: "#dc2626" },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 50
  },
  modalContainer: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  },
  footerText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: "#64748b" }
});
