import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import Download from "lucide-react-native/icons/download";
import Printer from "lucide-react-native/icons/printer";
import AlertTriangle from "lucide-react-native/icons/triangle-alert";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Scale from "lucide-react-native/icons/scale";

export interface FiscalDaySummary {
  date: string;
  initialReceipt: string;
  finalReceipt: string;
  ticketsCount: number;
  grossTotalCents: number;
  returnsCents: number;
  netTotalCents: number;
  taxBreakdown: {
    gravado19Cents: number;
    iva19Cents: number;
    gravado5Cents: number;
    iva5Cents: number;
    exentoCents: number;
    excluidoCents: number;
    inc8Cents: number;
  };
}

export interface DianResolutionInfo {
  resolutionNumber: string;
  prefix: string;
  rangeFrom: number;
  rangeTo: number;
  currentNumber: number;
  validTo: string;
  daysRemaining: number;
  alertLevel: "NORMAL" | "INFO" | "WARNING" | "CRITICAL";
}

export interface FiscalReportsScreenProps {
  yearMonth: string;
  accumulatedYearCents: number;
  tope3500UvtCents: number;
  uvtAlertLevel: "NORMAL" | "PREVENCION" | "SUPERADO";
  days: FiscalDaySummary[];
  dianResolution: DianResolutionInfo;
  isLey2300WindowOpen: boolean;
  onDownloadCsv: () => void;
  onViewThermalReportZ: () => void;
  onExportAccountingCsv?: () => void;
  onRunDianTestSet?: () => void;
  onToggleFiscalMode?: () => void;
  fiscalMode?: "NONE" | "DIAN_POS";
}

function formatCOP(cents: number): string {
  return "$" + (cents / 100).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " COP";
}

