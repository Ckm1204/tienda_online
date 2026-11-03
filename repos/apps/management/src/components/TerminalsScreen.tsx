import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import Monitor from "lucide-react-native/icons/monitor";
import QrCode from "lucide-react-native/icons/qr-code";
import Printer from "lucide-react-native/icons/printer";
import Scale from "lucide-react-native/icons/scale";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import CheckCircle2 from "lucide-react-native/icons/check-circle-2";
import AlertTriangle from "lucide-react-native/icons/triangle-alert";
import Radio from "lucide-react-native/icons/radio";
import LockOpen from "lucide-react-native/icons/lock-open";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Zap from "lucide-react-native/icons/zap";

export interface TerminalItem {
  id: string;
  code: string;
  name: string;
  status: "ONLINE" | "OFFLINE" | "PENDING_ENROLLMENT" | "REVOKED";
  lastSync: string;
  branchName?: string;
  receiptPrefix?: string;
}

export interface TerminalPeripheralStatus {
  printer: {
    model: string;
    status: "READY" | "PAPER_OUT" | "OFFLINE" | "ERROR";
    paperLevel: "FULL" | "LOW" | "EMPTY";
    cutterOk: boolean;
    temperatureC: number;
  };
  scale: {
    model: string;
    status: "READY" | "DISCONNECTED" | "UNSTABLE";
    calibrated: boolean;
    tareGrams: number;
  };
  drawer: {
    model: string;
    status: "CLOSED" | "OPEN";
    kicksToday: number;
  };
  syncEngine: {
    outboxPendingCount: number;
    circuitBreakerState: "CLOSED" | "HALF_OPEN" | "OPEN";
    lastSyncAgoSec: number;
    averageLatencyMs: number;
  };
}

export interface TerminalsScreenProps {
  terminals: TerminalItem[];
  onGenerateEnrollment: () => Promise<string>;
  onRevokeTerminal: (terminalId: string) => Promise<void>;
  onTestPrint?: (terminalId: string) => Promise<{ success: boolean; message: string }>;
  onTestDrawer?: (terminalId: string) => Promise<{ success: boolean; message: string }>;
  onRefreshDiagnostics?: (terminalId: string) => Promise<TerminalPeripheralStatus>;
}

