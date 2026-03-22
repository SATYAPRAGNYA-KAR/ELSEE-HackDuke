import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

export default function SettingsScreen() {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const elevenlabsKey = process.env.EXPO_PUBLIC_ELEVENLABS_KEY;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <ToggleRow label="Voice Responses" value={voiceEnabled} onChange={setVoiceEnabled} />
        <ToggleRow label="Proximity Alerts" value={alertsEnabled} onChange={setAlertsEnabled} />

        <Text style={s.sectionLabel}>API STATUS</Text>
        <StatusRow label="Gemini API" ok={!!geminiKey} />
        <StatusRow label="ElevenLabs TTS" ok={!!elevenlabsKey} note="Falls back to device TTS" />

        <Text style={s.sectionLabel}>HOW TO USE</Text>
        <View style={s.infoCard}>
          <Text style={s.infoText}>
            👁  <Text style={s.infoBold}>Live tab</Text> — Press START to begin real-time obstacle detection. Camera analyzes surroundings every 3 seconds and speaks warnings for nearby objects.
          </Text>
          <Text style={s.infoText}>
            🎙  <Text style={s.infoBold}>Ask tab</Text> — Hold the mic button and ask a question like "What's in front of me?" or "What does that sign say?". SeeForMe captures the scene and speaks the answer.
          </Text>
          <Text style={s.infoText}>
            📋  <Text style={s.infoBold}>History tab</Text> — Browse all past queries with captured frames and replay responses.
          </Text>
        </View>

        <Text style={s.sectionLabel}>POWERED BY</Text>
        <View style={s.techWrap}>
          {[
            'Gemini 1.5 Flash', 'ElevenLabs TTS', 'expo-camera',
            'expo-av', 'expo-speech', 'YOLOv8 (Pi/Jetson)',
            'MiDaS Depth', 'FastAPI Backend', 'MongoDB Atlas',
            'Snowflake', 'Auth0', 'Cloudflare',
          ].map((t) => (
            <View key={t} style={s.techTag}>
              <Text style={s.techText}>{t}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Switch
        value={value} onValueChange={onChange}
        trackColor={{ false: '#1E2740', true: 'rgba(0,245,196,0.3)' }}
        thumbColor={value ? '#00F5C4' : '#3A4260'}
      />
    </View>
  );
}

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <View style={s.row}>
      <View>
        <Text style={s.rowLabel}>{label}</Text>
        {note && <Text style={s.rowNote}>{note}</Text>}
      </View>
      <View style={[s.statusDot, ok ? s.statusOk : s.statusMissing]}>
        <Text style={s.statusText}>{ok ? '✓ SET' : '✗ MISSING'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080B12' },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E2740',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#00F5C4', letterSpacing: 1 },
  content: { padding: 20, gap: 8 },
  sectionLabel: {
    color: '#3A4260', fontSize: 10, fontWeight: '700',
    letterSpacing: 2, marginTop: 12, marginBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0E1320', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: '#1E2740',
  },
  rowLabel: { color: '#C8CDD8', fontSize: 14 },
  rowNote: { color: '#3A4260', fontSize: 11, marginTop: 2 },
  statusDot: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  statusOk: { backgroundColor: 'rgba(0,245,196,0.15)' },
  statusMissing: { backgroundColor: 'rgba(255,77,109,0.15)' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#C8CDD8' },
  infoCard: {
    backgroundColor: '#0E1320', borderRadius: 12,
    padding: 16, gap: 12, borderWidth: 1, borderColor: '#1E2740',
  },
  infoText: { color: '#5A6580', fontSize: 13, lineHeight: 20 },
  infoBold: { color: '#C8CDD8', fontWeight: '700' },
  techWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  techTag: {
    backgroundColor: '#0E1320', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1E2740',
  },
  techText: { color: '#5A6580', fontSize: 12 },
});
