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
import MessageCircle from "lucide-react-native/icons/message-circle";
import LogOut from "lucide-react-native/icons/log-out";
import Sparkles from "lucide-react-native/icons/sparkles";
import Plus from "lucide-react-native/icons/plus";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import QrCode from "lucide-react-native/icons/qr-code";
import Check from "lucide-react-native/icons/check";
import Lock from "lucide-react-native/icons/lock";
import LockOpen from "lucide-react-native/icons/lock-open";
import Banknote from "lucide-react-native/icons/banknote";

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
import {
  FiscalReportsScreen,
  FiscalDaySummary,
  DianResolutionInfo
} from "./src/components/FiscalReportsScreen";
import {
  CustomerContactModal,
  FiadoCustomerContactData
} from "./src/components/CustomerContactModal";
import {
  CustomerDebtPaymentModal,
  PaymentReceiptResult
} from "./src/components/CustomerDebtPaymentModal";
import {
  TerminalsScreen,
  TerminalItem
} from "./src/components/TerminalsScreen";
import {
  UsersScreen,
  EmployeeItem,
  StoreRoleCode
} from "./src/components/UsersScreen";
import {
  PaymentReconciliationScreen,
  DigitalPaymentItem
} from "./src/components/PaymentReconciliationScreen";
import {
  WarehouseTransfersModal,
  WarehouseTransferItem
} from "./src/components/WarehouseTransfersModal";
import Truck from "lucide-react-native/icons/truck";
import {
  SuperAdminScreen,
  SuperAdminMetrics,
  PlatformTenantItem,
  LocalLicenseItem
} from "./src/components/SuperAdminScreen";
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

const SUPER_ADMIN_USER: ManagementUser = {
  id: "usr-super-admin-001",
  fullName: "Super Admin Plataforma",
  email: "admin@tiendita.co",
  roleCode: "SUPER_ADMIN",
  permissions: [
    "platform.admin",
    "reports.read",
    "billing.read",
    "billing.write",
    "tenant.write"
  ]
};

const INITIAL_PLATFORM_METRICS: SuperAdminMetrics = {
  mrrCents: 1598000000, // $15.980.000 COP
  activeTenants: 124,
  trialTenants: 38,
  pastDueTenants: 5,
  restrictedTenants: 2,
  suspendedTenants: 1
};

const INITIAL_PLATFORM_TENANTS: PlatformTenantItem[] = [
  {
    id: "01a1a246-a060-7c7c-9063-7024c0619319",
    nit: "901555888-3",
    legalName: "Tienda La Esmeralda",
    plan: "NEGOCIO",
    status: "ACTIVE",
    branchesCount: 1,
    terminalsCount: 2,
    graceExtensionsCount: 0
  },
  {
    id: "01a1a246-b071-8d8d-8174-8135d1720420",
    nit: "900123456-1",
    legalName: "Supermercado El Roble",
    plan: "PRO",
    status: "ACTIVE",
    branchesCount: 3,
    terminalsCount: 6,
    graceExtensionsCount: 1
  },
  {
    id: "01a1a246-c082-9e9e-7285-9246e2831531",
    nit: "800987654-2",
    legalName: "Minimarket Los Paisas",
    plan: "BASICO",
    status: "PAST_DUE",
    branchesCount: 1,
    terminalsCount: 1,
    graceExtensionsCount: 0
  },
  {
    id: "01a1a246-d093-afaf-6396-0357f3942642",
    nit: "901444333-7",
    legalName: "Abarrotes Don Lucho",
    plan: "NEGOCIO",
    status: "TRIAL",
    branchesCount: 1,
    terminalsCount: 1,
    graceExtensionsCount: 0
  }
];

const INITIAL_LOCAL_LICENSES: LocalLicenseItem[] = [
  {
    id: "lic-001",
    tenantId: "offline-tenant-choco",
    edition: "LOCAL_PLUS",
    terminalsAllowed: 2,
    serialLast4: "9278E",
    status: "ACTIVE",
    issuedAtMs: Date.now() - 86400000 * 10,
    expiresAtMs: Date.now() + 86400000 * 355
  }
];

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

