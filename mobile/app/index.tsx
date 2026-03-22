import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: W } = Dimensions.get('window');

const BACKEND_WS = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:8000';

interface Obstacle {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  position: 'left' | 'center' | 'right';
  depth_score: number;
  near: boolean;
}

const POS_COLORS: Record<string, string> = {
  left: '#FF4D6D',
  center: '#FF9F43',
  right: '#00D2FF',
};

export default function LiveScreen() {
  const [isLive, setIsLive] = useState(false);
  const [frameB64, setFrameB64] = useState('');
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const wsRef = useRef<WebSocket | null>(null);

  // Pulse animation for live dot
  useEffect(() => {
    if (isLive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isLive]);

  // WebSocket connection
  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`${BACKEND_WS}/ws/dashboard`);
      wsRef.current = ws;

      ws.onopen = () => setIsLive(true);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'obstacles') {
            setFrameB64(data.frame_b64 || '');
            setObstacles(data.obstacles || []);
          }
        } catch {}
      };
      ws.onclose = () => {
        setIsLive(false);
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => wsRef.current?.close();
  }, []);

  const nearObs = obstacles.filter((o) => o.near);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>SeeForMe</Text>
        <View style={[s.liveBadge, isLive && s.liveBadgeActive]}>
          <Animated.View style={[s.liveDot, isLive && s.liveDotActive, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={[s.liveText, isLive && s.liveTextActive]}>
            {isLive ? 'LIVE' : 'WAITING'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Camera feed */}
        <View style={s.feedWrap}>
          {frameB64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${frameB64}` }}
              style={s.feedImg}
              resizeMode="cover"
            />
          ) : (
            <View style={s.feedPlaceholder}>
              <Text style={s.feedIcon}>📷</Text>
              <Text style={s.feedHint}>Waiting for Pi/Jetson feed...</Text>
            </View>
          )}

          {/* Position chips */}
          <View style={s.chips}>
            {(['left', 'center', 'right'] as const).map((pos) => {
              const items = obstacles.filter((o) => o.position === pos && o.near);
              return items.length > 0 ? (
                <View key={pos} style={[s.chip, { backgroundColor: POS_COLORS[pos] + 'CC' }]}>
                  <Text style={s.chipText}>
                    {pos.toUpperCase()}{'\n'}{items.map((i) => i.label).join(', ')}
                  </Text>
                </View>
              ) : <View key={pos} style={s.chipEmpty} />;
            })}
          </View>
        </View>

        {/* Nearby alert box */}
        {nearObs.length > 0 && (
          <View style={s.alertBox}>
            <Text style={s.alertTitle}>⚠️  NEARBY OBSTACLES</Text>
            {nearObs.map((o, i) => <ObsRow key={i} obs={o} highlighted />)}
          </View>
        )}

        {/* All detections */}
        <Text style={s.sectionLabel}>ALL DETECTIONS</Text>
        {obstacles.length === 0 ? (
          <View style={s.clearBox}>
            <Text style={s.clearIcon}>✅</Text>
            <Text style={s.clearText}>{isLive ? 'Path clear' : 'Connecting...'}</Text>
          </View>
        ) : (
          obstacles.map((o, i) => <ObsRow key={i} obs={o} />)
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function ObsRow({ obs, highlighted = false }: { obs: Obstacle; highlighted?: boolean }) {
  return (
    <View style={[s.obsRow, highlighted && s.obsRowAlert]}>
      <View style={[s.obsBar, { backgroundColor: POS_COLORS[obs.position] }]} />
      <View style={s.obsInfo}>
        <Text style={s.obsLabel}>{obs.label}</Text>
        <Text style={s.obsMeta}>
          {obs.position.toUpperCase()} · {Math.round(obs.depth_score * 100)}% proximity · {Math.round(obs.confidence * 100)}% conf
        </Text>
      </View>
      {obs.near && <View style={s.nearTag}><Text style={s.nearTagText}>NEAR</Text></View>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080B12' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E2740',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#00F5C4', letterSpacing: 1 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0E1320', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: '#1E2740',
  },
  liveBadgeActive: { borderColor: '#00F5C4' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3A4260' },
  liveDotActive: { backgroundColor: '#00F5C4' },
  liveText: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#3A4260' },
  liveTextActive: { color: '#00F5C4' },

  content: { padding: 16, gap: 12 },

  feedWrap: {
    width: '100%', height: W * 0.6,
    backgroundColor: '#0E1320', borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1E2740',
  },
  feedImg: { width: '100%', height: '100%' },
  feedPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  feedIcon: { fontSize: 44, opacity: 0.4 },
  feedHint: { color: '#3A4260', fontSize: 13 },

  chips: {
    position: 'absolute', bottom: 8, left: 8, right: 8,
    flexDirection: 'row', gap: 6,
  },
  chip: { flex: 1, borderRadius: 8, padding: 6, alignItems: 'center' },
  chipEmpty: { flex: 1 },
  chipText: { color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center' },

  alertBox: {
    backgroundColor: '#140a0e',
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,77,109,0.4)',
    gap: 8,
  },
  alertTitle: { color: '#FF4D6D', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  sectionLabel: { color: '#3A4260', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 4 },

  obsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0E1320', borderRadius: 10,
    padding: 12, gap: 10,
    borderWidth: 1, borderColor: '#1E2740',
    marginBottom: 6,
  },
  obsRowAlert: { backgroundColor: '#1a0d12', borderColor: 'rgba(255,77,109,0.3)' },
  obsBar: { width: 4, height: 36, borderRadius: 2 },
  obsInfo: { flex: 1 },
  obsLabel: { color: '#E8EDF5', fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  obsMeta: { color: '#5A6580', fontSize: 11, marginTop: 2 },
  nearTag: { backgroundColor: '#FF4D6D', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  nearTagText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  clearBox: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  clearIcon: { fontSize: 44 },
  clearText: { color: '#00F5C4', fontSize: 16, fontWeight: '700' },
});
