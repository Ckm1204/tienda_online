import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import CreditCard from "lucide-react-native/icons/credit-card";
import Download from "lucide-react-native/icons/download";

export interface QuotaItem {
  label: string;
  used: number;
  max: number;
  unit: string;
}

export interface InvoiceItem {
  id: string;
  reference: string;
  period: string;
  amountCents: number;
  status: "PAID" | "PENDING" | "OVERDUE";
  dueDate: string;
  pdfUrl?: string;
}

export interface SubscriptionBillingScreenProps {
  planName: string;
  planCode: string;
  status: "ACTIVE" | "RESTRICTED" | "SUSPENDED" | "GRACE";
  monthlyPriceCents: number;
  quotas: QuotaItem[];
  invoices: InvoiceItem[];
  onPayInvoice: (invoiceId: string) => void;
  onChangePlan: () => void;
}

export function SubscriptionBillingScreen({
  planName,
  status,
  monthlyPriceCents,
  quotas,
  invoices,
  onPayInvoice,
  onChangePlan
}: SubscriptionBillingScreenProps) {
  const isRestricted = status === "RESTRICTED" || status === "SUSPENDED";

  return (
    <ScrollView style={styles.container} testID="subscription-billing-screen">
      <Text style={styles.title}>Mi Suscripción y Facturación</Text>
      <Text style={styles.subtitle}>
        Gestiona tu plan comercial, consulta el uso de tus cupos y descarga tus facturas mensuales.
      </Text>

      {/* Alerta de restricción por mora (HU-237) */}
      {isRestricted && (
        <View style={styles.alertBanner} testID="restricted-billing-banner">
          <CircleAlert size={22} color="#b3261e" />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertBannerTitle}>Cuenta en modo de solo lectura (Mora D+8)</Text>
            <Text style={styles.alertBannerDesc}>
              Tu tienda se encuentra restringida por una factura pendiente. Paga ahora para desbloquear todas las funciones de venta y administración.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.payNowTopBtn}
            onPress={() => invoices.find((i) => i.status !== "PAID")?.id && onPayInvoice(invoices.find((i) => i.status !== "PAID")!.id)}
            testID="btn-pay-restricted"
          >
            <CreditCard size={16} color="#ffffff" />
            <Text style={styles.payNowTopBtnText}>
              Pagar ahora (${(monthlyPriceCents / 100).toLocaleString("es-CO")})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tarjeta del Plan Actual */}
      <View style={styles.card}>
        <View style={styles.planHeader}>
          <View>
            <View style={styles.statusBadgeRow}>
              <Text style={styles.planName}>{planName}</Text>
              <View
                style={[
                  styles.statusBadge,
                  status === "ACTIVE" ? styles.statusBadgeActive : styles.statusBadgeRestricted
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    status === "ACTIVE" ? styles.statusTextActive : styles.statusTextRestricted
                  ]}
                >
                  {status}
                </Text>
              </View>
            </View>
            <Text style={styles.planPrice}>
              ${(monthlyPriceCents / 100).toLocaleString("es-CO")} COP / mes
            </Text>
          </View>

          <TouchableOpacity style={styles.changePlanBtn} onPress={onChangePlan} testID="btn-change-plan">
            <Text style={styles.changePlanBtnText}>Cambiar de plan</Text>
          </TouchableOpacity>
        </View>

        {/* Barras de uso de cupos */}
        <View style={styles.quotasContainer}>
          <Text style={styles.sectionHeading}>Uso de Cupos del Plan</Text>
          {quotas.map((quota, idx) => {
            const percentage = Math.min(100, Math.round((quota.used / quota.max) * 100));
            const isNearLimit = percentage >= 85;

            return (
              <View key={idx} style={styles.quotaRow} testID={`quota-row-${idx}`}>
                <View style={styles.quotaLabels}>
                  <Text style={styles.quotaName}>{quota.label}</Text>
                  <Text style={styles.quotaCount}>
                    {quota.used} de {quota.max} {quota.unit} ({percentage}%)
                  </Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${percentage}%` },
                      isNearLimit && styles.progressBarFillWarning
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Historial de Facturas */}
      <View style={styles.card}>
        <Text style={styles.sectionHeading}>Historial de Facturas</Text>
        {invoices.map((inv) => {
          const isPending = inv.status === "PENDING" || inv.status === "OVERDUE";
          return (
            <View key={inv.id} style={styles.invoiceRow} testID={`invoice-row-${inv.id}`}>
              <View>
                <Text style={styles.invoiceRef}>Factura #{inv.reference}</Text>
                <Text style={styles.invoiceMeta}>
                  Periodo: {inv.period} · Vencimiento: {inv.dueDate}
                </Text>
              </View>

              <View style={styles.invoiceRightGroup}>
                <Text style={styles.invoiceAmount}>
                  ${(inv.amountCents / 100).toLocaleString("es-CO")}
                </Text>
                {isPending ? (
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => onPayInvoice(inv.id)}
                    testID={`btn-pay-invoice-${inv.id}`}
                  >
                    <Text style={styles.payBtnText}>Pagar con PSE / Nequi</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.paidBadge}>
                    <ShieldCheck size={14} color="#24734e" />
                    <Text style={styles.paidBadgeText}>PAGADA</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
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
    marginBottom: 20
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fce8e6",
    borderWidth: 1,
    borderColor: "#f2b8b5",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20
  },
  alertBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#b3261e"
  },
  alertBannerDesc: {
    fontSize: 13,
    color: "#601410",
    lineHeight: 18,
    marginTop: 2
  },
  payNowTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#b3261e",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  payNowTopBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e3e1e6",
    padding: 20,
    marginBottom: 20
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0edf1"
  },
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  planName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1d1b20"
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  statusBadgeActive: {
    backgroundColor: "#e8f5e9"
  },
  statusBadgeRestricted: {
    backgroundColor: "#fce8e6"
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700"
  },
  statusTextActive: {
    color: "#24734e"
  },
  statusTextRestricted: {
    color: "#b3261e"
  },
  planPrice: {
    fontSize: 16,
    color: "#69656c",
    marginTop: 4
  },
  changePlanBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#24734e"
  },
  changePlanBtnText: {
    color: "#24734e",
    fontWeight: "700",
    fontSize: 13
  },
  quotasContainer: {
    marginTop: 16
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1d1b20",
    marginBottom: 12
  },
  quotaRow: {
    marginBottom: 14
  },
  quotaLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6
  },
  quotaName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1d1b20"
  },
  quotaCount: {
    fontSize: 13,
    color: "#69656c"
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: "#e3e1e6",
    borderRadius: 4,
    overflow: "hidden"
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#24734e",
    borderRadius: 4
  },
  progressBarFillWarning: {
    backgroundColor: "#d97706"
  },
  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0edf1"
  },
  invoiceRef: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1d1b20"
  },
  invoiceMeta: {
    fontSize: 13,
    color: "#69656c",
    marginTop: 2
  },
  invoiceRightGroup: {
    alignItems: "flex-end",
    gap: 6
  },
  invoiceAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1d1b20"
  },
  payBtn: {
    backgroundColor: "#24734e",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  payBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700"
  },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  paidBadgeText: {
    color: "#24734e",
    fontSize: 12,
    fontWeight: "700"
  }
});
