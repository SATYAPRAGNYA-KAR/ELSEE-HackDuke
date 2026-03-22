import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';

const { width: W } = Dimensions.get('window');

// ── Gemini config ─────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// How often to auto-analyze for obstacles (ms)
const ANALYSIS_INTERVAL = 3000;

interface Detection {
  label: string;
  position: 'left' | 'center' | 'right';
  proximity: 'very close' | 'nearby' | 'far';
  near: boolean;
}

const POS_COLORS: Record<string, string> = {
  left: '#FF4D6D',
  center: '#FF9F43',
  right: '#00D2FF',
};

export default function LiveScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [statusMsg, setStatusMsg] = useState('Press START to begin live obstacle detection');
  const cameraRef = useRef<CameraView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (analyzingRef.current || !cameraRef.current) return;
    analyzingRef.current = true;
    setIsAnalyzing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.4,
        skipProcessing: true,
      });

      if (!photo?.base64) return;

      const prompt = `You are an obstacle detection system for a blind person.
Analyze this image and identify ALL obstacles/objects.
For each object return JSON only, no explanation:
{
  "detections": [
    {
      "label": "object name",
      "position": "left" or "center" or "right",
      "proximity": "very close" or "nearby" or "far",
      "near": true or false
    }
  ],
  "summary": "one short sentence describing the most important obstacle or hazard"
}
Objects within ~2 meters = near:true. Return ONLY valid JSON.`;

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: photo.base64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
      });

      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Strip markdown fences
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      setDetections(parsed.detections || []);
      setStatusMsg(parsed.summary || 'Analysis complete');

      // Speak alerts for near objects
      const nearItems = (parsed.detections || []).filter((d: Detection) => d.near);
      if (nearItems.length > 0) {
        const alertText = nearItems
          .map((d: Detection) => `${d.label} on your ${d.position}`)
          .join(', ');
        Speech.speak(`Warning: ${alertText}`, { rate: 1.1, pitch: 1.0 });
      }

    } catch (e: any) {
      setStatusMsg('Analysis error — retrying...');
    } finally {
      analyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }, []);

  const startLiveMode = () => {
    if (!GEMINI_API_KEY) {
      Alert.alert('Missing API Key', 'Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file');
      return;
    }
    setIsLiveMode(true);
    setStatusMsg('Live mode active — analyzing every 3 seconds');
    intervalRef.current = setInterval(captureAndAnalyze, ANALYSIS_INTERVAL);
  };

  const stopLiveMode = () => {
    setIsLiveMode(false);
    setDetections([]);
    setStatusMsg('Press START to begin live obstacle detection');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    Speech.stop();
  };

  const toggleCamera = () => {
    setFacing(f => f === 'back' ? 'front' : 'back');
  };

  // ── Permissions ───────────────────────────────────────────────────────────
  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.permBox}>
          <Text style={s.permIcon}>📷</Text>
          <Text style={s.permTitle}>Camera Access Needed</Text>
          <Text style={s.permSub}>SeeForMe needs your camera to detect obstacles</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Grant Camera Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nearDetections = detections.filter(d => d.near);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>SeeForMe</Text>
        <View style={[s.badge, isLiveMode && s.badgeActive]}>
          <View style={[s.dot, isLiveMode && s.dotActive]} />
          <Text style={[s.badgeText, isLiveMode && s.badgeTextActive]}>
            {isAnalyzing ? 'ANALYZING' : isLiveMode ? 'LIVE' : 'IDLE'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Camera */}
        <View style={s.cameraWrap}>
          <CameraView
            ref={cameraRef}
            style={s.camera}
            facing={facing}
          />

          {/* Position chips overlay */}
          {isLiveMode && (
            <View style={s.chips}>
              {(['left', 'center', 'right'] as const).map((pos) => {
                const items = detections.filter(d => d.position === pos && d.near);
                return items.length > 0 ? (
                  <View key={pos} style={[s.chip, { backgroundColor: POS_COLORS[pos] + 'DD' }]}>
                    <Text style={s.chipText}>
                      {pos.toUpperCase()}{'\n'}{items.map(i => i.label).join('\n')}
                    </Text>
                  </View>
                ) : <View key={pos} style={{ flex: 1 }} />;
              })}
            </View>
          )}

          {/* Camera flip button */}
          <TouchableOpacity style={s.flipBtn} onPress={toggleCamera}>
            <Text style={s.flipText}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Status */}
        <View style={s.statusBox}>
          <Text style={s.statusText}>{statusMsg}</Text>
        </View>

        {/* Start/Stop button */}
        <TouchableOpacity
          style={[s.mainBtn, isLiveMode && s.mainBtnStop]}
          onPress={isLiveMode ? stopLiveMode : startLiveMode}
        >
          <Text style={s.mainBtnText}>
            {isLiveMode ? '⏹  STOP DETECTION' : '▶  START DETECTION'}
          </Text>
        </TouchableOpacity>

        {/* Nearby alerts */}
        {nearDetections.length > 0 && (
          <View style={s.alertBox}>
            <Text style={s.alertTitle}>⚠️  NEARBY OBSTACLES</Text>
            {nearDetections.map((d, i) => (
              <DetectionRow key={i} d={d} />
            ))}
          </View>
        )}

        {/* All detections */}
        {detections.length > 0 && (
          <>
            <Text style={s.sectionLabel}>ALL DETECTIONS</Text>
            {detections.map((d, i) => <DetectionRow key={i} d={d} />)}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function DetectionRow({ d }: { d: Detection }) {
  return (
    <View style={[s.detRow, d.near && s.detRowNear]}>
      <View style={[s.detBar, { backgroundColor: POS_COLORS[d.position] }]} />
      <View style={s.detInfo}>
        <Text style={s.detLabel}>{d.label}</Text>
        <Text style={s.detMeta}>
          {d.position.toUpperCase()} · {d.proximity}
        </Text>
      </View>
      {d.near && (
        <View style={s.nearTag}>
          <Text style={s.nearTagText}>NEAR</Text>
        </View>
      )}
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
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0E1320', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: '#1E2740',
  },
  badgeActive: { borderColor: '#00F5C4' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3A4260' },
  dotActive: { backgroundColor: '#00F5C4' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#3A4260' },
  badgeTextActive: { color: '#00F5C4' },

  content: { padding: 16, gap: 12 },

  cameraWrap: {
    width: '100%', height: W * 0.75,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#1E2740',
    position: 'relative',
  },
  camera: { flex: 1 },
  chips: {
    position: 'absolute', bottom: 8,
    left: 8, right: 8,
    flexDirection: 'row', gap: 6,
  },
  chip: {
    flex: 1, borderRadius: 8,
    padding: 6, alignItems: 'center',
  },
  chipText: {
    color: '#fff', fontSize: 9,
    fontWeight: '800', textAlign: 'center',
  },
  flipBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20, padding: 8,
  },
  flipText: { fontSize: 18 },

  statusBox: {
    backgroundColor: '#0E1320', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#1E2740',
  },
  statusText: { color: '#C8CDD8', fontSize: 13, textAlign: 'center' },

  mainBtn: {
    backgroundColor: '#00F5C4', borderRadius: 14,
    padding: 16, alignItems: 'center',
  },
  mainBtnStop: { backgroundColor: '#FF4D6D' },
  mainBtnText: { color: '#080B12', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },

  alertBox: {
    backgroundColor: '#140a0e', borderRadius: 12,
    padding: 14, borderWidth: 1,
    borderColor: 'rgba(255,77,109,0.4)', gap: 8,
  },
  alertTitle: { color: '#FF4D6D', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  sectionLabel: {
    color: '#3A4260', fontSize: 10,
    fontWeight: '700', letterSpacing: 2,
  },

  detRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0E1320', borderRadius: 10,
    padding: 12, gap: 10,
    borderWidth: 1, borderColor: '#1E2740',
    marginBottom: 6,
  },
  detRowNear: { backgroundColor: '#1a0d12', borderColor: 'rgba(255,77,109,0.3)' },
  detBar: { width: 4, height: 36, borderRadius: 2 },
  detInfo: { flex: 1 },
  detLabel: { color: '#E8EDF5', fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  detMeta: { color: '#5A6580', fontSize: 11, marginTop: 2 },
  nearTag: { backgroundColor: '#FF4D6D', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  nearTagText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  permIcon: { fontSize: 56 },
  permTitle: { color: '#E8EDF5', fontSize: 20, fontWeight: '800' },
  permSub: { color: '#5A6580', fontSize: 14, textAlign: 'center' },
  permBtn: { backgroundColor: '#00F5C4', borderRadius: 12, padding: 14, paddingHorizontal: 28 },
  permBtnText: { color: '#080B12', fontWeight: '800', fontSize: 15 },
});
