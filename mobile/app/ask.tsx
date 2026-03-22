import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GEMINI_API_KEY  = process.env.EXPO_PUBLIC_GEMINI_API_KEY  || '';
const ELEVENLABS_KEY  = process.env.EXPO_PUBLIC_ELEVENLABS_KEY  || '';
const ELEVENLABS_VOICE = process.env.EXPO_PUBLIC_ELEVENLABS_VOICE || '21m00Tcm4TlvDq8ikWAM';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_STT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

interface Session {
  id: string;
  query: string;
  response: string;
  frameUri?: string;
  timestamp: number;
}

export default function AskScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [showCamera, setShowCamera] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Audio.requestPermissionsAsync();
    Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    if (!camPermission?.granted) requestCamPermission();
  }, []);

  // ── Capture frame ───────────────────────────────────────────────────────────
  const captureFrame = async (): Promise<string> => {
    if (!cameraRef.current) return '';
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true, quality: 0.5, skipProcessing: true,
      });
      return photo?.base64 || '';
    } catch { return ''; }
  };

  // ── Recording ───────────────────────────────────────────────────────────────
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
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Capture frame at same time as audio
      const frameB64 = await captureFrame();

      // Convert audio to base64
      const audioB64 = uri
        ? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        : '';

      // STT via Gemini
      let query = 'What can you see in front of me?';
      if (audioB64) {
        query = await transcribeAudio(audioB64);
      }

      await processQuery(query, frameB64, uri);
    } catch (e: any) {
      setError('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── STT via Gemini ──────────────────────────────────────────────────────────
  const transcribeAudio = async (audioB64: string): Promise<string> => {
    try {
      const res = await fetch(GEMINI_STT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe this audio exactly as spoken. Return only the transcribed text.' },
              { inline_data: { mime_type: 'audio/mp4', data: audioB64 } },
            ],
          }],
        }),
      });
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        || 'What can you see in front of me?';
    } catch {
      return 'What can you see in front of me?';
    }
  };

  // ── Text query submit ───────────────────────────────────────────────────────
  const sendTextQuery = async () => {
    if (!textInput.trim()) return;
    setIsProcessing(true);
    setError('');
    try {
      const frameB64 = await captureFrame();
      await processQuery(textInput.trim(), frameB64, undefined);
      setTextInput('');
    } catch (e: any) {
      setError('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Main Gemini vision query ────────────────────────────────────────────────
  const processQuery = async (query: string, frameB64: string, audioUri?: string) => {
    if (!GEMINI_API_KEY) {
      Alert.alert('Missing Key', 'Set EXPO_PUBLIC_GEMINI_API_KEY in .env');
      return;
    }

    const prompt = `You are SeeForMe, an AI assistant for visually impaired users.
The user asked: "${query}"

Analyze the image and:
1. Directly answer their question
2. Mention any visible text or signs (OCR)
3. Note any important obstacles or hazards
4. Be concise — this will be spoken aloud (max 3 sentences)
Start with the most important safety information first.`;

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

    // Save photo to filesystem for display
    let savedUri: string | undefined;
    if (frameB64) {
      savedUri = FileSystem.cacheDirectory + `frame_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(savedUri, frameB64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    const newSession: Session = {
      id: Date.now().toString(),
      query,
      response: responseText,
      frameUri: savedUri,
      timestamp: Date.now(),
    };

    setSession(newSession);

    // Save to AsyncStorage for history
    const existing = await AsyncStorage.getItem('sf_sessions');
    const sessions: Session[] = existing ? JSON.parse(existing) : [];
    sessions.unshift(newSession);
    await AsyncStorage.setItem('sf_sessions', JSON.stringify(sessions.slice(0, 50)));

    // Speak response — ElevenLabs if key available, else expo-speech
    await speakResponse(responseText);
  };

  // ── TTS ─────────────────────────────────────────────────────────────────────
  const speakResponse = async (text: string) => {
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
        const audioBlob = await res.blob();
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          const audioPath = FileSystem.cacheDirectory + 'response.mp3';
          await FileSystem.writeAsStringAsync(audioPath, base64Audio, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await soundRef.current?.unloadAsync();
          const { sound } = await Audio.Sound.createAsync(
            { uri: audioPath }, { shouldPlay: true }
          );
          soundRef.current = sound;
        };
        return;
      } catch {
        // Fall through to expo-speech
      }
    }
    // Fallback: expo-speech (free, no API key needed)
    Speech.stop();
    Speech.speak(text, { rate: 0.95, pitch: 1.0 });
  };

  const replayResponse = async () => {
    if (session) await speakResponse(session.response);
  };

  // ── Permissions ─────────────────────────────────────────────────────────────
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

        {/* Live camera preview */}
        <View style={s.cameraWrap}>
          <CameraView
            ref={cameraRef}
            style={s.camera}
            facing={facing}
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
            style={[
              s.micBtn,
              isRecording && s.micBtnRec,
              isProcessing && s.micBtnProc,
            ]}
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
            {session.frameUri && (
              <Image source={{ uri: session.frameUri }} style={s.responseFrame} resizeMode="cover" />
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