const DEFAULT_FISCAL_DAYS: FiscalDaySummary[] = [
  {
    date: "2026-11-01",
    initialReceipt: "POS-001-0001420",
    finalReceipt: "POS-001-0001468",
    ticketsCount: 49,
    grossTotalCents: 185000000,
    returnsCents: 0,
    netTotalCents: 185000000,
    taxBreakdown: {
      gravado19Cents: 85000000,
      iva19Cents: 16150000,
      gravado5Cents: 20000000,
      iva5Cents: 1000000,
      exentoCents: 45000000,
      excluidoCents: 35000000,
      inc8Cents: 0
    }
  },
  {
    date: "2026-11-02",
    initialReceipt: "POS-001-0001469",
    finalReceipt: "POS-001-0001524",
    ticketsCount: 56,
    grossTotalCents: 212000000,
    returnsCents: 480000,
    netTotalCents: 211520000,
    taxBreakdown: {
      gravado19Cents: 98000000,
      iva19Cents: 18620000,
      gravado5Cents: 22000000,
      iva5Cents: 1100000,
      exentoCents: 52000000,
      excluidoCents: 39520000,
      inc8Cents: 0
    }
  }
];

const DEFAULT_DIAN_RESOLUTION: DianResolutionInfo = {
  resolutionNumber: "18764000001234",
  prefix: "SETT",
  rangeFrom: 1,
  rangeTo: 5000,
  currentNumber: 1524,
  validTo: "2027-05-15",
  daysRemaining: 194,
  alertLevel: "NORMAL"
};

const SAMPLE_THERMAL_REPORT_Z = [
  "================================",
  "     TIENDA LA ESMERALDA        ",
  "       NIT: 901.234.567-8       ",
  "  Cra 15 # 45-20, Bogotá D.C.   ",
  "================================",
  "  CIERRE DIARIO FISCAL - REP Z  ",
  "Fecha: 2026-11-02     Hora: 21:00",
  "Terminal: CAJA-01                ",
  "--------------------------------",
  "Consecutivo Inicial: POS-001-0001469",
  "Consecutivo Final:   POS-001-0001524",
  "Total Transacciones: 56         ",
  "--------------------------------",
  "DESGLOSE TRIBUTARIO (COP)       ",
  "Base Gravable 19%:   $980.000   ",
  "IVA 19%:             $186.200   ",
  "Base Gravable 5%:    $220.000   ",
  "IVA 5%:              $11.000    ",
  "Exento:              $520.000   ",
  "Excluido:            $395.200   ",
  "INC 8%:              $0         ",
  "--------------------------------",
  "Ventas Brutas:       $2.120.000 ",
  "Devoluciones:        -$4.800    ",
  "VENTA NETA TOTAL:    $2.115.200 ",
  "--------------------------------",
  "MEDIOS DE PAGO                  ",
  "Efectivo en Caja:    $1.240.000 ",
  "Transferencia:       $580.000   ",
  "Nequi / Daviplata:   $295.200   ",
  "--------------------------------",
  "ARQUEO CIEGO DE EFECTIVO        ",
  "Esperado en Sistema: $1.240.000 ",
  "Contado en Caja:     $1.240.000 ",
  "Diferencia:          $0 (Cuadrado)",
  "================================",
  "  COMPROBANTE ART. 616 E.T.     ",
  "  Custodia Digital en Nube      ",
  "================================"
].join("\n");

