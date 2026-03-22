import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

interface Session {
  id: string;
  query: string;
  response: string;
  frameUri?: string;
  timestamp: number;
}

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('sf_sessions').then((raw) => {
        if (raw) setSessions(JSON.parse(raw));
      });
    }, [])
  );

  const clearHistory = async () => {
    await AsyncStorage.removeItem('sf_sessions');
    setSessions([]);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>History</Text>
          <Text style={s.subtitle}>{sessions.length} sessions stored</Text>
        </View>
        {sessions.length > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={clearHistory}>
            <Text style={s.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
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
                <Text style={s.date}>{new Date(item.timestamp).toLocaleDateString()}</Text>
              </View>
              <Text style={s.query}>"{item.query}"</Text>
              <Text style={s.response} numberOfLines={3}>{item.response}</Text>
              {item.frameUri && (
                <Image source={{ uri: item.frameUri }} style={s.thumb} resizeMode="cover" />
              )}
              <TouchableOpacity
                style={s.replayBtn}
                onPress={() => Speech.speak(item.response, { rate: 0.95 })}
              >
                <Text style={s.replayText}>🔊 Replay</Text>
              </TouchableOpacity>
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
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E2740',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#00F5C4', letterSpacing: 1 },
  subtitle: { color: '#3A4260', fontSize: 12, marginTop: 2 },
  clearBtn: {
    backgroundColor: '#1a0d12', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,77,109,0.3)',
  },
  clearBtnText: { color: '#FF4D6D', fontSize: 13, fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#0E1320', borderRadius: 14,
    padding: 14, gap: 8, borderWidth: 1, borderColor: '#1E2740',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: '#3A4260', fontSize: 11 },
  date: { color: '#3A4260', fontSize: 11 },
  query: { color: '#5A6580', fontSize: 13, fontStyle: 'italic' },
  response: { color: '#C8CDD8', fontSize: 14, lineHeight: 20 },
  thumb: { width: '100%', height: 120, borderRadius: 8 },
  replayBtn: {
    backgroundColor: '#0f2a24', borderRadius: 8, padding: 8,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,245,196,0.2)',
  },
  replayText: { color: '#00F5C4', fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: '#E8EDF5', fontSize: 18, fontWeight: '700' },
  emptyHint: { color: '#3A4260', fontSize: 14 },
});
