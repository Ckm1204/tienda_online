import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  TextInput,
  useWindowDimensions
} from "react-native";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import Plus from "lucide-react-native/icons/plus";
import Key from "lucide-react-native/icons/key";
import Clock from "lucide-react-native/icons/clock";
import Search from "lucide-react-native/icons/search";
import Play from "lucide-react-native/icons/play";
import Check from "lucide-react-native/icons/check";
import Copy from "lucide-react-native/icons/copy";
import X from "lucide-react-native/icons/x";
import Lock from "lucide-react-native/icons/lock";
import LockOpen from "lucide-react-native/icons/lock-open";
import { calculateNitDv, validateNitWithDv } from "@tiendita/contracts";

export interface SuperAdminMetrics {
  mrrCents: number;
  activeTenants: number;
  trialTenants: number;
  pastDueTenants: number;
  restrictedTenants: number;
  suspendedTenants: number;
}

export interface PlatformTenantItem {
  id: string;
  nit: string;
  legalName: string;
  plan: "BASICO" | "NEGOCIO" | "PRO";
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED" | "CANCELLED";
  branchesCount: number;
  terminalsCount: number;
  graceExtensionsCount: number;
  paidUntilMs?: number;
}

export interface LocalLicenseItem {
  id: string;
  tenantId: string;
  edition: "LOCAL_ESSENTIAL" | "LOCAL_PLUS" | "LOCAL_PRO";
  terminalsAllowed: number;
  serialLast4: string;
  status: "ISSUED" | "ACTIVE" | "REVOKED";
  issuedAtMs: number;
  expiresAtMs: number;
}

export interface SuperAdminScreenProps {
  metrics: SuperAdminMetrics;
  tenants: PlatformTenantItem[];
  localLicenses: LocalLicenseItem[];
  onCreateTenantSaga: (data: {
    businessName: string;
    documentType: "NIT" | "CC";
    documentNumber: string;
    nitDv?: number;
    planCode: "BASICO" | "NEGOCIO" | "PRO";
    ownerEmail: string;
    ownerPhone?: string;
  }) => Promise<{ tenantId: string; activationToken: string; terminalCode: string }>;
  onSuspendTenant: (tenantId: string, reason: string) => Promise<void>;
  onReactivateTenant: (tenantId: string) => Promise<void>;
  onGrantGraceExtension: (tenantId: string, extraDays: number, reason: string) => Promise<void>;
  onIssueLocalLicense: (data: {
    tenantId: string;
    edition: "LOCAL_ESSENTIAL" | "LOCAL_PLUS" | "LOCAL_PRO";
    terminalsAllowed: number;
    durationDays: number;
  }) => Promise<{ licenseId: string; serialKey: string }>;
  onRequestJitSupport: (tenantId: string, reason: string) => Promise<{ sessionId: string; expiresAtMs: number }>;
  onRunDunningScheduler: () => Promise<{ evaluatedCount: number; restrictedCount: number; suspendedCount: number }>;
}

function formatCOP(cents: number): string {
  return "$" + (cents / 100).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " COP";
}

