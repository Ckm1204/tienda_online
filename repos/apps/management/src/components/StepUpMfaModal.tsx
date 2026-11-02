import React, { useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import ShieldAlert from "lucide-react-native/icons/shield-alert";

export interface StepUpMfaModalProps {
  visible: boolean;
  actionTitle: string;
  actionDescription?: string;
  onConfirm: (mfaCode: string) => Promise<boolean>;
  onCancel: () => void;
}

export function StepUpMfaModal({
  visible,
  actionTitle,
  actionDescription,
  onConfirm,
  onCancel
}: StepUpMfaModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError("El código debe tener 6 dígitos numéricos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ok = await onConfirm(code);
      if (ok) {
        setCode("");
      } else {
        setError("Código inválido o expirado.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al validar MFA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop} testID="step-up-modal-backdrop">
        <View style={styles.modalCard} testID="step-up-modal">
          <View style={styles.iconContainer}>
            <ShieldAlert size={32} color="#dc2626" aria-hidden />
          </View>
          <Text style={styles.title}>{actionTitle}</Text>
          <Text style={styles.description}>
            {actionDescription ||
              "Esta es una acción crítica que exige confirmación con tu código de autenticación de 6 dígitos (Step-up MFA)."}
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            accessibilityLabel="Código de autenticación MFA"
            testID="step-up-mfa-input"
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={loading} testID="step-up-cancel">
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, loading && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={loading}
              testID="step-up-confirm"
            >
              <Text style={styles.confirmText}>{loading ? "Verificando..." : "Confirmar Acción"}</Text>
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
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 24,
    maxWidth: 420,
    width: "100%",
    gap: 16,
    alignItems: "center"
  },
  iconContainer: {
    padding: 12,
    borderRadius: 50,
    backgroundColor: "#fee2e2"
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
    textAlign: "center"
  },
  description: {
    fontSize: 14,
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 20
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    textAlign: "center",
    letterSpacing: 4,
    width: 200,
    fontWeight: "600"
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginTop: 8
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center"
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4b5563"
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#dc2626",
    alignItems: "center"
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 6,
    width: "100%"
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    textAlign: "center"
  }
});