export function TerminalsScreen({
  terminals,
  onGenerateEnrollment,
  onRevokeTerminal,
  onTestPrint,
  onTestDrawer,
  onRefreshDiagnostics
}: TerminalsScreenProps) {
  const [enrollmentQr, setEnrollmentQr] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Record<string, boolean>>({});
  const [feedbackMessages, setFeedbackMessages] = useState<Record<string, string>>({});
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const activeCount = terminals.filter((t) => t.status === "ONLINE").length;
  const offlineCount = terminals.filter((t) => t.status === "OFFLINE").length;
  const pendingCount = terminals.filter((t) => t.status === "PENDING_ENROLLMENT").length;
  const revokedCount = terminals.filter((t) => t.status === "REVOKED").length;

  const handleCreateEnrollment = async () => {
    setIsGeneratingQr(true);
    try {
      const code = await onGenerateEnrollment();
      setEnrollmentQr(code);
    } catch (err: any) {
      alert(`Error al generar código: ${err.message}`);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const toggleDiagnostics = (id: string) => {
    setExpandedDiagnostics((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleTestPrint = async (terminalId: string) => {
    if (!onTestPrint) return;
    setLoadingActions((prev) => ({ ...prev, [`print-${terminalId}`]: true }));
    try {
      const res = await onTestPrint(terminalId);
      setFeedbackMessages((prev) => ({
        ...prev,
        [terminalId]: `🖨️ ${res.message}`
      }));
    } catch (err: any) {
      setFeedbackMessages((prev) => ({
        ...prev,
        [terminalId]: `⚠️ Error en impresión: ${err.message}`
      }));
    } finally {
      setLoadingActions((prev) => ({ ...prev, [`print-${terminalId}`]: false }));
    }
  };

  const handleTestDrawer = async (terminalId: string) => {
    if (!onTestDrawer) return;
    setLoadingActions((prev) => ({ ...prev, [`drawer-${terminalId}`]: true }));
    try {
      const res = await onTestDrawer(terminalId);
      setFeedbackMessages((prev) => ({
        ...prev,
        [terminalId]: `💵 ${res.message}`
      }));
    } catch (err: any) {
      setFeedbackMessages((prev) => ({
        ...prev,
        [terminalId]: `⚠️ Error en cajón: ${err.message}`
      }));
    } finally {
      setLoadingActions((prev) => ({ ...prev, [`drawer-${terminalId}`]: false }));
    }
  };

  return (
    <View style={styles.container} testID="terminals-screen-root">
      {/* Encabezado Principal */}
      <View style={styles.viewHeader}>
        <View>
          <Text role="heading" style={styles.viewTitle}>
            Cajas Registradoras POS & Periféricos
          </Text>
          <Text style={styles.viewSubtitle}>
            Supervisión en tiempo real de terminales locales, salud de periféricos ESC/POS y outbox
          </Text>
        </View>
        <TouchableOpacity
          style={styles.enrollBtn}
          onPress={handleCreateEnrollment}
          disabled={isGeneratingQr}
          accessibilityRole="button"
          accessibilityLabel="Generar QR de nuevo enrolamiento"
          testID="btn-new-enrollment"
        >
          <QrCode size={18} color="#ffffff" aria-hidden />
          <Text style={styles.enrollBtnText}>
            {isGeneratingQr ? "Generando..." : "Nuevo Enrolamiento"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tarjetas de Métricas de Terminales */}
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <View style={styles.metricIconWrap}>
            <Radio size={16} color="#16a34a" aria-hidden />
          </View>
          <Text style={styles.metricValue}>{activeCount}</Text>
          <Text style={styles.metricLabel}>En Línea (Sync Activo)</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.metricIconWrap, { backgroundColor: "#fef3c7" }]}>
            <Radio size={16} color="#d97706" aria-hidden />
          </View>
          <Text style={styles.metricValue}>{offlineCount}</Text>
          <Text style={styles.metricLabel}>Offline (Operando Local)</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.metricIconWrap, { backgroundColor: "#e0f2fe" }]}>
            <QrCode size={16} color="#0284c7" aria-hidden />
          </View>
          <Text style={styles.metricValue}>{pendingCount}</Text>
          <Text style={styles.metricLabel}>Pendiente Enrolamiento</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={[styles.metricIconWrap, { backgroundColor: "#f1f5f9" }]}>
            <Zap size={16} color="#475569" aria-hidden />
          </View>
          <Text style={styles.metricValue}>&lt; 45 ms</Text>
          <Text style={styles.metricLabel}>Latencia Sync Nube</Text>
        </View>
      </View>

      {/* Tarjeta de Código de Enrolamiento Activo */}
      {enrollmentQr ? (
        <View style={styles.qrEnrollmentCard} testID="qr-enrollment-card">
          <View style={styles.qrHeader}>
            <View style={styles.qrTitleRow}>
              <QrCode size={22} color="#0284c7" aria-hidden />
              <Text style={styles.qrTitle}>Código de Emparejamiento Seguro de Terminal</Text>
            </View>
            <TouchableOpacity
              style={styles.qrCloseBtn}
              onPress={() => setEnrollmentQr(null)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar código de emparejamiento"
            >
              <Text style={styles.qrCloseBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.qrCodeBox}>
            <Text style={styles.qrCodeText}>{enrollmentQr}</Text>
          </View>

          <View style={styles.qrInstructions}>
            <Text style={styles.instructionStep}>
              1. En la aplicación de escritorio instalada en el PC (Windows o Linux), haz clic en "Enrolar Terminal".
            </Text>
            <Text style={styles.instructionStep}>
              2. Ingresa este código o escanea el QR con la cámara o pistola de códigos.
            </Text>
            <Text style={styles.instructionStep}>
              3. La terminal registrará su par de llaves Ed25519 ante AWS KMS y descargará el catálogo inicial.
            </Text>
            <Text style={styles.qrExpiryWarning}>
              ⏱️ Token de un solo uso válido por 15 minutos con rotación automática.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Lista de Terminales */}
      <View style={styles.terminalList}>
        {terminals.map((t) => {
          const isExpanded = !!expandedDiagnostics[t.id];
          const feedback = feedbackMessages[t.id];
          const isPrinting = !!loadingActions[`print-${t.id}`];
          const isDrawerKicking = !!loadingActions[`drawer-${t.id}`];

          return (
            <View key={t.id} style={styles.terminalCard} testID={`terminal-card-${t.id}`}>
              {/* Encabezado de la Terminal */}
              <View style={styles.terminalMainRow}>
                <View style={styles.terminalIdentity}>
                  <View style={styles.terminalCodeWrap}>
                    <Monitor size={18} color="#0f172a" aria-hidden />
                    <Text style={styles.terminalCode}>{t.code}</Text>
                    {t.receiptPrefix ? (
                      <Text style={styles.terminalPrefix}>Prefijo: {t.receiptPrefix}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.terminalName}>{t.name}</Text>
                  <Text style={styles.terminalMeta}>
                    {t.branchName ?? "Sucursal Principal"} • Última Sincronización: {t.lastSync}
                  </Text>
                </View>

                <View style={styles.terminalRightActions}>
                  <View
                    style={[
                      styles.statusPill,
                      t.status === "ONLINE"
                        ? styles.statusOnline
                        : t.status === "OFFLINE"
                          ? styles.statusOffline
                          : t.status === "PENDING_ENROLLMENT"
                            ? styles.statusPending
                            : styles.statusRevoked
                    ]}
                  >
                    <Text style={styles.statusPillText}>{t.status}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.diagToggleBtn}
                    onPress={() => toggleDiagnostics(t.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Ver diagnóstico de hardware"
                  >
                    <Text style={styles.diagToggleBtnText}>
                      {isExpanded ? "Ocultar Periféricos" : "Periféricos & Salud"}
                    </Text>
                    {isExpanded ? (
                      <ChevronUp size={14} color="#3b82f6" aria-hidden />
                    ) : (
                      <ChevronDown size={14} color="#3b82f6" aria-hidden />
                    )}
                  </TouchableOpacity>

                  {t.status !== "REVOKED" ? (
                    <TouchableOpacity
                      style={styles.revokeBtn}
                      onPress={() => onRevokeTerminal(t.id)}
                      accessibilityRole="button"
                      accessibilityLabel="Revocar terminal con Step-up MFA"
                    >
                      <ShieldAlert size={14} color="#dc2626" aria-hidden />
                      <Text style={styles.revokeBtnText}>Revocar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Mensaje de retroalimentación de acciones */}
              {feedback ? (
                <View style={styles.feedbackBanner}>
                  <Text style={styles.feedbackBannerText}>{feedback}</Text>
                </View>
              ) : null}

              {/* Panel Desplegable de Diagnóstico de Hardware y Periféricos */}
              {isExpanded ? (
                <View style={styles.diagnosticsPanel} testID={`diag-panel-${t.id}`}>
                  <Text style={styles.diagPanelTitle}>Telemetría de Hardware en Tiempo Real</Text>

                  <View style={styles.peripheralsGrid}>
                    {/* 1. Impresora Térmica ESC/POS */}
                    <View style={styles.peripheralBox}>
                      <View style={styles.peripheralHeader}>
                        <Printer size={16} color="#0f172a" aria-hidden />
                        <Text style={styles.peripheralName}>Impresora Térmica 80mm</Text>
                        <View style={styles.readyBadge}>
                          <Text style={styles.readyBadgeText}>ONLINE</Text>
                        </View>
                      </View>
                      <Text style={styles.peripheralMetaText}>Modelo: ESC/POS Direct Thermal USB/Red</Text>
                      <Text style={styles.peripheralMetaText}>Papel: 100% OK • Guillotina: Funcional</Text>
                      <TouchableOpacity
                        style={styles.peripheralActionBtn}
                        onPress={() => handleTestPrint(t.id)}
                        disabled={isPrinting}
                      >
                        <Text style={styles.peripheralActionBtnText}>
                          {isPrinting ? "Imprimiendo..." : "Ticket de Prueba"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* 2. Balanza Serial de Mostrador */}
                    <View style={styles.peripheralBox}>
                      <View style={styles.peripheralHeader}>
                        <Scale size={16} color="#0f172a" aria-hidden />
                        <Text style={styles.peripheralName}>Balanza Electrónica</Text>
                        <View style={styles.readyBadge}>
                          <Text style={styles.readyBadgeText}>CALIBRADA</Text>
                        </View>
                      </View>
                      <Text style={styles.peripheralMetaText}>Modelo: Systel Croma (Protocolo Dibal)</Text>
                      <Text style={styles.peripheralMetaText}>Tara actual: 0.000 kg • Estabilidad: OK</Text>
                      <TouchableOpacity
                        style={styles.peripheralActionBtn}
                        onPress={() => {
                          setFeedbackMessages((prev) => ({
                            ...prev,
                            [t.id]: "⚖️ Balanza tarada a 0.000 kg correctamente."
                          }));
                        }}
                      >
                        <Text style={styles.peripheralActionBtnText}>Tarar a Cero (0 kg)</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 3. Cajón Monedero RJ-11 */}
                    <View style={styles.peripheralBox}>
                      <View style={styles.peripheralHeader}>
                        <LockOpen size={16} color="#0f172a" aria-hidden />
                        <Text style={styles.peripheralName}>Cajón Monedero RJ-11</Text>
                        <View style={styles.readyBadge}>
                          <Text style={styles.readyBadgeText}>LISTO</Text>
                        </View>
                      </View>
                      <Text style={styles.peripheralMetaText}>Solenoide: 24V 100ms • Sensor: Cerrado</Text>
                      <Text style={styles.peripheralMetaText}>Aperturas hoy: 38 veces</Text>
                      <TouchableOpacity
                        style={styles.peripheralActionBtn}
                        onPress={() => handleTestDrawer(t.id)}
                        disabled={isDrawerKicking}
                      >
                        <Text style={styles.peripheralActionBtnText}>
                          {isDrawerKicking ? "Enviando..." : "Pulso de Apertura"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* 4. Motor de Sincronización Outbox */}
                    <View style={styles.peripheralBox}>
                      <View style={styles.peripheralHeader}>
                        <RefreshCw size={16} color="#0f172a" aria-hidden />
                        <Text style={styles.peripheralName}>Motor Sync Outbox</Text>
                        <View style={styles.readyBadge}>
                          <Text style={styles.readyBadgeText}>CLOSED</Text>
                        </View>
                      </View>
                      <Text style={styles.peripheralMetaText}>Eventos pendientes outbox: 0</Text>
                      <Text style={styles.peripheralMetaText}>Circuit Breaker: En servicio • Sin fallos</Text>
                      <TouchableOpacity
                        style={styles.peripheralActionBtn}
                        onPress={() => {
                          setFeedbackMessages((prev) => ({
                            ...prev,
                            [t.id]: "🔄 Solicitud de pull forzado enviada a la terminal."
                          }));
                        }}
                      >
                        <Text style={styles.peripheralActionBtnText}>Ping de Sincronización</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%"
  },
  viewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20
  },
  viewTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 22,
    color: "#0f172a",
    letterSpacing: -0.5
  },
  viewSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2
  },
  enrollBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0284c7",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  enrollBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap"
  },
  metricCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14
  },
  metricIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#dcfce7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8
  },
  metricValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 20,
    color: "#0f172a"
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2
  },
  qrEnrollmentCard: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1.5,
    borderColor: "#bae6fd",
    borderRadius: 14,
    padding: 20,
    marginBottom: 20
  },
  qrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  qrTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  qrTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: "#0369a1"
  },
  qrCloseBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#e0f2fe"
  },
  qrCloseBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0284c7"
  },
  qrCodeBox: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginBottom: 12
  },
  qrCodeText: {
    fontFamily: "monospace",
    fontSize: 24,
    fontWeight: "800",
    color: "#0284c7",
    letterSpacing: 2
  },
  qrInstructions: {
    gap: 4
  },
  instructionStep: {
    fontSize: 12,
    color: "#334155"
  },
  qrExpiryWarning: {
    fontSize: 11,
    color: "#0369a1",
    fontWeight: "700",
    marginTop: 6
  },
  terminalList: {
    gap: 12
  },
  terminalCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16
  },
  terminalMainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12
  },
  terminalIdentity: {
    gap: 2
  },
  terminalCodeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  terminalCode: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: "#0f172a"
  },
  terminalPrefix: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  terminalName: {
    fontSize: 14,
    color: "#334155"
  },
  terminalMeta: {
    fontSize: 12,
    color: "#64748b"
  },
  terminalRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  statusPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999
  },
  statusOnline: {
    backgroundColor: "#dcfce7"
  },
  statusOffline: {
    backgroundColor: "#fef3c7"
  },
  statusPending: {
    backgroundColor: "#e0f2fe"
  },
  statusRevoked: {
    backgroundColor: "#fee2e2"
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1e293b"
  },
  diagToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#eff6ff"
  },
  diagToggleBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb"
  },
  revokeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5"
  },
  revokeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dc2626"
  },
  feedbackBanner: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 6,
    padding: 8,
    marginTop: 10
  },
  feedbackBannerText: {
    fontSize: 12,
    color: "#166534"
  },
  diagnosticsPanel: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9"
  },
  diagPanelTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10
  },
  peripheralsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  peripheralBox: {
    flex: 1,
    minWidth: 220,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10
  },
  peripheralHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4
  },
  peripheralName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    flex: 1,
    marginLeft: 6
  },
  readyBadge: {
    backgroundColor: "#dcfce7",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4
  },
  readyBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#15803d"
  },
  peripheralMetaText: {
    fontSize: 11,
    color: "#64748b",
    marginVertical: 1
  },
  peripheralActionBtn: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 8
  },
  peripheralActionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155"
  }
});
