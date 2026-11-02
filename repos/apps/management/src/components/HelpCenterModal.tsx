import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import Play from "lucide-react-native/icons/play";
import MessageCircle from "lucide-react-native/icons/message-circle";
import X from "lucide-react-native/icons/x";

export interface HelpCenterModalProps {
  storeName: string;
  terminalCode?: string;
  appVersion?: string;
  onClose: () => void;
  onOpenWhatsApp?: (url: string) => void;
}

export function buildWhatsAppSupportUrl({
  storeName,
  terminalCode = "GESTION-WEB",
  appVersion = "1.0.0",
  phoneNumber = "573001234567"
}: {
  storeName: string;
  terminalCode?: string;
  appVersion?: string;
  phoneNumber?: string;
}): string {
  const message = `Hola, necesito ayuda con mi tienda [${storeName} - ${terminalCode} - v${appVersion}]`;
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
}

export function HelpCenterModal({
  storeName,
  terminalCode = "GESTION-WEB",
  appVersion = "1.0.0",
  onClose,
  onOpenWhatsApp
}: HelpCenterModalProps) {
  const waUrl = buildWhatsAppSupportUrl({ storeName, terminalCode, appVersion });

  const handleWhatsAppClick = () => {
    if (onOpenWhatsApp) {
      onOpenWhatsApp(waUrl);
    } else if (typeof window !== "undefined") {
      window.open(waUrl, "_blank");
    }
  };

  const tutorials = [
    {
      id: "vender",
      title: "Cómo vender en 3 segundos",
      duration: "0:45 min",
      description: "Aprende a escanear productos, aplicar descuentos por redondeo y cobrar pagos mixtos."
    },
    {
      id: "arqueo",
      title: "Cómo hacer el arqueo ciego y reporte Z",
      duration: "1:00 min",
      description: "Cierra el turno sin ver el saldo del sistema para evitar faltantes de caja."
    },
    {
      id: "fiados",
      title: "Cómo fiar y registrar abonos",
      duration: "0:50 min",
      description: "Asigna cupos de crédito, consulta deudas y registra abonos en efectivo al instante."
    }
  ];

  return (
    <View style={styles.modalOverlay} testID="help-center-modal">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Centro de Ayuda y Soporte</Text>
          <TouchableOpacity onPress={onClose} testID="btn-close-help">
            <X size={20} color="#69656c" />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Videos cortos de 60 segundos diseñados para tenderos y cajeros.
        </Text>

        <ScrollView style={styles.videoList}>
          {tutorials.map((t) => (
            <View key={t.id} style={styles.tutorialItem} testID={`tutorial-card-${t.id}`}>
              <View style={styles.playCircle}>
                <Play size={18} color="#24734e" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.tutorialHeader}>
                  <Text style={styles.tutorialTitle}>{t.title}</Text>
                  <Text style={styles.tutorialDuration}>{t.duration}</Text>
                </View>
                <Text style={styles.tutorialDesc}>{t.description}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.whatsAppBtn}
            onPress={handleWhatsAppClick}
            testID="btn-whatsapp-support"
          >
            <MessageCircle size={18} color="#ffffff" />
            <Text style={styles.whatsAppBtnText}>Hablar con soporte por WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    maxWidth: 520,
    width: "100%"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1d1b20"
  },
  subtitle: {
    fontSize: 14,
    color: "#69656c",
    marginBottom: 16
  },
  videoList: {
    maxHeight: 300,
    marginBottom: 16
  },
  tutorialItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f7f5f8",
    borderRadius: 10,
    marginBottom: 10
  },
  playCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e8f5e9",
    alignItems: "center",
    justifyContent: "center"
  },
  tutorialHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2
  },
  tutorialTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1d1b20"
  },
  tutorialDuration: {
    fontSize: 12,
    color: "#24734e",
    fontWeight: "600"
  },
  tutorialDesc: {
    fontSize: 12,
    color: "#49454e",
    lineHeight: 16
  },
  footer: {
    marginTop: 8
  },
  whatsAppBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#25d366",
    paddingVertical: 12,
    borderRadius: 10
  },
  whatsAppBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15
  }
});
