import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Image, Alert,
  Platform, Switch,
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useRemoteConfig } from '../context/RemoteConfigContext';

const GEMINI_API_KEY  = process.env.EXPO_PUBLIC_GEMINI_API_KEY  || '';
const ELEVENLABS_KEY  = process.env.EXPO_PUBLIC_ELEVENLABS_KEY  || '';
const ELEVENLABS_VOICE = process.env.EXPO_PUBLIC_ELEVENLABS_VOICE || '21m00Tcm4TlvDq8ikWAM';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_STT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const DEV_SYNC_SECRET = process.env.EXPO_PUBLIC_DEV_SYNC_SECRET || '';

/** Saved on device for pipelines that expect `query.wav` (iOS: PCM WAV; Android: AAC in .m4a bytes copied to this name). */
const QUERY_WAV_FILENAME = 'query.wav';

function fileUriForUpload(uri: string): string {
  if (Platform.OS === 'android' && uri && !uri.startsWith('file://') && !uri.startsWith('content://')) {
    return `file://${uri}`;
  }
  return uri;
}

async function uploadRecordingToDevMachine(
  syncBase: string,
  localAudioUri: string,
  frameB64?: string,
): Promise<void> {
  if (!syncBase) return;
  const url = `${syncBase}/api/dev/query-wav`;
  const form = new FormData();
  const audioUri = fileUriForUpload(localAudioUri);
  form.append('file', {
    uri: audioUri,
    name: QUERY_WAV_FILENAME,
    type: 'audio/wav',
  } as any);
  if (frameB64) {
    const framePath = `${FileSystem.cacheDirectory ?? ''}dev_sync_frame.jpg`;
    await FileSystem.writeAsStringAsync(framePath, frameB64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    form.append('frame', {
      uri: fileUriForUpload(framePath),
      name: 'test.jpg',
      type: 'image/jpeg',
    } as any);
  }
  const headers: HeadersInit = {};
  if (DEV_SYNC_SECRET) (headers as Record<string, string>)['X-Dev-Sync-Key'] = DEV_SYNC_SECRET;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body: form, headers, signal: ctrl.signal });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Dev sync timed out (45s)' : (e?.message || 'Network request failed');
    throw new Error(
      `${msg}. Use your Mac’s LAN IP (not localhost), same Wi‑Fi, run ./backend/run_dev_sync.sh, and rebuild after enabling HTTP in app.json (Android cleartext).`,
    );
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dev sync ${res.status}: ${text.slice(0, 120)}`);
  }
}

const SPEECH_DB = -38;
const SILENCE_DB = -42;
const LOUD_TICKS_TO_START = 3;
const SILENCE_END_MS = 1400;
const MIN_UTTERANCE_MS = 800;
const MAX_LISTEN_MS = 50000;

/** Plain text from Gemini `generateContent` JSON (concatenates all `parts`). */
function textFromGeminiResult(data: unknown): string {
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]
    ?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
}

function getSpeechRecordingOptions(): RecordingOptions {
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

interface Session {
  id: string;
  query: string;
  response: string;
  frameUri?: string;
  timestamp: number;
}

export default function AskScreen() {
  const remote = useRemoteConfig();
  const devSyncBase = (remote.dev_sync_url || process.env.EXPO_PUBLIC_DEV_SYNC_URL || '').replace(
    /\/$/,
    '',
  );

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [autoListen, setAutoListen] = useState(true);
  const [vadPhase, setVadPhase] = useState<'idle' | 'listening' | 'capturing'>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const vadRecordingRef = useRef<Audio.Recording | null>(null);
  const manualRecordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const vadStateRef = useRef({
    speechStarted: false,
    loudTicks: 0,
    quietSinceMs: null as number | null,
  });
  const vadFinishingRef = useRef(false);
  const autoListenRef = useRef(true);
  const isProcessingRef = useRef(false);
  const startVadSessionRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    autoListenRef.current = autoListen;
  }, [autoListen]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

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

  const queryWavUri = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}${QUERY_WAV_FILENAME}`;

  const stopVadRecordingClean = async () => {
    const rec = vadRecordingRef.current;
    vadRecordingRef.current = null;
    if (!rec) return;
    try {
      rec.setOnRecordingStatusUpdate(null);
      await rec.stopAndUnloadAsync();
    } catch {
      /* ignore */
    }
  };

  startVadSessionRef.current = async () => {
    if (!autoListenRef.current || vadFinishingRef.current || isProcessingRef.current) return;
    await stopVadRecordingClean();
    await Speech.stop();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    vadStateRef.current = { speechStarted: false, loudTicks: 0, quietSinceMs: null };
    setVadPhase('listening');

    try {
      const { recording } = await Audio.Recording.createAsync(
        getSpeechRecordingOptions(),
        (status) => {
          if (!status.isRecording || vadFinishingRef.current || isProcessingRef.current) return;
          const db = status.metering ?? -160;
          const dur = status.durationMillis;
          const st = vadStateRef.current;

          if (!st.speechStarted) {
            if (db > SPEECH_DB) st.loudTicks += 1;
            else st.loudTicks = 0;
            if (st.loudTicks >= LOUD_TICKS_TO_START) {
              st.speechStarted = true;
              setVadPhase('capturing');
            }
            if (dur > MAX_LISTEN_MS && !st.speechStarted) {
              void restartVadAmbient();
            }
          } else {
            if (db >= SILENCE_DB) st.quietSinceMs = null;
            else if (st.quietSinceMs == null) st.quietSinceMs = Date.now();
            else if (
              Date.now() - st.quietSinceMs > SILENCE_END_MS
              && dur > MIN_UTTERANCE_MS
            ) {
              void completeVadUtterance();
            }
            if (dur > MAX_LISTEN_MS) void completeVadUtterance();
          }
        },
        100
      );
      vadRecordingRef.current = recording;
    } catch (e: any) {
      setError('Mic error: ' + e.message);
      setVadPhase('idle');
    }
  };

  const restartVadAmbient = async () => {
    if (vadFinishingRef.current) return;
    await stopVadRecordingClean();
    vadStateRef.current = { speechStarted: false, loudTicks: 0, quietSinceMs: null };
    if (autoListenRef.current && !isProcessingRef.current) {
      await startVadSessionRef.current();
    }
  };

  const completeVadUtterance = async () => {
    if (vadFinishingRef.current) return;
    vadFinishingRef.current = true;
    const rec = vadRecordingRef.current;
    vadRecordingRef.current = null;
    if (!rec) {
      vadFinishingRef.current = false;
      return;
    }
    try {
      rec.setOnRecordingStatusUpdate(null);
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) {
        vadFinishingRef.current = false;
        if (autoListenRef.current) await startVadSessionRef.current();
        return;
      }

      await FileSystem.copyAsync({ from: uri, to: queryWavUri });

      const frameB64 = await captureFrame();

      try {
        await uploadRecordingToDevMachine(devSyncBase, queryWavUri, frameB64 || undefined);
      } catch (syncErr: any) {
        if (devSyncBase) {
          const msg = syncErr?.message || 'Dev sync failed';
          setError((prev) => (prev ? `${prev} | ${msg}` : msg));
        }
      }
      const audioB64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime = uri.endsWith('.wav') ? 'audio/wav' : 'audio/mp4';

      Speech.stop();
      setIsProcessing(true);
      setVadPhase('idle');
      const query = await transcribeAudio(audioB64, mime);
      await processQuery(query, frameB64, queryWavUri);
    } catch (e: any) {
      setError('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
      vadFinishingRef.current = false;
    }
  };

  useEffect(() => {
    if (!camPermission?.granted || !autoListen || isProcessing) {
      void stopVadRecordingClean();
      setVadPhase('idle');
      return;
    }
    void startVadSessionRef.current();
    return () => {
      void stopVadRecordingClean();
    };
  }, [camPermission?.granted, autoListen, isProcessing]);

  // ── Manual hold-to-talk (when auto is off) ─────────────────────────────────
  const startManualRecording = async () => {
    if (autoListen) return;
    setError('');
    try {
      await Speech.stop();
      await stopVadRecordingClean();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      manualRecordingRef.current = recording;
      setIsRecording(true);
    } catch (e: any) {
      setError('Mic error: ' + e.message);
    }
  };

  const stopManualRecording = async () => {
    if (autoListen) return;
    if (!manualRecordingRef.current) return;
    setIsRecording(false);
    setIsProcessing(true);
    setError('');
    try {
      await manualRecordingRef.current.stopAndUnloadAsync();
      const uri = manualRecordingRef.current.getURI();
      manualRecordingRef.current = null;

      const frameB64 = await captureFrame();

      if (uri) {
        await FileSystem.copyAsync({ from: uri, to: queryWavUri });
        try {
          await uploadRecordingToDevMachine(devSyncBase, queryWavUri, frameB64 || undefined);
        } catch (syncErr: any) {
          if (devSyncBase) {
            const msg = syncErr?.message || 'Dev sync failed';
            setError((prev) => (prev ? `${prev} | ${msg}` : msg));
          }
        }
      }

      const audioB64 = uri
        ? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        : '';

      let query = 'What can you see in front of me?';
      if (audioB64) {
        const mime = uri?.endsWith('.wav') ? 'audio/wav' : 'audio/mp4';
        query = await transcribeAudio(audioB64, mime);
      }

      await processQuery(query, frameB64, uri ? queryWavUri : undefined);
    } catch (e: any) {
      setError('Error: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── STT via Gemini ──────────────────────────────────────────────────────────
  const transcribeAudio = async (audioB64: string, mime: string = 'audio/mp4'): Promise<string> => {
    try {
      const res = await fetch(GEMINI_STT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Transcribe this audio exactly as spoken. Return only the transcribed text.' },
              { inline_data: { mime_type: mime, data: audioB64 } },
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
    const geminiResult = textFromGeminiResult(data);
    const responseText =
      geminiResult || 'Sorry, I could not analyze the scene.';

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

    // Speak Gemini output verbatim (same string as on screen)
    await speakGeminiOutput(responseText);
  };

  // ── TTS: Gemini answer only (ElevenLabs or expo-speech), await playback ─────
  const speakGeminiOutput = async (text: string): Promise<void> => {
    const t = (text || '').trim();
    if (!t) return;

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
              text: t,
              model_id: 'eleven_turbo_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            }),
          }
        );
        if (!res.ok) throw new Error('ElevenLabs TTS failed');
        const audioBlob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('read blob'));
          reader.readAsDataURL(audioBlob);
        });
        const base64Audio = dataUrl.split(',')[1];
        const audioPath = `${FileSystem.cacheDirectory}gemini_answer_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(audioPath, base64Audio, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await soundRef.current?.unloadAsync();
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioPath },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        await new Promise<void>((resolve) => {
          const safety = setTimeout(() => resolve(), 120_000);
          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) {
              clearTimeout(safety);
              resolve();
            }
          });
        });
        return;
      } catch {
        /* fall through to expo-speech */
      }
    }

    await Speech.stop();
    await new Promise<void>((resolve) => {
      Speech.speak(t, {
        rate: 0.95,
        pitch: 1.0,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  };

  const speakResponse = async (text: string) => {
    await speakGeminiOutput(text);
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
        <Text style={s.subtitle}>Speak naturally · Type · Hear the answer</Text>
        <View style={s.autoRow}>
          <Text style={s.autoLabel}>Auto voice (listen for speech)</Text>
          <Switch
            value={autoListen}
            onValueChange={setAutoListen}
            trackColor={{ false: '#1E2740', true: 'rgba(0,245,196,0.45)' }}
            thumbColor={autoListen ? '#00F5C4' : '#5A6580'}
          />
        </View>
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

        {/* Mic: auto VAD or manual hold */}
        <View style={s.micSection}>
          <TouchableOpacity
            style={[
              s.micBtn,
              (isRecording || (autoListen && vadPhase === 'capturing')) && s.micBtnRec,
              isProcessing && s.micBtnProc,
            ]}
            onPressIn={autoListen ? undefined : startManualRecording}
            onPressOut={autoListen ? undefined : stopManualRecording}
            disabled={isProcessing || autoListen}
            activeOpacity={0.85}
          >
            <Text style={s.micIcon}>
              {isProcessing ? '⏳' : isRecording ? '🔴' : autoListen && vadPhase === 'capturing' ? '🎯' : '🎙'}
            </Text>
          </TouchableOpacity>
          <Text style={s.micHint}>
            {autoListen
              ? (isProcessing
                ? 'Analyzing...'
                : vadPhase === 'capturing'
                  ? 'Heard you — finishing after you pause...'
                  : 'Listening — start speaking anytime')
              : (isProcessing
                ? 'Analyzing...'
                : isRecording
                  ? 'Release to send'
                  : 'Hold mic to speak')}
          </Text>
          {autoListen ? (
            <Text style={s.micHintSmall}>Audio saves as {QUERY_WAV_FILENAME}</Text>
          ) : null}
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
  autoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1E2740',
  },
  autoLabel: { color: '#C8CDD8', fontSize: 13, flex: 1, paddingRight: 12 },
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
  micHint: { color: '#5A6580', fontSize: 13, textAlign: 'center', paddingHorizontal: 8 },
  micHintSmall: { color: '#3A4260', fontSize: 11, marginTop: 4 },

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
