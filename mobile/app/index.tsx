import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import type { RecordingOptions } from 'expo-av/build/Audio/Recording.types';
import {
  AndroidOutputFormat,
  AndroidAudioEncoder,
  IOSOutputFormat,
  IOSAudioQuality,
} from 'expo-av/build/Audio/RecordingConstants';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';

const { width: W } = Dimensions.get('window');

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/** How often to run the yes/no hazard check (still frame → Gemini). */
const CAUTION_CHECK_INTERVAL_MS = 3000;

const SPEECH_DB = -38;
const LOUD_TICKS_TO_SWITCH_ASK = 4;
const CAUTION_DEBOUNCE_MS = 4500;

function getLiveSpeechRecordingOptions(): RecordingOptions {
  const iosWav: RecordingOptions['ios'] = {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  };
  const iosM4a: RecordingOptions['ios'] = {
    extension: '.m4a',
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: IOSAudioQuality.MAX,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  };
  return {
    isMeteringEnabled: true,
    ios: Platform.OS === 'ios' ? iosWav : iosM4a,
    android: {
      extension: '.m4a',
      outputFormat: AndroidOutputFormat.MPEG_4,
      audioEncoder: AndroidAudioEncoder.AAC,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 64000,
    },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
  };
}

/** Single-word model reply: YES → speak "caution" (debounced). */
function textSaysCautionNeeded(raw: string): boolean {
  const t = raw.replace(/```[\s\S]*?```/g, ' ').trim().toUpperCase();
  if (/^\s*YES\b/.test(t)) return true;
  if (/\bYES\b/.test(t) && !/^\s*NO\b/.test(t)) return true;
  return false;
}

