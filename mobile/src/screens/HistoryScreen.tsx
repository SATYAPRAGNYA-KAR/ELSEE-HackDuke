/**
 * HistoryScreen — Browse past query sessions
 */

import React from "react";
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppStore, QuerySession } from "../hooks/useStore";

export default function HistoryScreen() {
  const { sessions, setActiveSession } = useAppStore();

  const renderItem = ({ item }: { item: QuerySession }) => (
    <TouchableOpacity style={styles.card} onPress={() => setActiveSession(item)} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
        {item.audio_response_b64 && <Text style={styles.audioIcon}>🔊</Text>}
      </View>
      <Text style={styles.query}>"{item.query}"</Text>
      <Text style={styles.response} numberOfLines={2}>{item.text_response}</Text>
      {item.annotated_frame_b64 && (
        <Image
          source={{ uri: `data:image/jpeg;base64,${item.annotated_frame_b64}` }}
          style={styles.thumb}
          resizeMode="cover"
        />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Session History</Text>
        <Text style={styles.subtitle}>{sessions.length} sessions this run</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No sessions yet</Text>
          <Text style={styles.emptyHint}>Ask a question from the Ask tab</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#1A1A2E" },
  title: { fontSize: 22, fontWeight: "800", color: "#00F5C4", letterSpacing: 1 },
  subtitle: { color: "#555", fontSize: 12, marginTop: 2 },
  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: "#111827", borderRadius: 14, padding: 14,
    gap: 8, borderWidth: 1, borderColor: "#1A1A2E",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timestamp: { color: "#555", fontSize: 11 },
  audioIcon: { fontSize: 14 },
  query: { color: "#888", fontSize: 13, fontStyle: "italic" },
  response: { color: "#CCC", fontSize: 14, lineHeight: 20 },
  thumb: { width: "100%", height: 120, borderRadius: 8, marginTop: 4 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: "#EEE", fontSize: 18, fontWeight: "700" },
  emptyHint: { color: "#555", fontSize: 14 },
});
