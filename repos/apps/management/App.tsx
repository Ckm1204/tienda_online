import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import Store from "lucide-react-native/icons/store";
import { OnlineGate } from "./src/components/OnlineGate";
import { onlineSession } from "./src/network/runtime";

export default function App() {
  useFonts({ DMSans_400Regular, DMSans_600SemiBold });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <Store size={25} color="#24734e" aria-hidden />
          <Text style={styles.brand}>TienditaOnline</Text>
          <View style={styles.divider} />
          <Text style={styles.section}>Gestion</Text>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <OnlineGate session={onlineSession}>
            <View style={styles.session} testID="management-session">
              <LockKeyhole size={38} color="#24734e" aria-hidden />
              <Text role="heading" style={styles.title}>Sesion no iniciada</Text>
            </View>
          </OnlineGate>
        </ScrollView>
        <View style={styles.footer}>
          <Text style={styles.footerText}>TienditaOnline</Text>
          <Text style={styles.footerText}>Gestion de tu tienda</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f7f8f7" },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: "#e0e5e1", backgroundColor: "#ffffff" },
  brand: { fontFamily: "DMSans_600SemiBold", fontSize: 20, color: "#27242b", letterSpacing: 0 },
  divider: { width: 1, height: 22, backgroundColor: "#d5dcd6" },
  section: { fontFamily: "DMSans_400Regular", fontSize: 14, color: "#69656c", letterSpacing: 0 },
  body: { flexGrow: 1 },
  session: { flex: 1, minHeight: 280, alignItems: "center", justifyContent: "center", gap: 24, padding: 24 },
  title: { fontFamily: "DMSans_600SemiBold", fontSize: 24, lineHeight: 32, textAlign: "center", color: "#27242b", letterSpacing: 0 },
  footer: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: "#e0e5e1" },
  footerText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: "#69656c", letterSpacing: 0 }
});