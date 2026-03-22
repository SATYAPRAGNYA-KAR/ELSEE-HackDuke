import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface Session {
  id: string;
  query: string;
  text_response: string;
  audio_response_b64?: string;
  annotated_frame_b64?: string;
  timestamp: number;
}

export default function AskScreen() {
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    Audio.requestPermissionsAsync();
    Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setError('');
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
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      const audioB64 = uri
        ? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        : '';
      await sendQuery({ audio_b64: audioB64 });
    } catch (e: any) {
      setError('Recording error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const sendTextQuery = async () => {
    if (!textInput.trim()) return;
    setIsProcessing(true);
    setError('');
    try {
      await sendQuery({ text_query: textInput.trim() });
      setTextInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendQuery = async (payload: { audio_b64?: string; text_query?: string }) => {
    const token = ''; // TODO: attach Auth0 token
    const resp = await fetch(`${BACKEND}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...payload, obstacles: [] }),
    });
    if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
    const data = await resp.json();
    const newSession: Session = {
      id: Date.now().toString(),
      query: data.query,
      text_response: data.text_response,
      audio_response_b64: data.audio_response_b64,
      annotated_frame_b64: data.annotated_frame_b64,
      timestamp: Date.now(),
    };
    setSession(newSession);
    if (data.audio_response_b64) await playAudio(data.audio_response_b64);
  };

  const playAudio = async (b64: string) => {
    try {
      await soundRef.current?.unloadAsync();
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mpeg;base64,${b64}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
    } catch (e) {
      console.warn('Audio error:', e);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Ask SeeForMe</Text>
        <Text style={s.subtitle}>Hold mic · Type · Get spoken answer</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Mic button */}
        <View style={s.micSection}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[
                s.micBtn,
                isRecording && s.micBtnRecording,
                isProcessing && s.micBtnProcessing,
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
          </Animated.View>
          <Text style={s.micHint}>
            {isProcessing
              ? 'Processing...'
              : isRecording
              ? 'Listening... release to send'
              : 'Hold to speak'}
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
            style={[s.sendBtn, (!textInput.trim() || isProcessing) && s.sendBtnDisabled]}
            onPress={sendTextQuery}
            disabled={!textInput.trim() || isProcessing}
          >
            <Text style={s.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Response card */}
        {session ? (
          <View style={s.responseCard}>
            <Text style={s.responseQuery}>"{session.query}"</Text>
            {session.annotated_frame_b64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${session.annotated_frame_b64}` }}
                style={s.responseFrame}
                resizeMode="cover"
              />
            )}
            <Text style={s.responseText}>{session.text_response}</Text>
            {session.audio_response_b64 && (
              <TouchableOpacity
                style={s.replayBtn}
                onPress={() => playAudio(session.audio_response_b64!)}
              >
                <Text style={s.replayBtnText}>🔊  Replay Audio</Text>
              </TouchableOpacity>
            )}
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
  content: { padding: 20, gap: 16 },

  micSection: { alignItems: 'center', paddingVertical: 16, gap: 14 },
  micBtn: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#0E1320',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#1E2740',
  },
  micBtnRecording: { backgroundColor: '#1a0d12', borderColor: '#FF4D6D' },
  micBtnProcessing: { borderColor: '#FF9F43' },
  micIcon: { fontSize: 40 },
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
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: { fontSize: 22, color: '#080B12', fontWeight: '800' },

  error: { color: '#FF4D6D', fontSize: 13, textAlign: 'center' },

  responseCard: {
    backgroundColor: '#0E1320', borderRadius: 16,
    padding: 16, gap: 12,
    borderWidth: 1, borderColor: '#1E2740',
  },
  responseQuery: { color: '#5A6580', fontSize: 13, fontStyle: 'italic' },
  responseFrame: { width: '100%', height: 200, borderRadius: 10 },
  responseText: { color: '#E8EDF5', fontSize: 15, lineHeight: 22 },
  replayBtn: {
    backgroundColor: '#0f2a24', borderRadius: 10, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,245,196,0.3)',
  },
  replayBtnText: { color: '#00F5C4', fontWeight: '700', fontSize: 14 },

  emptyCard: {
    backgroundColor: '#0E1320', borderRadius: 16, padding: 40,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#1E2740',
  },
  emptyIcon: { fontSize: 44 },
  emptyText: { color: '#5A6580', fontSize: 14, textAlign: 'center' },
});