export default function LiveScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Press START for live preview and path checks');
  const cameraRef = useRef<CameraView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkingRef = useRef(false);
  const lastCautionAtRef = useRef(0);
  const liveVadRef = useRef<Audio.Recording | null>(null);
  const loudTicksRef = useRef(0);
  const liveNavigatingRef = useRef(false);

  const stopLiveVadRecording = useCallback(async () => {
    const rec = liveVadRef.current;
    liveVadRef.current = null;
    if (!rec) return;
    try {
      rec.setOnRecordingStatusUpdate(null);
      await rec.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      void stopLiveVadRecording();
    };
  }, [stopLiveVadRecording]);

  const runCautionCheckOnly = useCallback(async () => {
    if (checkingRef.current || !cameraRef.current || liveNavigatingRef.current) return;
    if (!GEMINI_API_KEY) return;
    checkingRef.current = true;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.35,
        skipProcessing: true,
        shutterSound: false,
      });

      if (!photo?.base64) return;

      const prompt = `Answer STRICTLY with one token:
        YES or NO.

        Do NOT add any other words, punctuation, or explanation.

        Image:
        Is there an obstacle within 2 meters directly ahead?`;

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
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        }),
      });

      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log("Gemini raw output:", raw);

      if (textSaysCautionNeeded(raw)) {
        const now = Date.now();
        if (now - lastCautionAtRef.current >= CAUTION_DEBOUNCE_MS) {
          lastCautionAtRef.current = now;
          Speech.speak('caution', { rate: 1.0, pitch: 1.0 });
        }
      }
    } catch {
      /* ignore — next tick retries */
    } finally {
      checkingRef.current = false;
    }
  }, []);

  const goToAskFromVoice = useCallback(() => {
    if (liveNavigatingRef.current) return;
    liveNavigatingRef.current = true;
    Speech.stop();
    void stopLiveVadRecording();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsLiveMode(false);
    setStatusMsg('Press START for live preview and path checks');
    router.push('/ask');
    setTimeout(() => {
      liveNavigatingRef.current = false;
    }, 500);
  }, [router, stopLiveVadRecording]);

  useEffect(() => {
    if (!isLiveMode) {
      void stopLiveVadRecording();
      loudTicksRef.current = 0;
      return;
    }

    let cancelled = false;

    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setStatusMsg(
          'Live: allow microphone in Settings to switch to Ask by speaking.',
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      await stopLiveVadRecording();
      loudTicksRef.current = 0;

      try {
        const { recording } = await Audio.Recording.createAsync(
          getLiveSpeechRecordingOptions(),
          (st) => {
            if (!st.isRecording || liveNavigatingRef.current) return;
            const db = st.metering ?? -160;
            if (db > SPEECH_DB) {
              loudTicksRef.current += 1;
              if (loudTicksRef.current >= LOUD_TICKS_TO_SWITCH_ASK) {
                goToAskFromVoice();
              }
            } else {
              loudTicksRef.current = 0;
            }
          },
          100
        );
        if (cancelled) {
          try {
            await recording.stopAndUnloadAsync();
          } catch {
            /* ignore */
          }
          return;
        }
        liveVadRef.current = recording;
      } catch {
        setStatusMsg((prev) => `${prev} — Mic busy; tap Ask to speak.`);
      }
    })();

    return () => {
      cancelled = true;
      void stopLiveVadRecording();
    };
  }, [isLiveMode, goToAskFromVoice, stopLiveVadRecording]);

  const startLiveMode = () => {
    if (!GEMINI_API_KEY) {
      Alert.alert('Missing API Key', 'Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file');
      return;
    }
    lastCautionAtRef.current = 0;
    liveNavigatingRef.current = false;
    setIsLiveMode(true);
    setStatusMsg('Live — preview only; “caution” when the path may be blocked. Speak to open Ask.');
    intervalRef.current = setInterval(runCautionCheckOnly, CAUTION_CHECK_INTERVAL_MS);
    void runCautionCheckOnly();
  };

  const stopLiveMode = () => {
    setIsLiveMode(false);
    setStatusMsg('Press START for live preview and path checks');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    Speech.stop();
    void stopLiveVadRecording();
  };

  const toggleCamera = () => {
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  };

  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.permBox}>
          <Text style={s.permIcon}>📷</Text>
          <Text style={s.permTitle}>Camera Access Needed</Text>
          <Text style={s.permSub}>SeeForMe needs your camera for live preview</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Grant Camera Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>SeeForMe</Text>
        <View style={[s.badge, isLiveMode && s.badgeActive]}>
          <View style={[s.dot, isLiveMode && s.dotActive]} />
          <Text style={[s.badgeText, isLiveMode && s.badgeTextActive]}>
            {isLiveMode ? 'LIVE' : 'IDLE'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.cameraWrap}>
          <CameraView ref={cameraRef} style={s.camera} facing={facing} />
          <View style={s.liveVideoBadge}>
            <Text style={s.liveVideoBadgeText}>LIVE</Text>
            <Text style={s.liveVideoSub}>Real-time preview</Text>
          </View>
          {isLiveMode && (
            <View style={s.askHint}>
              <Text style={s.askHintText}>Speak to switch to Ask</Text>
            </View>
          )}

          <TouchableOpacity style={s.flipBtn} onPress={toggleCamera}>
            <Text style={s.flipText}>🔄</Text>
          </TouchableOpacity>
        </View>

        <View style={s.statusBox}>
          <Text style={s.statusText}>{statusMsg}</Text>
        </View>

        <TouchableOpacity
          style={[s.mainBtn, isLiveMode && s.mainBtnStop]}
          onPress={isLiveMode ? stopLiveMode : startLiveMode}
        >
          <Text style={s.mainBtnText}>
            {isLiveMode ? '⏹  STOP' : '▶  START'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080B12' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2740',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#00F5C4', letterSpacing: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0E1320',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#1E2740',
  },
  badgeActive: { borderColor: '#00F5C4' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3A4260' },
  dotActive: { backgroundColor: '#00F5C4' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#3A4260' },
  badgeTextActive: { color: '#00F5C4' },

  content: { padding: 16, gap: 12 },

  cameraWrap: {
    width: '100%',
    height: W * 0.75,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1E2740',
    position: 'relative',
  },
  camera: { flex: 1 },
  liveVideoBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,245,196,0.5)',
  },
  liveVideoBadgeText: {
    color: '#00F5C4',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  liveVideoSub: { color: '#9aa3b5', fontSize: 9, marginTop: 2 },
  askHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  askHintText: { color: '#E8EDF5', fontSize: 11, fontWeight: '600' },
  flipBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  flipText: { fontSize: 18 },

  statusBox: {
    backgroundColor: '#0E1320',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E2740',
  },
  statusText: { color: '#C8CDD8', fontSize: 13, textAlign: 'center' },

  mainBtn: {
    backgroundColor: '#00F5C4',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  mainBtnStop: { backgroundColor: '#FF4D6D' },
  mainBtnText: { color: '#080B12', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },

  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  permIcon: { fontSize: 56 },
  permTitle: { color: '#E8EDF5', fontSize: 20, fontWeight: '800' },
  permSub: { color: '#5A6580', fontSize: 14, textAlign: 'center' },
  permBtn: { backgroundColor: '#00F5C4', borderRadius: 12, padding: 14, paddingHorizontal: 28 },
  permBtnText: { color: '#080B12', fontWeight: '800', fontSize: 15 },
});
