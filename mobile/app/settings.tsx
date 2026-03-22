import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export default function SettingsScreen() {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <ToggleRow label="Voice Responses" value={voiceEnabled} onChange={setVoiceEnabled} />
        <ToggleRow label="Proximity Alerts" value={alertsEnabled} onChange={setAlertsEnabled} />

        <Text style={s.sectionLabel}>CONNECTION</Text>
        <InfoRow label="Backend URL" value={BACKEND} />
        <InfoRow label="WebSocket" value={BACKEND.replace('http', 'ws')} />

        <Text style={s.sectionLabel}>POWERED BY</Text>
        <View style={s.techWrap}>
          {[
            'YOLOv8', 'MiDaS', 'Gemini 1.5 Flash',
            'ElevenLabs', 'Auth0', 'MongoDB Atlas',
            'Snowflake', 'Cloudflare', 'DigitalOcean',
            'FastAPI', 'ONNX Runtime', 'TensorRT',
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
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#1E2740', true: 'rgba(0,245,196,0.3)' }}
        thumbColor={value ? '#00F5C4' : '#3A4260'}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
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
  rowValue: { color: '#5A6580', fontSize: 12, maxWidth: '55%', textAlign: 'right' },
  techWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  techTag: {
    backgroundColor: '#0E1320', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1E2740',
  },
  techText: { color: '#5A6580', fontSize: 12 },
});