export function SuperAdminScreen({
  metrics,
  tenants,
  localLicenses,
  onCreateTenantSaga,
  onSuspendTenant,
  onReactivateTenant,
  onGrantGraceExtension,
  onIssueLocalLicense,
  onRequestJitSupport,
  onRunDunningScheduler
}: SuperAdminScreenProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800;

  // Filtros de directorio
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Estados de Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showJitModal, setShowJitModal] = useState(false);
  const [showGraceModal, setShowGraceModal] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  // Formulario Nueva Tienda
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreNitRaw, setNewStoreNitRaw] = useState("");
  const [newStoreEmail, setNewStoreEmail] = useState("");
  const [newStorePhone, setNewStorePhone] = useState("");
  const [newStorePlan, setNewStorePlan] = useState<"BASICO" | "NEGOCIO" | "PRO">("NEGOCIO");
  const [createdTenantResult, setCreatedTenantResult] = useState<{
    tenantId: string;
    activationToken: string;
    terminalCode: string;
  } | null>(null);

  // Formulario Licencia Local
  const [licenseTenantId, setLicenseTenantId] = useState("");
  const [licenseEdition, setLicenseEdition] = useState<"LOCAL_ESSENTIAL" | "LOCAL_PLUS" | "LOCAL_PRO">("LOCAL_PLUS");
  const [licenseTerminals, setLicenseTerminals] = useState("1");
  const [licenseDays, setLicenseDays] = useState("365");
  const [issuedSerialResult, setIssuedSerialResult] = useState<string | null>(null);

  // Formulario JIT Support
  const [jitReason, setJitReason] = useState("");
  const [jitSessionResult, setJitSessionResult] = useState<{ sessionId: string; expiresAtMs: number } | null>(null);

  // Formulario Prórroga
  const [graceReason, setGraceReason] = useState("");
  const [graceDays, setGraceDays] = useState("7");

  // Estado general de feedback y carga
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cálculo Módulo 11 en tiempo real para el NIT ingresado
  const computedNitInfo = useMemo(() => {
    const cleanNit = newStoreNitRaw.trim().replace(/[^0-9]/g, "");
    if (!cleanNit || cleanNit.length < 5) {
      return { cleanNit, dv: null, isValid: false };
    }
    try {
      const dv = calculateNitDv(cleanNit);
      const isValid = validateNitWithDv(cleanNit, dv);
      return { cleanNit, dv, isValid };
    } catch {
      return { cleanNit, dv: null, isValid: false };
    }
  }, [newStoreNitRaw]);

  // Filtrado de tiendas
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        t.legalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.nit.includes(searchQuery) ||
        t.id.includes(searchQuery);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && t.status === "ACTIVE") ||
        (statusFilter === "TRIAL" && t.status === "TRIAL") ||
        (statusFilter === "PAST_DUE" && (t.status === "PAST_DUE" || t.status === "RESTRICTED")) ||
        (statusFilter === "SUSPENDED" && t.status === "SUSPENDED");

      return matchesSearch && matchesStatus;
    });
  }, [tenants, searchQuery, statusFilter]);

  const handleCreateTenant = async () => {
    if (!newStoreName.trim() || !newStoreEmail.trim() || !computedNitInfo.cleanNit) {
      setFeedbackMsg({ type: "error", text: "Por favor diligencia nombre, correo y NIT válido." });
      return;
    }
    if (computedNitInfo.dv === null) {
      setFeedbackMsg({ type: "error", text: "El NIT ingresado no cumple con el algoritmo Módulo 11 de la DIAN." });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const result = await onCreateTenantSaga({
        businessName: newStoreName.trim(),
        documentType: "NIT",
        documentNumber: computedNitInfo.cleanNit,
        nitDv: computedNitInfo.dv,
        planCode: newStorePlan,
        ownerEmail: newStoreEmail.trim(),
        ownerPhone: newStorePhone.trim() || undefined
      });
      setCreatedTenantResult(result);
      setFeedbackMsg({
        type: "success",
        text: `Tienda creada con éxito. Sede MAIN y caja ${result.terminalCode} configuradas.`
      });
      // Limpiar campos formulario
      setNewStoreName("");
      setNewStoreNitRaw("");
      setNewStoreEmail("");
      setNewStorePhone("");
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: `Error al crear tienda: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssueLicense = async () => {
    const tid = licenseTenantId.trim() || "offline-standalone-tenant";
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const result = await onIssueLocalLicense({
        tenantId: tid,
        edition: licenseEdition,
        terminalsAllowed: parseInt(licenseTerminals, 10) || 1,
        durationDays: parseInt(licenseDays, 10) || 365
      });
      setIssuedSerialResult(result.serialKey);
      setFeedbackMsg({
        type: "success",
        text: `Serial único emitido: ${result.serialKey} (${licenseEdition})`
      });
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: `Error al emitir licencia: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestJit = async () => {
    if (!selectedTenantId || !jitReason.trim()) {
      setFeedbackMsg({ type: "error", text: "El motivo de soporte JIT es obligatorio (Auditoría SIC)." });
      return;
    }
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res = await onRequestJitSupport(selectedTenantId, jitReason.trim());
      setJitSessionResult(res);
      setFeedbackMsg({
        type: "success",
        text: `Sesión de soporte JIT autorizada por 30 minutos (Token ID: ${res.sessionId.slice(0, 12)}...)`
      });
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: `Error al solicitar JIT: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrantGrace = async () => {
    if (!selectedTenantId || !graceReason.trim()) {
      setFeedbackMsg({ type: "error", text: "El motivo de la prórroga es obligatorio para la auditoría." });
      return;
    }
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const days = parseInt(graceDays, 10) || 7;
      await onGrantGraceExtension(selectedTenantId, days, graceReason.trim());
      setShowGraceModal(false);
      setSelectedTenantId(null);
      setGraceReason("");
      setFeedbackMsg({
        type: "success",
        text: `Prórroga de ${days} días concedida exitosamente.`
      });
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: `Error al conceder prórroga: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerDunning = async () => {
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const res = await onRunDunningScheduler();
      setFeedbackMsg({
        type: "success",
        text: `Scheduler de Mora ejecutado: ${res.evaluatedCount} tiendas evaluadas (${res.restrictedCount} restringidas, ${res.suspendedCount} suspendidas).`
      });
    } catch (err) {
      setFeedbackMsg({
        type: "error",
        text: `Error al ejecutar dunning: ${err instanceof Error ? err.message : String(err)}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} testID="super-admin-screen">
      {/* Encabezado */}
      <View style={styles.headerRow}>
        <View>
          <View style={styles.titleRow}>
            <ShieldCheck size={26} color="#0f766e" aria-hidden />
            <Text role="heading" style={styles.title}>
              Consola Super Admin & Plataforma SaaS
            </Text>
          </View>
          <Text style={styles.subtitle}>
            Control central de inquilinos (Tenants), métricas MRR, saga de alta, facturación y licencias Edición Local
          </Text>
        </View>

        <View style={styles.topActionsRow}>
          <TouchableOpacity
            style={styles.actionBtnPrimary}
            onPress={() => {
              setCreatedTenantResult(null);
              setShowCreateModal(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Crear Nueva Tienda"
            testID="btn-open-create-tenant-modal"
          >
            <Plus size={16} color="#ffffff" aria-hidden />
            <Text style={styles.actionBtnPrimaryText}>Nueva Tienda (Saga)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => {
              setIssuedSerialResult(null);
              setShowLicenseModal(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Emitir Licencia Edición Local"
            testID="btn-open-license-modal"
          >
            <Key size={16} color="#0f766e" aria-hidden />
            <Text style={styles.actionBtnSecondaryText}>Licencia Local</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={handleTriggerDunning}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Evaluar Dunning de Mora"
            testID="btn-run-dunning"
          >
            <Play size={14} color="#334155" aria-hidden />
            <Text style={styles.actionBtnOutlineText}>Evaluar Mora</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner de Feedback */}
      {feedbackMsg && (
        <View
          style={[
            styles.feedbackBanner,
            feedbackMsg.type === "success" ? styles.bannerSuccess : styles.bannerError
          ]}
          testID="platform-feedback-banner"
        >
          {feedbackMsg.type === "success" ? (
            <Check size={18} color="#15803d" aria-hidden />
          ) : (
            <ShieldAlert size={18} color="#b91c1c" aria-hidden />
          )}
          <Text
            style={[
              styles.feedbackText,
              feedbackMsg.type === "success" ? styles.textSuccess : styles.textError
            ]}
          >
            {feedbackMsg.text}
          </Text>
        </View>
      )}

      {/* Tarjetas de Métricas SaaS */}
      <View style={styles.metricsGrid} testID="platform-metrics-grid">
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>MRR Activo Facturado</Text>
          <Text style={styles.metricValueLarge}>{formatCOP(metrics.mrrCents)}</Text>
          <Text style={styles.metricSub}>Ingresos recurrentes mensuales</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Tiendas Activas</Text>
          <Text style={[styles.metricValueLarge, { color: "#15803d" }]}>{metrics.activeTenants}</Text>
          <Text style={styles.metricSub}>Al día en pagos y operando</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>En Periodo de Prueba (Trial)</Text>
          <Text style={[styles.metricValueLarge, { color: "#0284c7" }]}>{metrics.trialTenants}</Text>
          <Text style={styles.metricSub}>15 días de gracia sin cobro</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>En Mora / Restringidas</Text>
          <Text style={[styles.metricValueLarge, { color: metrics.pastDueTenants > 0 ? "#ea580c" : "#475569" }]}>
            {metrics.pastDueTenants + metrics.restrictedTenants}
          </Text>
          <Text style={styles.metricSub}>D+1 a D+8 en cobro preventivo</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Suspendidas</Text>
          <Text style={[styles.metricValueLarge, { color: metrics.suspendedTenants > 0 ? "#dc2626" : "#475569" }]}>
            {metrics.suspendedTenants}
          </Text>
          <Text style={styles.metricSub}>Mora mayor a 30 días (D+31)</Text>
        </View>
      </View>

      {/* Directorio de Inquilinos */}
      <View style={styles.directorySection} testID="tenants-directory-section">
        <View style={styles.directoryHeader}>
          <View>
            <Text style={styles.sectionTitle}>Directorio Global de Tiendas ({tenants.length})</Text>
            <Text style={styles.sectionSubtitle}>
              Monitoreo de sucursales, cajas POS autorizadas, prórrogas legales y acceso JIT
            </Text>
          </View>

          {/* Barra de Búsqueda y Filtros */}
          <View style={styles.filterControls}>
            <View style={styles.searchBox}>
              <Search size={16} color="#64748b" aria-hidden />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por NIT, nombre o ID..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#94a3b8"
                testID="input-search-tenants"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <X size={14} color="#64748b" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.filterTabs}>
              {[
                { id: "ALL", label: "Todas" },
                { id: "ACTIVE", label: "Activas" },
                { id: "TRIAL", label: "Trial" },
                { id: "PAST_DUE", label: "En Mora" },
                { id: "SUSPENDED", label: "Suspendidas" }
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.filterChip, statusFilter === tab.id && styles.filterChipActive]}
                  onPress={() => setStatusFilter(tab.id)}
                  testID={`filter-tab-${tab.id}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      statusFilter === tab.id && styles.filterChipTextActive
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Tabla Responsive de Inquilinos */}
        <View style={styles.tableCard}>
          {filteredTenants.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No se encontraron tiendas con los criterios actuales.</Text>
            </View>
          ) : (
            filteredTenants.map((tenant) => {
              const isSuspended = tenant.status === "SUSPENDED";
              const isPastDue = tenant.status === "PAST_DUE" || tenant.status === "RESTRICTED";
              const isTrial = tenant.status === "TRIAL";

              return (
                <View key={tenant.id} style={styles.tenantRow} testID={`tenant-row-${tenant.id}`}>
                  <View style={styles.tenantInfoCol}>
                    <View style={styles.tenantTitleLine}>
                      <Text style={styles.tenantName}>{tenant.legalName}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          isSuspended
                            ? styles.badgeRed
                            : isPastDue
                              ? styles.badgeOrange
                              : isTrial
                                ? styles.badgeBlue
                                : styles.badgeGreen
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            isSuspended
                              ? styles.textRed
                              : isPastDue
                                ? styles.textOrange
                                : isTrial
                                  ? styles.textBlue
                                  : styles.textGreen
                          ]}
                        >
                          {tenant.status}
                        </Text>
                      </View>
                      <View style={styles.planBadge}>
                        <Text style={styles.planBadgeText}>PLAN {tenant.plan}</Text>
                      </View>
                    </View>

                    <Text style={styles.tenantMeta}>
                      NIT: {tenant.nit} • ID: {tenant.id.slice(0, 8)}... • Sedes: {tenant.branchesCount} • Cajas:{" "}
                      {tenant.terminalsCount} • Prórrogas año: {tenant.graceExtensionsCount}/2
                    </Text>
                  </View>

                  <View style={styles.tenantActionsCol}>
                    {/* Botón Soporte JIT (30 min) */}
                    <TouchableOpacity
                      style={styles.btnJit}
                      onPress={() => {
                        setSelectedTenantId(tenant.id);
                        setJitReason("");
                        setJitSessionResult(null);
                        setShowJitModal(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Acceso JIT 30 min"
                      testID={`btn-jit-${tenant.id}`}
                    >
                      <Clock size={14} color="#0369a1" aria-hidden />
                      <Text style={styles.btnJitText}>Soporte JIT</Text>
                    </TouchableOpacity>

                    {/* Botón Conceder Prórroga (máx 2/año) */}
                    {tenant.graceExtensionsCount < 2 && !isSuspended && (
                      <TouchableOpacity
                        style={styles.btnGrace}
                        onPress={() => {
                          setSelectedTenantId(tenant.id);
                          setGraceReason("");
                          setShowGraceModal(true);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Prórroga 7 Días"
                        testID={`btn-grace-${tenant.id}`}
                      >
                        <Text style={styles.btnGraceText}>+7 Días Gracia</Text>
                      </TouchableOpacity>
                    )}

                    {/* Botón Suspender / Reactivar */}
                    {isSuspended ? (
                      <TouchableOpacity
                        style={styles.btnReactivate}
                        onPress={() => onReactivateTenant(tenant.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Reactivar Tienda"
                        testID={`btn-reactivate-${tenant.id}`}
                      >
                        <LockOpen size={14} color="#15803d" aria-hidden />
                        <Text style={styles.btnReactivateText}>Reactivar</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.btnSuspend}
                        onPress={() => onSuspendTenant(tenant.id, "Suspensión administrativa desde Consola Super Admin")}
                        accessibilityRole="button"
                        accessibilityLabel="Suspender Tienda"
                        testID={`btn-suspend-${tenant.id}`}
                      >
                        <Lock size={14} color="#dc2626" aria-hidden />
                        <Text style={styles.btnSuspendText}>Suspender</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      {/* Historial de Licencias Edición Local Emitidas */}
      <View style={styles.licensesSection} testID="local-licenses-section">
        <Text style={styles.sectionTitle}>Licencias Edición Local (Offline Standalone)</Text>
        <Text style={styles.sectionSubtitle}>
          Seriales únicos criptográficos para municipios colombianos sin cobertura de fibra óptica
        </Text>

        <View style={styles.tableCard}>
          {localLicenses.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No se han emitido seriales para Edición Local todavía.</Text>
            </View>
          ) : (
            localLicenses.map((lic) => (
              <View key={lic.id} style={styles.licenseRow} testID={`license-row-${lic.id}`}>
                <View>
                  <Text style={styles.licenseSerial}>Serial: TDL-•••••-•••••-{lic.serialLast4}</Text>
                  <Text style={styles.licenseMeta}>
                    Edición: {lic.edition} • Cajas: {lic.terminalsAllowed} • Estado: {lic.status}
                  </Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{lic.status}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      {/* ========================================================================= */}
      {/* MODAL 1: SAGA DE CREACIÓN DE TIENDA (JIT ORCHESTRATION)                    */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <View style={styles.modalBackdrop} testID="modal-create-tenant">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Crear Nueva Tienda (Saga JIT)</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {createdTenantResult ? (
              <View style={styles.successResultBox} testID="tenant-created-success-box">
                <Check size={28} color="#15803d" />
                <Text style={styles.resultTitle}>¡Tienda Creada Exitosamente!</Text>
                <Text style={styles.resultText}>ID Tienda: {createdTenantResult.tenantId}</Text>
                <Text style={styles.resultText}>Caja Inicial: {createdTenantResult.terminalCode}</Text>
                <View style={styles.tokenBox}>
                  <Text style={styles.tokenLabel}>Token de Activación para el Dueño:</Text>
                  <Text style={styles.tokenValue}>{createdTenantResult.activationToken}</Text>
                </View>
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => setShowCreateModal(false)}
                >
                  <Text style={styles.actionBtnPrimaryText}>Entendido y Cerrar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formBody}>
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Nombre Comercial de la Tienda *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Ej. Tienda Mi Colombia"
                    value={newStoreName}
                    onChangeText={setNewStoreName}
                    testID="input-store-name"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>NIT Colombia (Sin guión ni DV) *</Text>
                  <View style={styles.nitInputRow}>
                    <TextInput
                      style={[styles.inputField, { flex: 1 }]}
                      placeholder="Ej. 901555888"
                      value={newStoreNitRaw}
                      onChangeText={setNewStoreNitRaw}
                      keyboardType="numeric"
                      testID="input-store-nit"
                    />
                    <View style={styles.nitDvBox}>
                      <Text style={styles.nitDvLabel}>DV:</Text>
                      <Text style={styles.nitDvValue}>
                        {computedNitInfo.dv !== null ? computedNitInfo.dv : "—"}
                      </Text>
                    </View>
                  </View>
                  {computedNitInfo.cleanNit.length >= 5 ? (
                    <Text
                      style={[
                        styles.nitHelperText,
                        computedNitInfo.isValid ? styles.textSuccess : styles.textError
                      ]}
                    >
                      {computedNitInfo.isValid
                        ? `✓ NIT válido con Dígito de Verificación ${computedNitInfo.dv} (Módulo 11 DIAN)`
                        : "⚠ Ingrese solo dígitos numéricos"}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Correo del Propietario (Dueño) *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="dueno@tienda.co"
                    value={newStoreEmail}
                    onChangeText={setNewStoreEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    testID="input-store-email"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Teléfono Móvil (WhatsApp Notificaciones)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="+57 310 123 4567"
                    value={newStorePhone}
                    onChangeText={setNewStorePhone}
                    keyboardType="phone-pad"
                    testID="input-store-phone"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Plan SaaS *</Text>
                  <View style={styles.planSelectorRow}>
                    {(["BASICO", "NEGOCIO", "PRO"] as const).map((plan) => (
                      <TouchableOpacity
                        key={plan}
                        style={[styles.planOptionBtn, newStorePlan === plan && styles.planOptionBtnActive]}
                        onPress={() => setNewStorePlan(plan)}
                        testID={`btn-select-plan-${plan}`}
                      >
                        <Text
                          style={[
                            styles.planOptionText,
                            newStorePlan === plan && styles.planOptionTextActive
                          ]}
                        >
                          {plan === "BASICO" ? "Básico (1 Caja)" : plan === "NEGOCIO" ? "Negocio (3 Cajas)" : "Pro (10 Cajas)"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowCreateModal(false)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={handleCreateTenant}
                    disabled={isSubmitting}
                    testID="btn-submit-create-tenant"
                  >
                    <Text style={styles.submitBtnText}>
                      {isSubmitting ? "Orquestando Saga..." : "Crear Tienda"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EMISIÓN DE LICENCIA EDICIÓN LOCAL                                */}
      {/* ========================================================================= */}
      {showLicenseModal && (
        <View style={styles.modalBackdrop} testID="modal-issue-license">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Emitir Serial Edición Local</Text>
              <TouchableOpacity onPress={() => setShowLicenseModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {issuedSerialResult ? (
              <View style={styles.successResultBox} testID="serial-issued-success-box">
                <Key size={28} color="#0f766e" />
                <Text style={styles.resultTitle}>Serial Generado con Éxito</Text>
                <Text style={styles.resultText}>
                  Entregue este serial al comerciante para activar su caja offline sin internet:
                </Text>
                <View style={styles.serialBox}>
                  <Text style={styles.serialText}>{issuedSerialResult}</Text>
                </View>
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => setShowLicenseModal(false)}
                >
                  <Text style={styles.actionBtnPrimaryText}>Listo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formBody}>
                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>ID de Tienda (Opcional si es standalone)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="tenant-uuid o dejar vacío"
                    value={licenseTenantId}
                    onChangeText={setLicenseTenantId}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Edición Local</Text>
                  <View style={styles.planSelectorRow}>
                    {(["LOCAL_ESSENTIAL", "LOCAL_PLUS", "LOCAL_PRO"] as const).map((ed) => (
                      <TouchableOpacity
                        key={ed}
                        style={[styles.planOptionBtn, licenseEdition === ed && styles.planOptionBtnActive]}
                        onPress={() => setLicenseEdition(ed)}
                      >
                        <Text
                          style={[
                            styles.planOptionText,
                            licenseEdition === ed && styles.planOptionTextActive
                          ]}
                        >
                          {ed.replace("LOCAL_", "")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Cajas Permitidas</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="1"
                    value={licenseTerminals}
                    onChangeText={setLicenseTerminals}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowLicenseModal(false)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={handleIssueLicense}
                    disabled={isSubmitting}
                    testID="btn-submit-issue-license"
                  >
                    <Text style={styles.submitBtnText}>
                      {isSubmitting ? "Generando..." : "Emitir Serial"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ACCESO DE SOPORTE JIT (30 MIN)                                   */}
      {/* ========================================================================= */}
      {showJitModal && (
        <View style={styles.modalBackdrop} testID="modal-jit-support">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Acceso de Soporte JIT (30 Minutos)</Text>
              <TouchableOpacity onPress={() => setShowJitModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {jitSessionResult ? (
              <View style={styles.successResultBox} testID="jit-success-box">
                <Check size={28} color="#0284c7" />
                <Text style={styles.resultTitle}>Sesión JIT Activa</Text>
                <Text style={styles.resultText}>
                  ID Sesión: {jitSessionResult.sessionId}
                </Text>
                <Text style={styles.resultText}>
                  Expira en 30 minutos. Registro guardado en auditoría inmutable (SIC & Habeas Data).
                </Text>
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => setShowJitModal(false)}
                >
                  <Text style={styles.actionBtnPrimaryText}>Continuar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.formBody}>
                <Text style={styles.modalHelpText}>
                  Se generará una sesión temporal con privilegios de solo lectura sobre la tienda seleccionada
                  ({selectedTenantId?.slice(0, 8)}...). Toda consulta será auditada permanentemente.
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Motivo del Acceso de Soporte *</Text>
                  <TextInput
                    style={[styles.inputField, { height: 80 }]}
                    placeholder="Ej. Incidente de sincronización de catálogo ticket #4812"
                    value={jitReason}
                    onChangeText={setJitReason}
                    multiline
                    testID="input-jit-reason"
                  />
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowJitModal(false)}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: "#0284c7" }]}
                    onPress={handleRequestJit}
                    disabled={isSubmitting}
                    testID="btn-submit-jit-session"
                  >
                    <Text style={styles.submitBtnText}>
                      {isSubmitting ? "Autorizando..." : "Iniciar Sesión JIT"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: PRÓRROGA DE GRACIA (+7 DÍAS)                                     */}
      {/* ========================================================================= */}
      {showGraceModal && (
        <View style={styles.modalBackdrop} testID="modal-grace-extension">
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conceder Prórroga de Gracia (+7 Días)</Text>
              <TouchableOpacity onPress={() => setShowGraceModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.formBody}>
              <Text style={styles.modalHelpText}>
                Otorga 7 días adicionales antes de pasar a modo solo lectura o suspensión.
                Límite legal del sistema: máximo 2 prórrogas por año calendario por tienda.
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Motivo Justificado *</Text>
                <TextInput
                  style={[styles.inputField, { height: 70 }]}
                  placeholder="Ej. Comerciante reporta retraso bancario de consignación Nequi"
                  value={graceReason}
                  onChangeText={setGraceReason}
                  multiline
                  testID="input-grace-reason"
                />
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowGraceModal(false)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: "#d97706" }]}
                  onPress={handleGrantGrace}
                  disabled={isSubmitting}
                  testID="btn-submit-grace-extension"
                >
                  <Text style={styles.submitBtnText}>
                    {isSubmitting ? "Registrando..." : "Conceder +7 Días"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f8fafc"
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 12
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a"
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    maxWidth: 600
  },
  topActionsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap"
  },
  actionBtnPrimary: {
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  actionBtnPrimaryText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13
  },
  actionBtnSecondary: {
    backgroundColor: "#ccfbf1",
    borderWidth: 1,
    borderColor: "#99f6e4",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  actionBtnSecondaryText: {
    color: "#0f766e",
    fontWeight: "600",
    fontSize: 13
  },
  actionBtnOutline: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  actionBtnOutlineText: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 13
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1
  },
  bannerSuccess: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0"
  },
  bannerError: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1
  },
  textSuccess: {
    color: "#15803d"
  },
  textError: {
    color: "#b91c1c"
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
    flexWrap: "wrap"
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0"
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  metricValueLarge: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginVertical: 4
  },
  metricSub: {
    fontSize: 11,
    color: "#94a3b8"
  },
  directorySection: {
    marginBottom: 24
  },
  directoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 12
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2
  },
  filterControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap"
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    minWidth: 220
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0f172a",
    padding: 0
  },
  filterTabs: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    padding: 3,
    borderRadius: 8,
    gap: 2
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6
  },
  filterChipActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 }
  },
  filterChipText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500"
  },
  filterChipTextActive: {
    color: "#0f172a",
    fontWeight: "600"
  },
  tableCard: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden"
  },
  emptyState: {
    padding: 30,
    alignItems: "center"
  },
  emptyStateText: {
    color: "#94a3b8",
    fontSize: 13
  },
  tenantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    flexWrap: "wrap",
    gap: 10
  },
  tenantInfoCol: {
    flex: 1,
    minWidth: 250
  },
  tenantTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  tenantName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a"
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700"
  },
  badgeGreen: { backgroundColor: "#dcfce7" },
  textGreen: { color: "#15803d" },
  badgeBlue: { backgroundColor: "#e0f2fe" },
  textBlue: { color: "#0369a1" },
  badgeOrange: { backgroundColor: "#ffedd5" },
  textOrange: { color: "#c2410c" },
  badgeRed: { backgroundColor: "#fee2e2" },
  textRed: { color: "#b91c1c" },
  planBadge: {
    backgroundColor: "#f3e8ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#7e22ce"
  },
  tenantMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4
  },
  tenantActionsCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  btnJit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#e0f2fe",
    borderRadius: 6
  },
  btnJitText: {
    fontSize: 12,
    color: "#0369a1",
    fontWeight: "600"
  },
  btnGrace: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#fef3c7",
    borderRadius: 6
  },
  btnGraceText: {
    fontSize: 12,
    color: "#b45309",
    fontWeight: "600"
  },
  btnSuspend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#fee2e2",
    borderRadius: 6
  },
  btnSuspendText: {
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: "600"
  },
  btnReactivate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#dcfce7",
    borderRadius: 6
  },
  btnReactivateText: {
    fontSize: 12,
    color: "#15803d",
    fontWeight: "600"
  },
  licensesSection: {
    marginBottom: 40
  },
  licenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  licenseSerial: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "monospace",
    color: "#0f172a"
  },
  licenseMeta: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2
  },
  modalBackdrop: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 999
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    overflow: "hidden"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0"
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a"
  },
  formBody: {
    padding: 20
  },
  formGroup: {
    marginBottom: 14
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6
  },
  inputField: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#0f172a"
  },
  nitInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  nitDvBox: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 48
  },
  nitDvLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b"
  },
  nitDvValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a"
  },
  nitHelperText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "500"
  },
  planSelectorRow: {
    flexDirection: "row",
    gap: 8
  },
  planOptionBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    backgroundColor: "#ffffff"
  },
  planOptionBtnActive: {
    borderColor: "#0f766e",
    backgroundColor: "#f0fdfa"
  },
  planOptionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b"
  },
  planOptionTextActive: {
    color: "#0f766e"
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  cancelBtnText: {
    color: "#64748b",
    fontWeight: "600",
    fontSize: 13
  },
  submitBtn: {
    backgroundColor: "#0f766e",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8
  },
  submitBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13
  },
  successResultBox: {
    padding: 24,
    alignItems: "center"
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 10,
    marginBottom: 6
  },
  resultText: {
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    marginBottom: 4
  },
  tokenBox: {
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 8,
    marginVertical: 16,
    width: "100%",
    alignItems: "center"
  },
  tokenLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    marginBottom: 4
  },
  tokenValue: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "monospace",
    color: "#0f766e"
  },
  serialBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 2,
    borderColor: "#0f766e",
    borderRadius: 8,
    padding: 12,
    marginVertical: 16,
    width: "100%",
    alignItems: "center"
  },
  serialText: {
    fontSize: 14,
    fontWeight: "800",
    fontFamily: "monospace",
    color: "#0f766e",
    letterSpacing: 1
  },
  modalHelpText: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 16,
    marginBottom: 14
  }
});