export function FiscalReportsScreen({
  yearMonth,
  accumulatedYearCents,
  tope3500UvtCents,
  uvtAlertLevel,
  days,
  dianResolution,
  isLey2300WindowOpen,
  onDownloadCsv,
  onViewThermalReportZ,
  onExportAccountingCsv,
  onRunDianTestSet,
  onToggleFiscalMode,
  fiscalMode = "NONE"
}: FiscalReportsScreenProps) {
  const [activeTab, setActiveTab] = useState<"libro" | "dian" | "ley2300">("libro");

  // Cálculo de porcentaje UVT en enteros (basis points)
  const consumptionBps = Math.floor((accumulatedYearCents * 10000) / (tope3500UvtCents || 1));
  const consumptionPercent = (consumptionBps / 100).toFixed(2);

  const monthGrossCents = days.reduce((sum, d) => sum + d.grossTotalCents, 0);
  const monthNetCents = days.reduce((sum, d) => sum + d.netTotalCents, 0);
  const monthTickets = days.reduce((sum, d) => sum + d.ticketsCount, 0);

  const foliosUsed = dianResolution.currentNumber - dianResolution.rangeFrom + 1;
  const totalFolios = dianResolution.rangeTo - dianResolution.rangeFrom + 1;
  const remainingFolios = Math.max(0, totalFolios - foliosUsed);

  return (
    <View style={styles.container} testID="fiscal-reports-screen">
      {/* Encabezado */}
      <View style={styles.header}>
        <View>
          <Text role="heading" style={styles.title}>
            Gestión Fiscal & Normativa Colombiana
          </Text>
          <Text style={styles.subtitle}>
            Libro Fiscal (Art. 616 E.T.), Resoluciones DIAN y Contacto Ley 2300
          </Text>
        </View>

        <View style={styles.actionButtons}>
          {onExportAccountingCsv && (
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={onExportAccountingCsv}
              accessibilityRole="button"
              accessibilityLabel="Exportar Asiento Contable PUC"
              testID="btn-export-accounting-csv"
            >
              <Download size={16} color="#24734e" aria-hidden />
              <Text style={styles.btnSecondaryText}>Asiento PUC (CSV)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={onViewThermalReportZ}
            accessibilityRole="button"
            accessibilityLabel="Ver tiquete térmico Reporte Z"
            testID="btn-thermal-report-z"
          >
            <Printer size={16} color="#24734e" aria-hidden />
            <Text style={styles.btnSecondaryText}>Tiquete Reporte Z</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={onDownloadCsv}
            accessibilityRole="button"
            accessibilityLabel="Descargar CSV para DIAN"
            testID="btn-download-csv"
          >
            <Download size={16} color="#ffffff" aria-hidden />
            <Text style={styles.btnPrimaryText}>Descargar CSV DIAN</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Selector de Pestañas Internas */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "libro" && styles.tabBtnActive]}
          onPress={() => setActiveTab("libro")}
          testID="tab-libro-fiscal"
        >
          <Text style={[styles.tabBtnText, activeTab === "libro" && styles.tabBtnTextActive]}>
            📖 Libro Fiscal (Art. 616 E.T.)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "dian" && styles.tabBtnActive]}
          onPress={() => setActiveTab("dian")}
          testID="tab-dian-resolution"
        >
          <Text style={[styles.tabBtnText, activeTab === "dian" && styles.tabBtnTextActive]}>
            🧾 Resoluciones DIAN ({remainingFolios.toLocaleString()} folios)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "ley2300" && styles.tabBtnActive]}
          onPress={() => setActiveTab("ley2300")}
          testID="tab-ley-2300"
        >
          <Text style={[styles.tabBtnText, activeTab === "ley2300" && styles.tabBtnTextActive]}>
            ⚖️ Ley 2300 ({isLey2300WindowOpen ? "Horario Hábil" : "Inhábil"})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "libro" && (
        <ScrollView style={styles.contentScroll}>
          {/* Termómetro de 3.500 UVT */}
          <View style={styles.card}>
            <View style={styles.gaugeHeader}>
              <View style={styles.gaugeTitleGroup}>
                <Scale size={18} color="#24734e" aria-hidden />
                <Text style={styles.cardTitle}>Tope Anual 3.500 UVT (Régimen Simplificado / No Responsable)</Text>
              </View>
              <View
                style={[
                  styles.badge,
                  uvtAlertLevel === "NORMAL"
                    ? styles.badgeNormal
                    : uvtAlertLevel === "PREVENCION"
                    ? styles.badgeWarning
                    : styles.badgeDanger
                ]}
                testID="uvt-alert-badge"
              >
                <Text
                  style={[
                    styles.badgeText,
                    uvtAlertLevel === "NORMAL"
                      ? styles.badgeTextNormal
                      : uvtAlertLevel === "PREVENCION"
                      ? styles.badgeTextWarning
                      : styles.badgeTextDanger
                  ]}
                >
                  {uvtAlertLevel} ({consumptionPercent}%)
                </Text>
              </View>
            </View>

            {/* Barra de progreso */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(100, Math.max(1, Number(consumptionPercent)))}%` },
                  uvtAlertLevel === "NORMAL"
                    ? { backgroundColor: "#15803d" }
                    : uvtAlertLevel === "PREVENCION"
                    ? { backgroundColor: "#d97706" }
                    : { backgroundColor: "#dc2626" }
                ]}
              />
            </View>

            <View style={styles.gaugeDetails}>
              <Text style={styles.gaugeDetailText}>
                Acumulado Año: <Text style={styles.boldText}>{formatCOP(accumulatedYearCents)}</Text>
              </Text>
              <Text style={styles.gaugeDetailText}>
                Tope 3.500 UVT: <Text style={styles.boldText}>{formatCOP(tope3500UvtCents)}</Text>
              </Text>
            </View>
          </View>

          {/* Resumen del Mes */}
          <View style={styles.summaryGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Ingresos Brutos ({yearMonth})</Text>
              <Text style={styles.metricValue}>{formatCOP(monthGrossCents)}</Text>
              <Text style={styles.metricSub}>{monthTickets} tickets emitidos</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Ingresos Netos ({yearMonth})</Text>
              <Text style={styles.metricValueGreen}>{formatCOP(monthNetCents)}</Text>
              <Text style={styles.metricSub}>Descontadas devoluciones</Text>
            </View>
          </View>

          {/* Tabla Diaria */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Movimiento Diario — Libro Fiscal</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1.2 }]}>Fecha</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Rango Comprobantes</Text>
              <Text style={[styles.th, { flex: 0.8, textAlign: "center" }]}>Tickets</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: "right" }]}>Venta Bruta</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: "right" }]}>Venta Neta</Text>
            </View>

            {days.length === 0 ? (
              <Text style={styles.emptyText}>No hay ventas registradas para este periodo.</Text>
            ) : (
              days.map((d, index) => (
                <View key={d.date} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]} testID={`fiscal-day-row-${d.date}`}>
                  <Text style={[styles.td, { flex: 1.2, fontWeight: "600" }]}>{d.date}</Text>
                  <Text style={[styles.td, { flex: 1.5, fontFamily: "monospace" }]}>
                    {d.initialReceipt || "N/A"} .. {d.finalReceipt || "N/A"}
                  </Text>
                  <Text style={[styles.td, { flex: 0.8, textAlign: "center" }]}>{d.ticketsCount}</Text>
                  <Text style={[styles.td, { flex: 1.5, textAlign: "right" }]}>{formatCOP(d.grossTotalCents)}</Text>
                  <Text style={[styles.td, { flex: 1.5, textAlign: "right", color: "#15803d", fontWeight: "600" }]}>
                    {formatCOP(d.netTotalCents)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === "dian" && (
        <ScrollView style={styles.contentScroll} testID="dian-resolutions-panel">
          <View style={styles.card}>
            <View style={styles.gaugeHeader}>
              <Text style={styles.cardTitle}>Resolución de Facturación / Documento Equivalente POS</Text>
              <View
                style={[
                  styles.badge,
                  dianResolution.alertLevel === "CRITICAL"
                    ? styles.badgeDanger
                    : dianResolution.alertLevel === "WARNING"
                    ? styles.badgeWarning
                    : styles.badgeNormal
                ]}
              >
                <Text style={styles.badgeText}>
                  {dianResolution.alertLevel === "CRITICAL"
                    ? "ALERTA CRÍTICA"
                    : dianResolution.alertLevel === "WARNING"
                    ? "ALERTA PREVENTIVA"
                    : "ACTIVA"}
                </Text>
              </View>
            </View>

            <View style={styles.dianGrid}>
              <View style={styles.dianField}>
                <Text style={styles.dianFieldLabel}>Resolución DIAN:</Text>
                <Text style={styles.dianFieldValue}>{dianResolution.resolutionNumber}</Text>
              </View>
              <View style={styles.dianField}>
                <Text style={styles.dianFieldLabel}>Prefijo Autorizado:</Text>
                <Text style={styles.dianFieldValue}>{dianResolution.prefix}</Text>
              </View>
              <View style={styles.dianField}>
                <Text style={styles.dianFieldLabel}>Rango Aprobado:</Text>
                <Text style={styles.dianFieldValue}>
                  {dianResolution.rangeFrom.toLocaleString()} a {dianResolution.rangeTo.toLocaleString()}
                </Text>
              </View>
              <View style={styles.dianField}>
                <Text style={styles.dianFieldLabel}>Folio Actual:</Text>
                <Text style={styles.dianFieldValueBold}>
                  {dianResolution.prefix}-{String(dianResolution.currentNumber).padStart(6, "0")}
                </Text>
              </View>
              <View style={styles.dianField}>
                <Text style={styles.dianFieldLabel}>Folios Restantes:</Text>
                <Text style={[styles.dianFieldValueBold, remainingFolios < 500 && { color: "#dc2626" }]}>
                  {remainingFolios.toLocaleString()} disponibles
                </Text>
              </View>
              <View style={styles.dianField}>
                <Text style={styles.dianFieldLabel}>Vigencia Autorizada:</Text>
                <Text style={styles.dianFieldValue}>
                  Hasta {dianResolution.validTo} ({dianResolution.daysRemaining} días restantes)
                </Text>
              </View>
            </View>

            <View style={styles.dianSecurityNotice}>
              <ShieldCheck size={18} color="#15803d" aria-hidden />
              <Text style={styles.dianSecurityText}>
                Clave técnica protegida en AWS Secrets Manager. Documentos archivados por 10 años en Amazon S3 con Object Lock (WORM).
              </Text>
            </View>

            <View style={styles.dianActionsCard}>
              <Text style={styles.cardSubtitle}>Habilitación Oficial & Activación en Vivo (HU-463 & HU-464)</Text>
              <View style={styles.dianActionsRow}>
                {onRunDianTestSet && (
                  <TouchableOpacity
                    style={styles.btnActionDian}
                    onPress={onRunDianTestSet}
                    accessibilityRole="button"
                    accessibilityLabel="Ejecutar set de pruebas DIAN"
                    testID="btn-run-dian-test-set"
                  >
                    <Text style={styles.btnActionDianText}>🚀 Set de Pruebas DIAN (10/10)</Text>
                  </TouchableOpacity>
                )}
                {onToggleFiscalMode && (
                  <TouchableOpacity
                    style={[
                      styles.btnActionFiscalMode,
                      fiscalMode === "DIAN_POS" ? styles.btnFiscalActive : styles.btnFiscalInactive
                    ]}
                    onPress={onToggleFiscalMode}
                    accessibilityRole="button"
                    accessibilityLabel="Conmutar modo fiscal DIAN"
                    testID="btn-toggle-fiscal-mode"
                  >
                    <Text style={styles.btnActionFiscalModeText}>
                      {fiscalMode === "DIAN_POS" ? "✓ Modo DIAN_POS Activo" : "Activar Modo DIAN_POS"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {activeTab === "ley2300" && (
        <ScrollView style={styles.contentScroll} testID="ley-2300-panel">
          <View style={styles.card}>
            <View style={styles.gaugeHeader}>
              <Text style={styles.cardTitle}>Canales de Cobranza y Cartera — Ley 2300 de 2023</Text>
              <View style={[styles.badge, isLey2300WindowOpen ? styles.badgeNormal : styles.badgeDanger]}>
                <Text style={[styles.badgeText, isLey2300WindowOpen ? styles.badgeTextNormal : styles.badgeTextDanger]}>
                  {isLey2300WindowOpen ? "HORARIO PERMITIDO" : "HORARIO NO HÁBIL"}
                </Text>
              </View>
            </View>

            <Text style={styles.ley2300Description}>
              La Ley 2300 de 2023 ("Dejen de Fregar") protege a los consumidores de cobranzas fuera de horario y regula el contacto telefónico, mensajes y visitas.
            </Text>

            <View style={styles.ley2300RulesList}>
              <View style={styles.leyRuleItem}>
                <Text style={styles.leyRuleBullet}>✓</Text>
                <Text style={styles.leyRuleText}>
                  <Text style={styles.boldText}>Lunes a Viernes:</Text> Contacto permitido únicamente de 07:00 a 19:00 hora local Colombia.
                </Text>
              </View>

              <View style={styles.leyRuleItem}>
                <Text style={styles.leyRuleBullet}>✓</Text>
                <Text style={styles.leyRuleText}>
                  <Text style={styles.boldText}>Sábados:</Text> Contacto permitido únicamente de 08:00 a 15:00 hora local Colombia.
                </Text>
              </View>

              <View style={styles.leyRuleItem}>
                <Text style={styles.leyRuleBullet}>✕</Text>
                <Text style={[styles.leyRuleText, { color: "#dc2626" }]}>
                  <Text style={styles.boldText}>Domingos y Festivos Oficiales:</Text> Prohibido todo contacto de cobranza las 24 horas del día.
                </Text>
              </View>

              <View style={styles.leyRuleItem}>
                <Text style={styles.leyRuleBullet}>🛡️</Text>
                <Text style={styles.leyRuleText}>
                  <Text style={styles.boldText}>Límite Semanal:</Text> Máximo 2 contactos semanales por deudor en todos los canales combinados.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#faf8f5"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 12
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#221c27"
  },
  subtitle: {
    fontSize: 13,
    color: "#69656c",
    marginTop: 2
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#24734e",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  btnPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600"
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#24734e",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  btnSecondaryText: {
    color: "#24734e",
    fontSize: 13,
    fontWeight: "600"
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e2db",
    paddingBottom: 8,
    marginBottom: 16
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  tabBtnActive: {
    backgroundColor: "rgba(36, 115, 78, 0.12)"
  },
  tabBtnText: {
    fontSize: 13,
    color: "#69656c",
    fontWeight: "500"
  },
  tabBtnTextActive: {
    color: "#24734e",
    fontWeight: "700"
  },
  contentScroll: {
    flex: 1
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e2db",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#221c27"
  },
  gaugeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  gaugeTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4
  },
  badgeNormal: {
    backgroundColor: "rgba(21, 128, 61, 0.12)"
  },
  badgeWarning: {
    backgroundColor: "rgba(217, 119, 6, 0.12)"
  },
  badgeDanger: {
    backgroundColor: "rgba(220, 38, 38, 0.12)"
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700"
  },
  badgeTextNormal: {
    color: "#15803d"
  },
  badgeTextWarning: {
    color: "#d97706"
  },
  badgeTextDanger: {
    color: "#dc2626"
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: "#e5e2db",
    borderRadius: 5,
    overflow: "hidden",
    marginVertical: 8
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 5
  },
  gaugeDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6
  },
  gaugeDetailText: {
    fontSize: 12,
    color: "#69656c"
  },
  boldText: {
    fontWeight: "700",
    color: "#221c27"
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e2db"
  },
  metricLabel: {
    fontSize: 12,
    color: "#69656c"
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#221c27",
    marginVertical: 4
  },
  metricValueGreen: {
    fontSize: 18,
    fontWeight: "700",
    color: "#15803d",
    marginVertical: 4
  },
  metricSub: {
    fontSize: 11,
    color: "#8a868e"
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e2db",
    paddingVertical: 8,
    marginTop: 8
  },
  th: {
    fontSize: 12,
    fontWeight: "700",
    color: "#69656c"
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f0ea",
    alignItems: "center"
  },
  tableRowAlt: {
    backgroundColor: "#faf8f5"
  },
  td: {
    fontSize: 12,
    color: "#221c27"
  },
  emptyText: {
    textAlign: "center",
    color: "#8a868e",
    fontSize: 13,
    paddingVertical: 20
  },
  dianGrid: {
    marginTop: 12,
    gap: 8
  },
  dianField: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f0ea"
  },
  dianFieldLabel: {
    fontSize: 13,
    color: "#69656c"
  },
  dianFieldValue: {
    fontSize: 13,
    color: "#221c27"
  },
  dianFieldValueBold: {
    fontSize: 13,
    fontWeight: "700",
    color: "#15803d"
  },
  dianSecurityNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: 10,
    backgroundColor: "rgba(21, 128, 61, 0.08)",
    borderRadius: 8
  },
  dianSecurityText: {
    fontSize: 12,
    color: "#15803d",
    flex: 1
  },
  dianActionsCard: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e0e5e1",
    gap: 10
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#221c27"
  },
  dianActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  btnActionDian: {
    backgroundColor: "#f59e0b",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  btnActionDianText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 12
  },
  btnActionFiscalMode: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1
  },
  btnFiscalActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981"
  },
  btnFiscalInactive: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db"
  },
  btnActionFiscalModeText: {
    color: "#1e293b",
    fontWeight: "600",
    fontSize: 12
  },
  ley2300Description: {
    fontSize: 13,
    color: "#69656c",
    lineHeight: 18,
    marginVertical: 8
  },
  ley2300RulesList: {
    marginTop: 8,
    gap: 10
  },
  leyRuleItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  leyRuleBullet: {
    fontSize: 14,
    fontWeight: "700",
    color: "#15803d"
  },
  leyRuleText: {
    fontSize: 13,
    color: "#221c27",
    flex: 1
  }
});
