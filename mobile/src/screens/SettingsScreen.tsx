/**
 * SettingsScreen — Auth0 login, config display
 */

import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Switch, ScrollView, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Auth0, { useAuth0 } from "react-native-auth0";
import { useAppStore } from "../hooks/useStore";

const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN || "";
const AUTH0_CLIENT_ID = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID || "";

export default function SettingsScreen() {
  const { user, token, setAuth, clearAuth } = useAppStore();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  const handleLogin = () => {
    // Auth0 login flow — in production use react-native-auth0 hooks
    Alert.alert(
      "Auth0 Login",
      "Opens Auth0 Universal Login. Configure AUTH0_DOMAIN and AUTH0_CLIENT_ID in .env",
      [{ text: "OK" }]
    );
  };

  const handleLogout = () => {
    clearAuth();
    Alert.alert("Signed out", "You have been signed out.");
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.configRow}>
      <Text style={styles.configLabel}>{label}</Text>
      <Text style={styles.configValue} numberOfLines={1}>{value || "Not set"}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Auth Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          {user ? (
            <>
              <View style={styles.userCard}>
                <Text style={styles.userAvatar}>👤</Text>
                <View>
                  <Text style={styles.userName}>{user.name || "User"}</Text>
                  <Text style={styles.userEmail}>{user.email || user.sub}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.dangerBtn} onPress={handleLogout}>
                <Text style={styles.dangerBtnText}>Sign Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
              <Text style={styles.primaryBtnText}>Sign In with Auth0</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCES</Text>
          <ToggleRow label="Voice Responses" value={voiceEnabled} onChange={setVoiceEnabled} />
          <ToggleRow label="Proximity Alerts" value={alertsEnabled} onChange={setAlertsEnabled} />
        </View>

        {/* Connection Config */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONNECTION</Text>
          <Row label="Backend" value={process.env.EXPO_PUBLIC_BACKEND_URL || "localhost:8000"} />
          <Row label="Auth0 Domain" value={AUTH0_DOMAIN} />
          <Row label="Status" value={token ? "Authenticated ✓" : "Not authenticated"} />
        </View>

        {/* Tech Stack */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>POWERED BY</Text>
          {[
            "YOLOv8 · Object Detection",
            "MiDaS · Depth Estimation",
            "Gemini 1.5 Flash · Vision AI",
            "ElevenLabs · Voice Synthesis",
            "Auth0 · Security",
            "MongoDB Atlas · Storage",
            "Snowflake · Analytics",
            "Cloudflare · Edge Delivery",
            "DigitalOcean · Cloud",
          ].map((item) => (
            <Text key={item} style={styles.techItem}>· {item}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#222", true: "#00F5C430" }}
        thumbColor={value ? "#00F5C4" : "#555"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#1A1A2E" },
  title: { fontSize: 22, fontWeight: "800", color: "#00F5C4", letterSpacing: 1 },
  content: { padding: 20, gap: 24 },

  section: { gap: 10 },
  sectionTitle: { color: "#555", fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 4 },

  userCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#111827", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#1A1A2E",
  },
  userAvatar: { fontSize: 32 },
  userName: { color: "#EEE", fontWeight: "700", fontSize: 15 },
  userEmail: { color: "#666", fontSize: 12, marginTop: 2 },

  primaryBtn: {
    backgroundColor: "#00F5C4", borderRadius: 12,
    padding: 14, alignItems: "center",
  },
  primaryBtnText: { color: "#0A0A0F", fontWeight: "800", fontSize: 15 },

  dangerBtn: {
    backgroundColor: "#1A0A0A", borderRadius: 12, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: "#FF444440",
  },
  dangerBtnText: { color: "#FF6B6B", fontWeight: "700", fontSize: 15 },

  toggleRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#111827", borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: "#1A1A2E",
  },
  toggleLabel: { color: "#CCC", fontSize: 14 },

  configRow: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: "#111827", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#1A1A2E",
  },
  configLabel: { color: "#666", fontSize: 12 },
  configValue: { color: "#888", fontSize: 12, maxWidth: "55%" },

  techItem: { color: "#444", fontSize: 13, paddingVertical: 2 },
});
