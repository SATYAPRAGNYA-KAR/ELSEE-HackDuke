import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── FIX #2: Use env vars, never hardcode keys ────────────────────────────────
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const ELEVENLABS_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_KEY ?? '';
const ELEVENLABS_VOICE = '21m00Tcm4TlvDq8ikWAM';
// ── FIX #6: Use gemini-2.0-flash-lite ─────────────────────────────────────────────
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

interface Session {
  id: string;
  query: string;
  response: string;
  frameB64?: string;
  timestamp: number;
}

export default function AskScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');

  // ── FIX #3: Track camera readiness ───────────────────────────────────────
  const [isCameraReady, setIsCameraReady] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Audio.requestPermissionsAsync();
    Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    if (!camPermission?.granted) requestCamPermission();

    // Cleanup sound on unmount
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  // ── Capture frame ─────────────────────────────────────────────────────────
  const captureFrame = async (): Promise<string> => {
    // ── FIX #3: Guard against camera not ready ────────────────────────────
    if (!cameraRef.current || !isCameraReady) return '';
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: true,
        exif: false,
      });
      return photo?.base64 || '';
    } catch {
      return '';
    }
  };

  // ── FIX #5: Transcribe audio via Gemini ───────────────────────────────────
  const transcribeAudio = async (audioB64: string): Promise<string> => {
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe this audio exactly as spoken. Return only the transcribed text, nothing else.' },
              // Expo Audio records as m4a on both iOS and Android
              { inline_data: { mime_type: 'audio/m4a', data: audioB64 } },
            ],
          }],
          generationConfig: { temperature: 0.0, maxOutputTokens: 128 },
        }),
      });
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch {
      return '';
    }
  };

  // ── Recording ─────────────────────────────────────────────────────────────
  const startRecording = async () => {
    setError('');
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e: any) {
      setError('Mic error: ' + e.message);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    setIsProcessing(true);
    setError('');
    try {
      // ── FIX #5: Get URI BEFORE unloading, then transcribe ────────────────
      const uri = recordingRef.current.getURI();
      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;

      const frameB64 = await captureFrame();

      let query = 'What can you see in front of me?';
      if (uri) {
        // ── FIX #5: Read audio as base64 and send to Gemini STT ──────────
        const audioB64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        const transcribed = await transcribeAudio(audioB64);
        if (transcribed) query = transcribed;
      }

      await processQuery(query, frameB64);
    } catch (e: any) {
      setError('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Text query ────────────────────────────────────────────────────────────
  const sendTextQuery = async () => {
    if (!textInput.trim()) return;
    setIsProcessing(true);
    setError('');
    try {
      const frameB64 = await captureFrame();
      await processQuery(textInput.trim(), frameB64);
      setTextInput('');
    } catch (e: any) {
      setError('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Gemini Vision ─────────────────────────────────────────────────────────
  const processQuery = async (query: string, frameB64: string) => {
    const prompt = `You are SeeForMe, an AI assistant for visually impaired users.
The user asked: "${query}"
Analyze the image and:
1. Directly answer their question
2. Mention any visible text or signs
3. Note any important obstacles or hazards
4. Be concise — max 3 sentences, this will be spoken aloud.`;

    const parts: any[] = [{ text: prompt }];
    if (frameB64) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: frameB64 } });
    }

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
      }),
    });

    const data = await res.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Sorry, I could not analyze the scene.';

    const newSession: Session = {
      id: Date.now().toString(),
      query,
      response: responseText,
      frameB64: frameB64 || undefined,
      timestamp: Date.now(),
    };

    setSession(newSession);

    // Save to history (without frame to save storage space)
    const existing = await AsyncStorage.getItem('sf_sessions');
    const sessions: Session[] = existing ? JSON.parse(existing) : [];
    sessions.unshift({ ...newSession, frameB64: undefined });
    await AsyncStorage.setItem('sf_sessions', JSON.stringify(sessions.slice(0, 50)));

    await speakResponse(responseText);
  };

  // ── FIX #4: TTS — actually play ElevenLabs audio instead of discarding it ─
  const speakResponse = async (text: string) => {
    // Unload any previously playing sound
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    if (ELEVENLABS_KEY) {
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_KEY,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_turbo_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          }
        );

        if (res.ok) {
          // ── FIX #4: Read audio bytes and play with expo-av ───────────────
          const blob = await res.blob();
          const reader = new FileReader();
          const dataUri = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const { sound } = await Audio.Sound.createAsync(
            { uri: dataUri },
            { shouldPlay: true }
          );
          soundRef.current = sound;
          return; // ✅ ElevenLabs worked — do NOT fall through to expo-speech
        }
      } catch {
        // Fall through to expo-speech fallback below
      }
    }

    // Fallback: device TTS
    Speech.stop();
    Speech.speak(text, { rate: 0.95, pitch: 1.0 });
  };

  const replayResponse = () => {
    if (session) speakResponse(session.response);
  };

  // ── Permissions ───────────────────────────────────────────────────────────
  if (!camPermission?.granted) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.permBox}>
          <Text style={s.permIcon}>🎙</Text>
          <Text style={s.permTitle}>Camera & Mic Needed</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestCamPermission}>
            <Text style={s.permBtnText}>Grant Permissions</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Ask SeeForMe</Text>
        <Text style={s.subtitle}>Hold mic · Type · Hear the answer</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Camera preview */}
        <View style={s.cameraWrap}>
          {/* ── FIX #3: onCameraReady sets isCameraReady flag ──────────── */}
          <CameraView
            ref={cameraRef}
            style={s.camera}
            facing={facing}
            onCameraReady={() => setIsCameraReady(true)}
          />
          <TouchableOpacity
            style={s.flipBtn}
            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
          >
            <Text>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Mic button */}
        <View style={s.micSection}>
          <TouchableOpacity
            style={[s.micBtn, isRecording && s.micBtnRec, isProcessing && s.micBtnProc]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={isProcessing}
            activeOpacity={0.85}
          >
            <Text style={s.micIcon}>
              {isProcessing ? '⏳' : isRecording ? '🔴' : '🎙'}
            </Text>
          </TouchableOpacity>
          <Text style={s.micHint}>
            {isProcessing ? 'Analyzing...' : isRecording ? 'Listening... release to send' : 'Hold to speak'}
          </Text>
        </View>

        {/* Text input */}
        <View style={s.textRow}>
          <TextInput
            style={s.textInput}
            value={textInput}
            onChangeText={setTextInput}
            placeholder="Or type your question..."
            placeholderTextColor="#3A4260"
            onSubmitEditing={sendTextQuery}
            returnKeyType="send"
            editable={!isProcessing}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!textInput.trim() || isProcessing) && s.sendBtnOff]}
            onPress={sendTextQuery}
            disabled={!textInput.trim() || isProcessing}
          >
            <Text style={s.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Response */}
        {session ? (
          <View style={s.responseCard}>
            <Text style={s.responseQuery}>"{session.query}"</Text>
            {session.frameB64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${session.frameB64}` }}
                style={s.responseFrame}
                resizeMode="cover"
              />
            )}
            <Text style={s.responseText}>{session.response}</Text>
            <TouchableOpacity style={s.replayBtn} onPress={replayResponse}>
              <Text style={s.replayBtnText}>🔊  Replay Response</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🤖</Text>
            <Text style={s.emptyText}>Ask a question to see the response here</Text>
          </View>
        )}

      </ScrollView>
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
  content: { padding: 16, gap: 14 },
  cameraWrap: {
    width: '100%', height: 220, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1E2740',
    position: 'relative',
  },
  camera: { flex: 1 },
  flipBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20, padding: 8,
  },
  micSection: { alignItems: 'center', gap: 12 },
  micBtn: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#0E1320', borderWidth: 2, borderColor: '#1E2740',
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnRec: { backgroundColor: '#1a0d12', borderColor: '#FF4D6D' },
  micBtnProc: { borderColor: '#FF9F43' },
  micIcon: { fontSize: 38 },
  micHint: { color: '#5A6580', fontSize: 13 },
  textRow: { flexDirection: 'row', gap: 8 },
  textInput: {
    flex: 1, backgroundColor: '#0E1320',
    borderRadius: 12, padding: 14,
    color: '#E8EDF5', fontSize: 14,
    borderWidth: 1, borderColor: '#1E2740',
  },
  sendBtn: {
    width: 50, backgroundColor: '#00F5C4',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.3 },
  sendBtnText: { fontSize: 22, color: '#080B12', fontWeight: '800' },
  error: { color: '#FF4D6D', fontSize: 13, textAlign: 'center' },
  responseCard: {
    backgroundColor: '#0E1320', borderRadius: 16,
    padding: 16, gap: 12, borderWidth: 1, borderColor: '#1E2740',
  },
  responseQuery: { color: '#5A6580', fontSize: 13, fontStyle: 'italic' },
  responseFrame: { width: '100%', height: 180, borderRadius: 10 },
  responseText: { color: '#E8EDF5', fontSize: 15, lineHeight: 22 },
  replayBtn: {
    backgroundColor: '#0f2a24', borderRadius: 10, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,245,196,0.3)',
  },
  replayBtnText: { color: '#00F5C4', fontWeight: '700', fontSize: 14 },
  emptyCard: {
    backgroundColor: '#0E1320', borderRadius: 16, padding: 40,
    alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#1E2740',
  },
  emptyIcon: { fontSize: 44 },
  emptyText: { color: '#5A6580', fontSize: 14, textAlign: 'center' },
  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  permIcon: { fontSize: 56 },
  permTitle: { color: '#E8EDF5', fontSize: 20, fontWeight: '800' },
  permBtn: { backgroundColor: '#00F5C4', borderRadius: 12, padding: 14, paddingHorizontal: 28 },
  permBtnText: { color: '#080B12', fontWeight: '800', fontSize: 15 },
});