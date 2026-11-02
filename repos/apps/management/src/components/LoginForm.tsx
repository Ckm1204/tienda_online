import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import LogIn from "lucide-react-native/icons/log-in";
import KeyRound from "lucide-react-native/icons/key-round";
import type { ManagementAuthService } from "../auth/auth-state";

export interface LoginFormProps {
  authService: ManagementAuthService;
  onSuccess?: () => void;
  fetchFn?: any;
}

export function LoginForm({ authService, onSuccess, fetchFn }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) {
      setErrorMessage("Por favor ingresa tu correo y contraseña.");
      return;
    }
    if (mfaChallenge && !/^\d{6}$/.test(mfaCode)) {
      setErrorMessage("Ingresa el código MFA de 6 dígitos.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const res = await authService.login({
      email,
      password,
      mfaCode: mfaChallenge ? mfaCode : undefined,
      fetchFn
    });

    setLoading(false);

    if (res.mfaRequired) {
      setMfaChallenge(true);
      return;
    }

    if (!res.success) {
      setErrorMessage(res.error || "Credenciales incorrectas.");
      return;
    }

    onSuccess?.();
  };

  return (
    <View style={styles.card} testID="login-form">
      <View style={styles.header}>
        <LogIn size={28} color="#24734e" aria-hidden />
        <Text style={styles.title}>Iniciar Sesión</Text>
        <Text style={styles.subtitle}>App de Gestión TienditaOnline</Text>
      </View>

      {errorMessage && (
        <View style={styles.errorBox} testID="login-error">
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          placeholder="ejemplo@tienda.co"
          accessibilityLabel="Correo electrónico"
          testID="input-email"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          accessibilityLabel="Contraseña"
          testID="input-password"
        />
      </View>

      {mfaChallenge && (
        <View style={styles.field} testID="mfa-challenge-box">
          <View style={styles.mfaHeader}>
            <KeyRound size={18} color="#24734e" aria-hidden />
            <Text style={styles.label}>Código de Autenticación (MFA)</Text>
          </View>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={6}
            value={mfaCode}
            onChangeText={setMfaCode}
            placeholder="123456"
            accessibilityLabel="Código MFA"
            testID="input-mfa-code"
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        accessibilityRole="button"
        testID="btn-submit-login"
      >
        <Text style={styles.buttonText}>
          {loading ? "Iniciando..." : mfaChallenge ? "Verificar y Entrar" : "Iniciar Sesión"}
        </Text>
      </TouchableOpacity>
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
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
    gap: 16
  },
  header: {
    alignItems: "center",
    gap: 4
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#27242b"
  },
  subtitle: {
    fontSize: 14,
    color: "#69656c"
  },
  field: {
    gap: 6
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#27242b"
  },
  input: {
    borderWidth: 1,
    borderColor: "#d5dcd6",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#ffffff"
  },
  mfaHeader: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center"
  },
  primaryButton: {
    backgroundColor: "#24734e",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
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
  }
});
