import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import * as Network from "expo-network";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import WifiOff from "lucide-react-native/icons/wifi-off";
import { bindDeviceConnectivity } from "../network/device-connectivity";
import { OnlineSession } from "../network/online-session";

export function OnlineGate({ session, children }: { session: OnlineSession; children: ReactNode }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const unbind = bindDeviceConnectivity(session, {
      currentAppState: AppState.currentState ?? null,
      readNetworkState: Network.getNetworkStateAsync,
      onNetworkChange: (listener) => {
        const subscription = Network.addNetworkStateListener(listener);
        return () => subscription.remove();
      },
      onAppStateChange: (listener) => {
        const subscription = AppState.addEventListener("change", listener);
        return () => subscription.remove();
      }
    });
    return unbind;
  }, [session]);

  if (snapshot.status === "online") return <Fragment key={snapshot.revision}>{children}</Fragment>;

  const busy = retrying || snapshot.status === "checking";
  return (
    <View style={styles.container} testID="connection-blocker">
      <View style={styles.content}>
        {busy ? <ActivityIndicator size="large" color="#24734e" /> : <WifiOff size={42} color="#69656c" aria-hidden />}
        <Text role="heading" style={styles.title} accessibilityLiveRegion="assertive">
          {snapshot.status === "checking" ? "Conectando con tu tienda" : "Sin conexion a internet"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reintentar conexion"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          onPress={async () => {
            setRetrying(true);
            try { await session.check(); }
            finally { setRetrying(false); }
          }}
          style={({ pressed }) => [styles.button, busy && styles.disabled, pressed && styles.pressed]}
        >
          <RefreshCw size={18} color="#ffffff" aria-hidden />
          <Text style={styles.buttonText}>{busy ? "Comprobando..." : "Reintentar"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 280, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, paddingVertical: 48 },
  content: { width: "100%", maxWidth: 380, alignItems: "center", gap: 24 },
  title: { fontFamily: "DMSans_600SemiBold", fontSize: 24, lineHeight: 32, color: "#27242b", textAlign: "center", letterSpacing: 0 },
  button: { minHeight: 48, width: "100%", maxWidth: 224, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16, backgroundColor: "#24734e", borderRadius: 6 },
  buttonText: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: "#ffffff", letterSpacing: 0 },
  disabled: { opacity: 0.65 },
  pressed: { backgroundColor: "#1b583b" }
});