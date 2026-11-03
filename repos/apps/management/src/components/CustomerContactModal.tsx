import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View, TextInput, ScrollView } from "react-native";
import MessageCircle from "lucide-react-native/icons/message-circle";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Clock from "lucide-react-native/icons/clock";
import X from "lucide-react-native/icons/x";

export interface FiadoCustomerContactData {
  id: string;
  name: string;
  docNumber: string;
  phone: string;
  balanceCents: number;
}

export interface CustomerContactModalProps {
  visible: boolean;
  customer: FiadoCustomerContactData | null;
  storeName?: string;
  weeklyContactsUsed?: number;
  onClose: () => void;
  onSendContact: (params: {
    customerId: string;
    channel: "WHATSAPP" | "SMS";
    message: string;
  }) => Promise<void>;
}

export function isColombiaLey2300Active(date: Date = new Date()): {
  allowed: boolean;
  reason: string;
  dayName: string;
  colombiaTimeStr: string;
} {
  // Hora Colombia es UTC-5 sin horario de verano
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const colDate = new Date(utc - 5 * 3600000);
  const day = colDate.getDay(); // 0 = Domingo, 6 = Sábado
  const hour = colDate.getHours();
  const minute = colDate.getMinutes();
  const colombiaTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} (UTC-5)`;

  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const dayName = dayNames[day]!;

  if (day === 0) {
    return {
      allowed: false,
      reason: "Domingo: Prohibido todo contacto de cobranza 24/7 (Ley 2300 de 2023)",
      dayName,
      colombiaTimeStr
    };
  }

  if (day === 6) {
    if (hour >= 8 && hour < 15) {
      return {
        allowed: true,
        reason: "Sábado en horario legal (08:00 a 15:00)",
        dayName,
        colombiaTimeStr
      };
    }
    return {
      allowed: false,
      reason: "Sábado fuera de horario: Permitido únicamente de 08:00 a 15:00",
      dayName,
      colombiaTimeStr
    };
  }

  // Lunes a Viernes
  if (hour >= 7 && hour < 19) {
    return {
      allowed: true,
      reason: "Lunes a Viernes en horario legal (07:00 a 19:00)",
      dayName,
      colombiaTimeStr
    };
  }

  return {
    allowed: false,
    reason: `Fuera de horario hábil: Permitido de 07:00 a 19:00 (Hora actual: ${colombiaTimeStr})`,
    dayName,
    colombiaTimeStr
  };
}

export function CustomerContactModal({
  visible,
  customer,
  storeName = "Tienda La Esmeralda",
  weeklyContactsUsed = 0,
  onClose,
  onSendContact
}: CustomerContactModalProps) {
  const [channel, setChannel] = useState<"WHATSAPP" | "SMS">("WHATSAPP");
  const [customNotes, setCustomNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [successResult, setSuccessResult] = useState<string | null>(null);

  if (!customer) return null;

  const legalStatus = isColombiaLey2300Active();
  const formattedBalance = `$${(customer.balanceCents / 100).toLocaleString("es-CO")} COP`;
  const defaultMessage = `Apreciado/a ${customer.name}, ${storeName} le recuerda cordialmente su saldo pendiente de ${formattedBalance}. Agradecemos su abono oportuno.`;
  const fullMessage = customNotes ? `${defaultMessage} ${customNotes}` : defaultMessage;
  const maxWeeklyReached = weeklyContactsUsed >= 2;

  const handleSend = async () => {
    if (!legalStatus.allowed || maxWeeklyReached) return;
    setSending(true);
    setSuccessResult(null);
    try {
      await onSendContact({
        customerId: customer.id,
        channel,
        message: fullMessage
      });
      setSuccessResult("Mensaje registrado y despachado con trazabilidad legal ante la SIC.");
      setTimeout(() => {
        setSuccessResult(null);
        onClose();
      }, 1800);
    } catch {
      // Error handled by parent
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop} testID="customer-contact-modal-backdrop">
        <View style={styles.modalCard} testID="customer-contact-modal">
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <Text style={styles.title}>Recordatorio de Cobro (Ley 2300)</Text>
              <Text style={styles.subtitle}>
                Cumplimiento normativo "Dejen de Fregar" ante la SIC
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Cerrar ventana"
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.bodyScroll}>
            {/* Información del Cliente */}
            <View style={styles.customerBox}>
              <View>
                <Text style={styles.customerName}>{customer.name}</Text>
                <Text style={styles.customerMeta}>
                  C.C. {customer.docNumber} • Tel: {customer.phone}
                </Text>
              </View>
              <View style={styles.balanceBadge}>
                <Text style={styles.balanceLabel}>Saldo Fiado:</Text>
                <Text style={styles.balanceValue}>{formattedBalance}</Text>
              </View>
            </View>

            {/* Diagnóstico Ley 2300 */}
            <View
              style={[
                styles.legalStatusCard,
                legalStatus.allowed && !maxWeeklyReached ? styles.legalAllowed : styles.legalBlocked
              ]}
            >
              <View style={styles.legalStatusHeader}>
                {legalStatus.allowed && !maxWeeklyReached ? (
                  <ShieldCheck size={18} color="#15803d" />
                ) : (
                  <TriangleAlert size={18} color="#b91c1c" />
                )}
                <Text
                  style={[
                    styles.legalStatusTitle,
                    legalStatus.allowed && !maxWeeklyReached
                      ? styles.textAllowed
                      : styles.textBlocked
                  ]}
                >
                  {maxWeeklyReached
                    ? "Límite Semanal de Contactos Alcanzado"
                    : legalStatus.allowed
                      ? "Contacto Permitido por Ley"
                      : "Contacto Fuera de Horario Legal"}
                </Text>
              </View>

              <Text style={styles.legalReasonText}>
                {maxWeeklyReached
                  ? "Ley 2300 de 2023 prohíbe realizar más de dos (2) contactos de cobranza en una misma semana calendario."
                  : legalStatus.reason}
              </Text>

              <View style={styles.legalMetricsRow}>
                <View style={styles.legalMetricItem}>
                  <Clock size={14} color="#4b5563" />
                  <Text style={styles.legalMetricText}>Hora: {legalStatus.colombiaTimeStr}</Text>
                </View>
                <Text style={styles.legalMetricSeparator}>•</Text>
                <Text style={styles.legalMetricText}>
                  Semana: {weeklyContactsUsed} / 2 contactos
                </Text>
              </View>
            </View>

            {/* Canal de Contacto */}
            <Text style={styles.inputLabel}>Canal de Contacto Autorizado (Ley 1581):</Text>
            <View style={styles.channelRow}>
              <TouchableOpacity
                style={[styles.channelChip, channel === "WHATSAPP" && styles.channelChipActive]}
                onPress={() => setChannel("WHATSAPP")}
                accessibilityRole="button"
                testID="channel-whatsapp"
              >
                <MessageCircle
                  size={16}
                  color={channel === "WHATSAPP" ? "#ffffff" : "#166534"}
                />
                <Text
                  style={[
                    styles.channelChipText,
                    channel === "WHATSAPP" && styles.channelChipTextActive
                  ]}
                >
                  WhatsApp Oficial
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.channelChip, channel === "SMS" && styles.channelChipActive]}
                onPress={() => setChannel("SMS")}
                accessibilityRole="button"
                testID="channel-sms"
              >
                <Text
                  style={[
                    styles.channelChipText,
                    channel === "SMS" && styles.channelChipTextActive
                  ]}
                >
                  SMS Celular
                </Text>
              </TouchableOpacity>
            </View>

            {/* Vista Previa del Mensaje */}
            <Text style={styles.inputLabel}>Vista Previa del Mensaje Oficial:</Text>
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>{fullMessage}</Text>
            </View>

            {/* Nota adicional */}
            <Text style={styles.inputLabel}>Nota adicional para el cliente (opcional):</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ej: Te guardamos el pedido que apartaste..."
              value={customNotes}
              onChangeText={setCustomNotes}
              testID="custom-notes-input"
            />

            {successResult ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>✓ {successResult}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer de Acciones */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!legalStatus.allowed || maxWeeklyReached || sending) && styles.sendBtnDisabled
              ]}
              disabled={!legalStatus.allowed || maxWeeklyReached || sending}
              onPress={handleSend}
              accessibilityRole="button"
              testID="btn-send-reminder"
            >
              <Text style={styles.sendBtnText}>
                {sending
                  ? "Despachando..."
                  : !legalStatus.allowed
                    ? "Bloqueado por Ley 2300"
                    : maxWeeklyReached
                      ? "Límite Semanal Copado"
                      : "Enviar y Registrar en SIC"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  modalCard: {
    width: "100%",
    maxWidth: 540,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 12
  },
  titleGroup: {
    flex: 1
  },
  title: {
    fontSize: 18,
    fontFamily: "DMSans_600SemiBold",
    color: "#111827"
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6
  },
  bodyScroll: {
    maxHeight: 460
  },
  customerBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 14
  },
  customerName: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: "#1f2937"
  },
  customerMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2
  },
  balanceBadge: {
    alignItems: "flex-end"
  },
  balanceLabel: {
    fontSize: 11,
    color: "#991b1b",
    textTransform: "uppercase",
    fontFamily: "DMSans_600SemiBold"
  },
  balanceValue: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#b91c1c"
  },
  legalStatusCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16
  },
  legalAllowed: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0"
  },
  legalBlocked: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  legalStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4
  },
  legalStatusTitle: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold"
  },
  textAllowed: {
    color: "#15803d"
  },
  textBlocked: {
    color: "#b91c1c"
  },
  legalReasonText: {
    fontSize: 12,
    color: "#374151",
    lineHeight: 18,
    marginBottom: 6
  },
  legalMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  legalMetricItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  legalMetricText: {
    fontSize: 11,
    color: "#4b5563"
  },
  legalMetricSeparator: {
    color: "#9ca3af"
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: "#374151",
    marginBottom: 6,
    marginTop: 4
  },
  channelRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14
  },
  channelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#24734e",
    backgroundColor: "#f0fdf4"
  },
  channelChipActive: {
    backgroundColor: "#24734e",
    borderColor: "#24734e"
  },
  channelChipText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: "#166534"
  },
  channelChipTextActive: {
    color: "#ffffff"
  },
  previewBox: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 14
  },
  previewText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
    fontStyle: "italic"
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    marginBottom: 14,
    backgroundColor: "#ffffff"
  },
  successBox: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12
  },
  successText: {
    fontSize: 12,
    color: "#15803d",
    fontFamily: "DMSans_600SemiBold"
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 14
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db"
  },
  cancelBtnText: {
    fontSize: 13,
    color: "#374151"
  },
  sendBtn: {
    backgroundColor: "#24734e",
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 6
  },
  sendBtnDisabled: {
    backgroundColor: "#9ca3af"
  },
  sendBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold"
  }
});
