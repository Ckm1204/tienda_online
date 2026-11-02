import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { isWeakPin } from "@tiendita/contracts";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import QrCode from "lucide-react-native/icons/qr-code";
import KeyRound from "lucide-react-native/icons/key-round";
import SquareCheck from "lucide-react-native/icons/square-check";
import Download from "lucide-react-native/icons/download";

export interface OwnerActivationWizardProps {
  activationToken: string;
  onActivated?: (result: { downloadUrl: string; terminalCode: string; terminalEnrollmentQr: string }) => void;
  apiOrigin?: string;
  fetchFn?: any;
}

export function OwnerActivationWizard({
  activationToken,
  onActivated,
  apiOrigin = "http://127.0.0.1:3000",
  fetchFn = fetch
}: OwnerActivationWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pin, setPin] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [completionData, setCompletionData] = useState<{
    downloadUrl: string;
    terminalCode: string;
    terminalEnrollmentQr: string;
  } | null>(null);

  const handleNextStep1 = () => {
    if (password.length < 8) {
      setErrorMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setErrorMessage(null);
    setStep(2);
  };

  const handleNextStep2 = () => {
    if (!/^\d{6}$/.test(totpCode)) {
      setErrorMessage("Ingresa el código de 6 dígitos de tu app de autenticación.");
      return;
    }
    setErrorMessage(null);
    setStep(3);
  };

  const handleNextStep3 = () => {
    if (!/^\d{4}$/.test(pin)) {
      setErrorMessage("El PIN debe ser exactamente de 4 dígitos numéricos.");
      return;
    }
    if (isWeakPin(pin)) {
      setErrorMessage("El PIN no puede ser trivial (ej. 1234, 0000 o fechas obvias).");
      return;
    }
    setErrorMessage(null);
    setStep(4);
  };

  const handleFinishActivation = async () => {
    if (!acceptTerms) {
      setErrorMessage("Debes aceptar los términos del servicio y política de datos.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetchFn(`${apiOrigin}/v1/auth/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activationToken,
          password,
          totpCode,
          pin,
          acceptTerms: true
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Error al activar la cuenta.");
        return;
      }
      setCompletionData({
        downloadUrl: data.downloadUrl,
        terminalCode: data.terminalCode,
        terminalEnrollmentQr: data.terminalEnrollmentQr
      });
      setStep(5);
      onActivated?.(data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card} testID="activation-wizard">
      <View style={styles.header}>
        <ShieldCheck size={28} color="#24734e" aria-hidden />
        <Text style={styles.title}>Activación de Cuenta de Dueño</Text>
        <Text style={styles.subtitle}>
          Paso {step} de 4 {step === 5 && "(Completado)"}
        </Text>
      </View>

      {errorMessage && (
        <View style={styles.errorBox} testID="activation-error">
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {step === 1 && (
        <View style={styles.stepContainer} testID="step-1">
          <Text style={styles.label}>1. Define tu contraseña de acceso</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Contraseña"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep1} testID="btn-next-step-1">
            <Text style={styles.buttonText}>Continuar a Segundo Factor (MFA)</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 2 && (
        <View style={styles.stepContainer} testID="step-2">
          <Text style={styles.label}>2. Enrola tu aplicación de autenticación (TOTP)</Text>
          <View style={styles.qrPlaceholder}>
            <QrCode size={48} color="#24734e" aria-hidden />
            <Text style={styles.qrText}>Escanea con Google Authenticator o Microsoft Authenticator</Text>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Código de 6 dígitos"
            keyboardType="number-pad"
            maxLength={6}
            value={totpCode}
            onChangeText={setTotpCode}
            accessibilityLabel="Código TOTP"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep2} testID="btn-next-step-2">
            <Text style={styles.buttonText}>Verificar Código y Continuar</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 3 && (
        <View style={styles.stepContainer} testID="step-3">
          <Text style={styles.label}>3. Define tu PIN de 4 dígitos para la Caja</Text>
          <Text style={styles.helperText}>
            Este PIN rápido te permitirá desbloquear la caja en el computador sin usar contraseña larga.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="4 dígitos (no trivial)"
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            accessibilityLabel="PIN de caja"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep3} testID="btn-next-step-3">
            <Text style={styles.buttonText}>Guardar PIN y Continuar</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 4 && (
        <View style={styles.stepContainer} testID="step-4">
          <Text style={styles.label}>4. Términos del servicio y Habeas Data</Text>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAcceptTerms(!acceptTerms)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptTerms }}
            testID="checkbox-accept-terms"
          >
            <SquareCheck size={22} color={acceptTerms ? "#24734e" : "#69656c"} aria-hidden />
            <Text style={styles.checkboxText}>
              Acepto los términos del servicio y autorizo el tratamiento de datos personales conforme a la Ley 1581 de 2012.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={handleFinishActivation}
            testID="btn-finish-activation"
          >
            <Text style={styles.buttonText}>{loading ? "Activando..." : "Completar Activación"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 5 && completionData && (
        <View style={styles.stepContainer} testID="step-completed">
          <Text style={styles.successTitle}>¡Tu cuenta está lista!</Text>
          <Text style={styles.helperText}>
            Ya puedes instalar la caja en el computador de tu negocio y enlazarla.
          </Text>

          <TouchableOpacity
            style={styles.downloadButton}
            accessibilityRole="link"
            testID="btn-download-pos"
          >
            <Download size={20} color="#ffffff" aria-hidden />
            <Text style={styles.downloadButtonText}>Descargar TienditaOnline Caja para Windows</Text>
          </TouchableOpacity>

          <View style={styles.terminalBox}>
            <Text style={styles.terminalTitle}>Enrolar tu primera caja ({completionData.terminalCode}):</Text>
            <View style={styles.qrPlaceholder}>
              <QrCode size={64} color="#27242b" aria-hidden />
              <Text style={styles.qrCodeText}>Código QR de CAJA-01</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e0e5e1",
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
    gap: 16
  },
  header: {
    alignItems: "center",
    gap: 8
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#27242b",
    textAlign: "center"
  },
  subtitle: {
    fontSize: 14,
    color: "#69656c"
  },
  stepContainer: {
    gap: 16
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#27242b"
  },
  helperText: {
    fontSize: 13,
    color: "#69656c",
    lineHeight: 18
  },
  input: {
    borderWidth: 1,
    borderColor: "#d5dcd6",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#ffffff"
  },
  primaryButton: {
    backgroundColor: "#24734e",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600"
  },
  downloadButton: {
    backgroundColor: "#1f2937",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  downloadButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600"
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 12,
    borderRadius: 8
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14
  },
  qrPlaceholder: {
    borderWidth: 1,
    borderColor: "#e0e5e1",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    backgroundColor: "#f9fafb",
    gap: 8
  },
  qrText: {
    fontSize: 13,
    color: "#4b5563",
    textAlign: "center"
  },
  qrCodeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  checkboxContainer: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    paddingVertical: 8
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    lineHeight: 18
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#24734e",
    textAlign: "center"
  },
  terminalBox: {
    marginTop: 12,
    gap: 8
  },
  terminalTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937"
  }
});
