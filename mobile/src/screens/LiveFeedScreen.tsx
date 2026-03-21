/**
 * LiveFeedScreen
 * Shows real-time camera feed from Pi with obstacle overlays.
 * Connects to backend WebSocket for live obstacle data.
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppStore, Obstacle } from "../hooks/useStore";
import apiService from "../services/api";

const { width: SCREEN_W } = Dimensions.get("window");

const POSITION_COLORS: Record<string, string> = {
  left: "#FF6B6B",
  center: "#FF9500",
  right: "#00D4FF",
};

export default function LiveFeedScreen() {
  const { liveFeedFrame, obstacles, setLiveFeed, isLive, setIsLive } = useAppStore();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for live indicator
  useEffect(() => {
    if (isLive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isLive]);

  // Connect to dashboard WebSocket
  useEffect(() => {
    const disconnect = apiService.connectDashboard((data) => {
      if (data.type === "obstacles") {
        setLiveFeed(data.frame_b64 || "", data.obstacles || []);
        setIsLive(true);
      }
    });
    return disconnect;
  }, []);

  const nearObstacles = obstacles.filter((o) => o.near);
  const farObstacles = obstacles.filter((o) => !o.near);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>SeeForMe</Text>
        <View style={styles.liveRow}>
          <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.liveText}>{isLive ? "LIVE" : "WAITING"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Camera Feed */}
        <View style={styles.feedContainer}>
          {liveFeedFrame ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${liveFeedFrame}` }}
              style={styles.feedImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.feedPlaceholder}>
              <Text style={styles.feedPlaceholderIcon}>📷</Text>
              <Text style={styles.feedPlaceholderText}>Waiting for Pi feed...</Text>
            </View>
          )}

          {/* Obstacle overlay badges */}
          <View style={styles.overlayBadges}>
            {["left", "center", "right"].map((pos) => {
              const items = obstacles.filter((o) => o.position === pos && o.near);
              return items.length > 0 ? (
                <View
                  key={pos}
                  style={[styles.posBadge, { backgroundColor: POSITION_COLORS[pos] + "CC" }]}
                >
                  <Text style={styles.posBadgeText}>
                    {pos.toUpperCase()}{"\n"}{items.map((i) => i.label).join(", ")}
                  </Text>
                </View>
              ) : null;
            })}
          </View>
        </View>

        {/* Alert Section */}
        {nearObstacles.length > 0 && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>⚠️  NEARBY OBSTACLES</Text>
            {nearObstacles.map((obs, i) => (
              <ObstacleRow key={i} obs={obs} highlighted />
            ))}
          </View>
        )}

        {/* All Detections */}
        {obstacles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ALL DETECTIONS</Text>
            {obstacles.map((obs, i) => (
              <ObstacleRow key={i} obs={obs} />
            ))}
          </View>
        )}

        {obstacles.length === 0 && isLive && (
          <View style={styles.clearBox}>
            <Text style={styles.clearIcon}>✅</Text>
            <Text style={styles.clearText}>Path clear</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ObstacleRow({ obs, highlighted = false }: { obs: Obstacle; highlighted?: boolean }) {
  const depthPct = Math.round(obs.depth_score * 100);
  const color = POSITION_COLORS[obs.position] || "#aaa";
  return (
    <View style={[styles.obstacleRow, highlighted && styles.obstacleRowHighlighted]}>
      <View style={[styles.posIndicator, { backgroundColor: color }]} />
      <View style={styles.obstacleInfo}>
        <Text style={styles.obstacleLabel}>{obs.label}</Text>
        <Text style={styles.obstacleDetail}>
          {obs.position.toUpperCase()} · {depthPct}% proximity · {Math.round(obs.confidence * 100)}% conf
        </Text>
      </View>
      {obs.near && <Text style={styles.nearBadge}>NEAR</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A2E",
  },
  title: { fontSize: 22, fontWeight: "800", color: "#00F5C4", letterSpacing: 1 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#00F5C4" },
  liveText: { fontSize: 11, color: "#00F5C4", fontWeight: "700", letterSpacing: 2 },
  content: { padding: 16, gap: 16 },

  feedContainer: {
    width: "100%",
    height: SCREEN_W * 0.65,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#1A1A2E",
  },
  feedImage: { width: "100%", height: "100%" },
  feedPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  feedPlaceholderIcon: { fontSize: 40 },
  feedPlaceholderText: { color: "#555", fontSize: 14 },
  overlayBadges: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  posBadge: {
    flex: 1,
    borderRadius: 8,
    padding: 6,
    alignItems: "center",
  },
  posBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", textAlign: "center" },

  alertBox: {
    backgroundColor: "#1A0A0A",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FF4444",
    gap: 8,
  },
  alertTitle: { color: "#FF6B6B", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },

  section: { gap: 8 },
  sectionTitle: { color: "#555", fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 4 },

  obstacleRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  obstacleRowHighlighted: { backgroundColor: "#1A1010", borderWidth: 1, borderColor: "#FF444440" },
  posIndicator: { width: 4, height: 36, borderRadius: 2 },
  obstacleInfo: { flex: 1 },
  obstacleLabel: { color: "#EEE", fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  obstacleDetail: { color: "#666", fontSize: 11, marginTop: 2 },
  nearBadge: {
    backgroundColor: "#FF4444",
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    letterSpacing: 1,
  },

  clearBox: { alignItems: "center", paddingVertical: 40, gap: 8 },
  clearIcon: { fontSize: 48 },
  clearText: { color: "#00F5C4", fontSize: 18, fontWeight: "700" },
});