function isLey2300Open(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0) return false;
  if (day === 6) return hour >= 8 && hour < 15;
  return hour >= 7 && hour < 19;
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
  const [showThermalModal, setShowThermalModal] = useState(false);
  const [fiscalDays, setFiscalDays] = useState<FiscalDaySummary[]>(DEFAULT_FISCAL_DAYS);
  const [dianResolution, setDianResolution] = useState<DianResolutionInfo>(DEFAULT_DIAN_RESOLUTION);
  const [fiscalMode, setFiscalMode] = useState<"NONE" | "DIAN_POS">("DIAN_POS");
  const [contactingCustomer, setContactingCustomer] = useState<FiadoCustomerContactData | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<FiadoCustomer | null>(null);
  const [customerWeeklyContacts, setCustomerWeeklyContacts] = useState<Record<string, number>>({});

  // Datos de Plataforma SaaS (Super Admin - Épica 12)
  const [platformMetrics, setPlatformMetrics] = useState<SuperAdminMetrics>(INITIAL_PLATFORM_METRICS);
  const [platformTenants, setPlatformTenants] = useState<PlatformTenantItem[]>(INITIAL_PLATFORM_TENANTS);
  const [platformLicenses, setPlatformLicenses] = useState<LocalLicenseItem[]>(INITIAL_LOCAL_LICENSES);

  // Datos en vivo
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRow[]>(INITIAL_INVENTORY_ITEMS);
  const [feedMessage, setFeedMessage] = useState<string | null>(null);

  // Conciliación de Pagos Digitales (Épica 09 & 10 - HU-102, HU-236)
  const [digitalPayments, setDigitalPayments] = useState<DigitalPaymentItem[]>([
    {
      paymentId: "pay-nq-001",
      saleId: "sale-8101",
      receiptCode: "POS-001201",
      method: "NEQUI",
      amountCents: 4500000,
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
      amountCents: 2850000,
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
      amountCents: 6200000,
      reference: "BRB-99120",
      status: "CONFIRMED",
      reconciledBy: "usr-owner-001",
      branchId: "branch-main",
      cashSessionId: "session-01",
      occurredAtMs: Date.now() - 3600000 * 5
    }
  ]);

  // Traslados entre Bodegas y Mermas (Épica 09 & 10 - HU-090, HU-092, HU-401, HU-402)
  const [transfers, setTransfers] = useState<WarehouseTransferItem[]>([
    {
      id: "tr-001-init",
      fromWarehouseId: "wh-main",
      toWarehouseId: "wh-sucursal-norte",
      productId: "prod-001",
      productName: "Arroz Diana Tradicional 1kg",
      sentQtyMilli: 15000,
      receivedQtyMilli: null,
      status: "IN_TRANSIT",
      diffNote: null
    }
  ]);
  const [showTransfersModal, setShowTransfersModal] = useState(false);

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
  const [terminals, setTerminals] = useState<TerminalItem[]>([
    { id: "term-01", code: "CAJA-01", name: "Caja Principal Entrada", status: "ONLINE", lastSync: "Hace 12 seg", receiptPrefix: "B01" },
    { id: "term-02", code: "CAJA-02", name: "Caja Pasillo 2 (Abarrotes)", status: "ONLINE", lastSync: "Hace 45 seg", receiptPrefix: "B02" }
  ]);
  const [enrollmentQr, setEnrollmentQr] = useState<string | null>(null);

  // Empleados y cajeros
  const [employees, setEmployees] = useState<EmployeeItem[]>([
    { id: "emp-01", fullName: "Don Pedro Pérez", email: "pedro@tiendita.co", role: "OWNER", pinSet: true, isLocked: false },
    { id: "emp-02", fullName: "Brayan Stiven Peña", email: "brayan@tiendita.co", role: "CASHIER", pinSet: true, isLocked: false },
    { id: "emp-03", fullName: "Yurany Andrea Silva", email: "yurany@tiendita.co", role: "STORE_MANAGER", pinSet: true, isLocked: false }
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

  const handleSendCustomerReminder = async (params: {
    customerId: string;
    channel: "WHATSAPP" | "SMS";
    message: string;
  }) => {
    setCustomerWeeklyContacts((prev) => ({
      ...prev,
      [params.customerId]: (prev[params.customerId] || 0) + 1
    }));
    setFeedMessage(
      `Recordatorio despachado a cliente por ${params.channel}. Evidencia registrada ante la SIC (Ley 2300).`
    );
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
              <MessageCircle size={20} color="#24734e" aria-hidden />
              <Text style={styles.helpButtonText}>Ayuda</Text>
            </TouchableOpacity>

            {currentUser ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.roleSwitcherBtn,
                    currentUser.roleCode === "SUPER_ADMIN" && styles.roleSwitcherSuperAdmin
                  ]}
                  onPress={() => {
                    if (currentUser.roleCode === "SUPER_ADMIN") {
                      setCurrentUser(DEFAULT_USER);
                      setActiveSection("dashboard");
                      setFeedMessage("Cambiado a modo Dueño de Tienda (Don Pedro Pérez).");
                    } else {
                      setCurrentUser(SUPER_ADMIN_USER);
                      setActiveSection("platform");
                      setFeedMessage("Cambiado a modo Consola Super Admin & Plataforma SaaS.");
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Alternar entre modo Dueño y modo Super Admin"
                  testID="btn-role-switcher"
                >
                  <Text
                    style={[
                      styles.roleSwitcherText,
                      currentUser.roleCode === "SUPER_ADMIN" && styles.roleSwitcherSuperAdminText
                    ]}
                  >
                    {currentUser.roleCode === "SUPER_ADMIN" ? "🛡️ Super Admin" : "🏪 Dueño Tienda"}
                  </Text>
                </TouchableOpacity>

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
              </>
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
                      <Text role="heading" accessibilityRole="header" style={styles.loginTitle}>
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

                      <TouchableOpacity
                        style={[styles.demoLoginBtn, { marginTop: 6, borderColor: "#99f6e4", backgroundColor: "#f0fdfa" }]}
                        onPress={() => {
                          setCurrentUser(SUPER_ADMIN_USER);
                          setActiveSection("platform");
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Ingreso Rápido Demo Super Admin"
                        testID="btn-demo-login-superadmin"
                      >
                        <Text style={[styles.demoLoginText, { color: "#0f766e" }]}>🛡️ Ingreso Rápido Demo (Super Admin)</Text>
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
                          <Text role="heading" accessibilityRole="header" style={styles.viewTitle}>
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
                      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 }}>
                        <TouchableOpacity
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            backgroundColor: "#059669",
                            paddingVertical: 10,
                            paddingHorizontal: 16,
                            borderRadius: 8
                          }}
                          onPress={() => setShowTransfersModal(true)}
                          testID="btn-open-transfers-modal"
                        >
                          <Truck size={18} color="#FFFFFF" />
                          <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13 }}>
                            Traslados y Mermas de Inventario
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <InventoryAdjustmentsScreen
                        initialItems={inventoryItems}
                        onConfirmAdjustment={handleConfirmInventory}
                      />
                    </View>
                  )}

                  {/* SECCIÓN 3.5: CONCILIACIÓN DE PAGOS DIGITALES (ÉPICA 09 & 10 - HU-102 & HU-236) */}
                  {activeSection === "reconciliation" && (
                    <View style={styles.sectionWrapper}>
                      <PaymentReconciliationScreen
                        initialPayments={digitalPayments}
                        onReconcileBatch={async (paymentIds, status) => {
                          setDigitalPayments((prev) =>
                            prev.map((p) =>
                              paymentIds.includes(p.paymentId)
                                ? { ...p, status, reconciledBy: currentUser?.fullName ?? "Don Pedro Pérez" }
                                : p
                            )
                          );
                          setFeedMessage(
                            status === "CONFIRMED"
                              ? `✓ ${paymentIds.length} pago(s) conciliado(s) exitosamente.`
                              : `Marcados ${paymentIds.length} pago(s) como rechazados / no recibidos.`
                          );
                        }}
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
                                    <>
                                      <TouchableOpacity
                                        style={styles.paymentBtn}
                                        onPress={() => setPayingCustomer(c)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Registrar abono de ${c.name}`}
                                        testID={`btn-abono-${c.id}`}
                                      >
                                        <Banknote size={14} color="#15803d" aria-hidden />
                                        <Text style={styles.paymentBtnText}>Abonar</Text>
                                      </TouchableOpacity>

                                      <TouchableOpacity
                                        style={styles.contactBtn}
                                        onPress={() =>
                                          setContactingCustomer({
                                            id: c.id,
                                            name: c.name,
                                            docNumber: c.docNumber,
                                            phone: c.phone,
                                            balanceCents: c.balanceCents
                                          })
                                        }
                                        accessibilityRole="button"
                                        accessibilityLabel="Recordar Deuda Ley 2300"
                                        testID={`btn-contact-${c.id}`}
                                      >
                                        <MessageCircle size={14} color="#166534" aria-hidden />
                                        <Text style={styles.contactBtnText}>Recordar (Ley 2300)</Text>
                                      </TouchableOpacity>

                                      <TouchableOpacity
                                        style={styles.writeOffBtn}
                                        onPress={() => handleCustomerWriteOff(c.id)}
                                        accessibilityRole="button"
                                        accessibilityLabel="Condonar Deuda con MFA"
                                      >
                                        <ShieldAlert size={14} color="#dc2626" aria-hidden />
                                        <Text style={styles.writeOffBtnText}>Condonar (MFA)</Text>
                                      </TouchableOpacity>
                                    </>
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

                  {/* SECCIÓN 5: TERMINALES / CAJAS (ÉPICA 02, 04, 08 & 10) */}
                  {activeSection === "terminals" && (
                    <View style={styles.sectionWrapper} testID="terminals-screen">
                      <TerminalsScreen
                        terminals={terminals}
                        onGenerateEnrollment={async () => {
                          const code = `ENR-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
                          setEnrollmentQr(code);
                          return code;
                        }}
                        onRevokeTerminal={async (termId) => {
                          triggerStepUpMfa(() => {
                            setTerminals((prev) =>
                              prev.map((t) => (t.id === termId ? { ...t, status: "REVOKED" } : t))
                            );
                            setFeedMessage(`Terminal ${termId} revocada correctamente con verificación Step-up MFA.`);
                          });
                        }}
                        onTestPrint={async (termId) => {
                          return {
                            success: true,
                            message: `Ticket de prueba ESC/POS (80mm) emitido con éxito en ${termId}.`
                          };
                        }}
                        onTestDrawer={async (termId) => {
                          return {
                            success: true,
                            message: `Pulso eléctrico RJ-11 (24V 100ms) enviado al cajón monedero de ${termId}.`
                          };
                        }}
                      />
                    </View>
                  )}

                  {/* SECCIÓN 6: EMPLEADOS Y ROLES (ÉPICA 02, 08 & 10) */}
                  {activeSection === "users" && (
                    <View style={styles.sectionWrapper} testID="users-screen">
                      <UsersScreen
                        employees={employees}
                        onCreateEmployee={async (data) => {
                          const newEmp: EmployeeItem = {
                            id: `emp-${Date.now()}`,
                            fullName: data.fullName,
                            email: data.email,
                            phone: data.phone,
                            role: data.role,
                            pinSet: !!data.initialPin,
                            isLocked: false
                          };
                          setEmployees((prev) => [...prev, newEmp]);
                          setFeedMessage(`Empleado "${data.fullName}" registrado como ${data.role}.`);
                        }}
                        onToggleLock={async (userId) => {
                          setEmployees((prev) =>
                            prev.map((e) => (e.id === userId ? { ...e, isLocked: !e.isLocked } : e))
                          );
                        }}
                        onResetPin={async (userId, _newPin) => {
                          setEmployees((prev) =>
                            prev.map((e) => (e.id === userId ? { ...e, pinSet: true } : e))
                          );
                          setFeedMessage(`PIN de 4 dígitos actualizado correctamente (cifrado con Argon2id).`);
                        }}
                      />
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

                  {/* SECCIÓN 8: GESTIÓN FISCAL, LIBRO FISCAL ART. 616 E.T. & DIAN */}
                  {activeSection === "fiscal" && (
                    <View style={styles.sectionWrapper}>
                      <FiscalReportsScreen
                        yearMonth="2026-11"
                        accumulatedYearCents={7850000000}
                        tope3500UvtCents={18375000000}
                        uvtAlertLevel="NORMAL"
                        days={fiscalDays}
                        dianResolution={dianResolution}
                        isLey2300WindowOpen={isLey2300Open()}
                        fiscalMode={fiscalMode}
                        onDownloadCsv={() => {
                          setFeedMessage("Descarga iniciada: Libro Fiscal Art. 616 E.T. (CSV)");
                        }}
                        onViewThermalReportZ={() => {
                          setShowThermalModal(true);
                        }}
                        onExportAccountingCsv={() => {
                          setFeedMessage("Descarga iniciada: Asiento Contable PUC Colombia (Siigo/Alegra CSV)");
                        }}
                        onRunDianTestSet={() => {
                          setFeedMessage("Habilitación DIAN: 10/10 pruebas superadas con éxito (TestSetId: TEST-SET-DIAN-2026-COLOMBIA)");
                        }}
                        onToggleFiscalMode={() => {
                          const nextMode = fiscalMode === "DIAN_POS" ? "NONE" : "DIAN_POS";
                          setFiscalMode(nextMode);
                          setFeedMessage(`Modo fiscal conmutado con éxito: ${nextMode}`);
                        }}
                      />
                    </View>
                  )}

                  {/* SECCIÓN 9: PLATAFORMA SAAS & CONSOLA SUPER ADMIN (ÉPICA 12) */}
                  {activeSection === "platform" && (
                    <View style={styles.sectionWrapper}>
                      <SuperAdminScreen
                        metrics={platformMetrics}
                        tenants={platformTenants}
                        localLicenses={platformLicenses}
                        onCreateTenantSaga={async (data) => {
                          const newTenantId = `tenant-${Date.now()}`;
                          const newTerminalCode = "CAJA-01";
                          const actToken = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                          const newTenant: PlatformTenantItem = {
                            id: newTenantId,
                            nit: `${data.documentNumber}-${data.nitDv ?? 0}`,
                            legalName: data.businessName,
                            plan: data.planCode,
                            status: "TRIAL",
                            branchesCount: 1,
                            terminalsCount: 1,
                            graceExtensionsCount: 0
                          };
                          setPlatformTenants((prev) => [newTenant, ...prev]);
                          setPlatformMetrics((prev) => ({
                            ...prev,
                            trialTenants: prev.trialTenants + 1
                          }));
                          return {
                            tenantId: newTenantId,
                            activationToken: actToken,
                            terminalCode: newTerminalCode
                          };
                        }}
                        onSuspendTenant={async (tenantId, _reason) => {
                          setPlatformTenants((prev) =>
                            prev.map((t) => (t.id === tenantId ? { ...t, status: "SUSPENDED" } : t))
                          );
                          setPlatformMetrics((prev) => ({
                            ...prev,
                            activeTenants: Math.max(0, prev.activeTenants - 1),
                            suspendedTenants: prev.suspendedTenants + 1
                          }));
                        }}
                        onReactivateTenant={async (tenantId) => {
                          setPlatformTenants((prev) =>
                            prev.map((t) => (t.id === tenantId ? { ...t, status: "ACTIVE" } : t))
                          );
                          setPlatformMetrics((prev) => ({
                            ...prev,
                            suspendedTenants: Math.max(0, prev.suspendedTenants - 1),
                            activeTenants: prev.activeTenants + 1
                          }));
                        }}
                        onGrantGraceExtension={async (tenantId, _extraDays, _reason) => {
                          setPlatformTenants((prev) =>
                            prev.map((t) =>
                              t.id === tenantId
                                ? {
                                    ...t,
                                    graceExtensionsCount: t.graceExtensionsCount + 1,
                                    status: "ACTIVE"
                                  }
                                : t
                            )
                          );
                        }}
                        onIssueLocalLicense={async (data) => {
                          const licId = `lic-${Date.now()}`;
                          const randomHex = Math.random().toString(16).slice(2, 7).toUpperCase();
                          const serial = `TDL-${randomHex}-86BB3-C0BF9-${randomHex}`;
                          const newLic: LocalLicenseItem = {
                            id: licId,
                            tenantId: data.tenantId,
                            edition: data.edition,
                            terminalsAllowed: data.terminalsAllowed,
                            serialLast4: serial.slice(-5),
                            status: "ACTIVE",
                            issuedAtMs: Date.now(),
                            expiresAtMs: Date.now() + data.durationDays * 86400000
                          };
                          setPlatformLicenses((prev) => [newLic, ...prev]);
                          return { licenseId: licId, serialKey: serial };
                        }}
                        onRequestJitSupport={async (tenantId, _reason) => {
                          const sessId = `01a1a249-ada0-776b-ad3a-${tenantId.slice(0, 12)}`;
                          return { sessionId: sessId, expiresAtMs: Date.now() + 1800000 };
                        }}
                        onRunDunningScheduler={async () => {
                          return {
                            evaluatedCount: platformTenants.length,
                            restrictedCount: 1,
                            suspendedCount: 0
                          };
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

        {/* MODAL 5: Previsualización Tiquete Térmico Reporte Z */}
        {showThermalModal ? (
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContainer, { maxWidth: 460, padding: 20 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontFamily: "DMSans_600SemiBold", fontSize: 16, color: "#0f172a" }}>
                  Comprobante Térmico Reporte Z (80mm)
                </Text>
                <TouchableOpacity
                  onPress={() => setShowThermalModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar vista previa térmica"
                  style={{ padding: 4 }}
                >
                  <Text style={{ fontSize: 18, color: "#64748b", fontWeight: "bold" }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 400,
                  borderWidth: 1,
                  borderColor: "#e2e8f0"
                }}
              >
                <Text
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: "#1e293b",
                    lineHeight: 16
                  }}
                  testID="thermal-slip-preview-text"
                >
                  {SAMPLE_THERMAL_REPORT_Z}
                </Text>
              </ScrollView>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.actionBtnSecondary, { paddingVertical: 8, paddingHorizontal: 12 }]}
                  onPress={() => {
                    setFeedMessage("Texto de tiquete térmico copiado.");
                    setShowThermalModal(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnSecondaryText}>Copiar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtnPrimary, { paddingVertical: 8, paddingHorizontal: 12 }]}
                  onPress={() => {
                    setFeedMessage("Enviando orden de impresión ESC/POS a CAJA-01...");
                    setShowThermalModal(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnPrimaryText}>Imprimir ESC/POS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* MODAL 6: Recordatorio de Cobro Ley 2300 */}
        {contactingCustomer ? (
          <CustomerContactModal
            visible={Boolean(contactingCustomer)}
            customer={contactingCustomer}
            weeklyContactsUsed={customerWeeklyContacts[contactingCustomer.id] || 0}
            onClose={() => setContactingCustomer(null)}
            onSendContact={handleSendCustomerReminder}
          />
        ) : null}

        {/* MODAL 7: Registro de Abono a Cartera de Fiado */}
        {payingCustomer ? (
          <CustomerDebtPaymentModal
            visible={Boolean(payingCustomer)}
            customer={payingCustomer}
            storeName="Tienda La Esmeralda"
            onClose={() => setPayingCustomer(null)}
            onConfirmPayment={async (params) => {
              const cust = customers.find((c) => c.id === params.customerId);
              const prevBal = cust?.balanceCents ?? 0;
              const newBal = Math.max(0, prevBal - params.amountCents);
              setCustomers((prev) =>
                prev.map((c) => (c.id === params.customerId ? { ...c, balanceCents: newBal } : c))
              );
              setFeedMessage(
                `✓ Abono de $${(params.amountCents / 100).toLocaleString("es-CO")} COP recibido de ${cust?.name}.`
              );
              const receiptSeq = Math.floor(1000 + (Date.now() % 90000));
              return {
                receiptNumber: `REC-${new Date().getFullYear()}-${receiptSeq}`,
                customerId: params.customerId,
                customerName: cust?.name ?? "Cliente",
                previousBalanceCents: prevBal,
                amountPaidCents: params.amountCents,
                newBalanceCents: newBal,
                method: params.method,
                reference: params.reference,
                receivedBy: currentUser?.fullName ?? "Don Pedro Pérez",
                occurredAt: new Date().toISOString(),
                legalNotice: "Recibo de abono a cartera expedido de conformidad con la Ley 1581 de 2012 y Art. 616 del E.T."
              };
            }}
          />
        ) : null}

        {/* MODAL 8: Traslados entre Bodegas y Ajustes de Merma */}
        <WarehouseTransfersModal
          isOpen={showTransfersModal}
          onClose={() => setShowTransfersModal(false)}
          transfers={transfers}
          products={products}
          onDispatchTransfer={async (params) => {
            const prod = products.find((p) => p.id === params.productId);
            const newTr: WarehouseTransferItem = {
              id: `tr-${Date.now()}`,
              fromWarehouseId: params.fromWarehouseId,
              toWarehouseId: params.toWarehouseId,
              productId: params.productId,
              productName: prod?.name,
              sentQtyMilli: params.qtyMilli,
              receivedQtyMilli: null,
              status: "IN_TRANSIT",
              diffNote: null
            };
            setTransfers((prev) => [newTr, ...prev]);
            setProducts((prev) =>
              prev.map((p) =>
                p.id === params.productId
                  ? { ...p, stockQtyMilli: Math.max(0, (p.stockQtyMilli ?? 0) - params.qtyMilli) }
                  : p
              )
            );
            setFeedMessage(`Traslado de ${params.qtyMilli / 1000} unidades despachado.`);
          }}
          onReceiveTransfer={async (params) => {
            setTransfers((prev) =>
              prev.map((t) => {
                if (t.id === params.transferId) {
                  const isDiff = params.receivedQtyMilli !== t.sentQtyMilli;
                  return {
                    ...t,
                    receivedQtyMilli: params.receivedQtyMilli,
                    status: isDiff ? "RECEIVED_WITH_DIFF" : "RECEIVED",
                    diffNote: params.diffNote ?? null
                  };
                }
                return t;
              })
            );
            setFeedMessage(`Entrada de almacén confirmada (${params.receivedQtyMilli / 1000} unidades recibidas).`);
          }}
          onRecordAdjustment={async (params) => {
            setProducts((prev) =>
              prev.map((p) =>
                p.id === params.productId
                  ? { ...p, stockQtyMilli: Math.max(0, (p.stockQtyMilli ?? 0) + params.deltaMilli) }
                  : p
              )
            );
            setFeedMessage(`Ajuste de inventario (${params.kind}) registrado: ${params.reason}`);
          }}
        />

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
  page: { flex: 1, backgroundColor: "#f8fafc", width: "100%", maxWidth: "100%", overflow: "hidden" },
  header: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    maxWidth: "100%"
  },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 1 },
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
  paymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#86efac",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  paymentBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 11, color: "#15803d" },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  contactBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 11, color: "#166534" },
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
  roleSwitcherBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4"
  },
  roleSwitcherSuperAdmin: {
    borderColor: "#99f6e4",
    backgroundColor: "#f0fdfa"
  },
  roleSwitcherText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: "#24734e"
  },
  roleSwitcherSuperAdminText: {
    color: "#0f766e"
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    maxWidth: "100%"
  },
  footerText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: "#64748b" }
});
