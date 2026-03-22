import { StyleSheet, Text, View, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

interface Session {
  id: string;
  query: string;
  text_response: string;
  annotated_frame_b64?: string;
  timestamp: number;
}

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    AsyncStorage.getItem('sf_sessions').then((raw) => {
      if (raw) setSessions(JSON.parse(raw));
    });
  }, []);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Session History</Text>
        <Text style={s.subtitle}>{sessions.length} sessions stored</Text>
      </View>

      {sessions.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyText}>No sessions yet</Text>
          <Text style={s.emptyHint}>Ask a question from the Ask tab</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
              </View>
              <Text style={s.query}>"{item.query}"</Text>
              <Text style={s.response} numberOfLines={2}>{item.text_response}</Text>
              {item.annotated_frame_b64 && (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${item.annotated_frame_b64}` }}
                  style={s.thumb}
                  resizeMode="cover"
                />
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080B12' },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E2740',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#00F5C4', letterSpacing: 1 },
  subtitle: { color: '#3A4260', fontSize: 12, marginTop: 2 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#0E1320', borderRadius: 14,
    padding: 14, gap: 8,
    borderWidth: 1, borderColor: '#1E2740',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: '#3A4260', fontSize: 11 },
  query: { color: '#5A6580', fontSize: 13, fontStyle: 'italic' },
  response: { color: '#C8CDD8', fontSize: 14, lineHeight: 20 },
  thumb: { width: '100%', height: 120, borderRadius: 8, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#E8EDF5', fontSize: 18, fontWeight: '700' },
  emptyHint: { color: '#3A4260', fontSize: 14 },
});
