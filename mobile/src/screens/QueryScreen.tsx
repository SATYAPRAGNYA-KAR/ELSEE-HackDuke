/**
 * QueryScreen
 * User presses mic button → records audio → sends to backend
 * Backend returns Gemini text + ElevenLabs audio → plays back
 * Also shows annotated frame from Gemini analysis.
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Animated,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import { Camera, CameraType } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { useAppStore, QuerySession } from "../hooks/useStore";
import apiService from "../services/api";

let recordingRef: Audio.Recording | null = null;

export default function QueryScreen() {
  const {
    isRecording, isProcessing, liveFeedFrame, obstacles,
    setRecording, setProcessing, addSession, setActiveSession, activeSession,
  } = useAppStore();

  const [cameraRef, setCameraRef] = useState<Camera | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    (async () => {
      const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: micStatus } = await Audio.requestPermissionsAsync();
      setHasCameraPermission(camStatus === "granted");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    })();
  }, []);

  // Pulse while recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const captureFrame = async (): Promise<string> => {
    // Use live Pi feed frame if available, else capture from camera
    if (liveFeedFrame) return liveFeedFrame;
    if (cameraRef) {
      const photo = await cameraRef.takePictureAsync({ base64: true, quality: 0.7 });
      return photo.base64 || "";
    }
    return "";
  };

  const startRecording = async () => {
    try {
      setErrorMsg("");
      setRecording(true);
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef = recording;
    } catch (e: any) {
      setErrorMsg("Microphone error: " + e.message);
      setRecording(false);
    }
  };

  const stopRecordingAndSend = async () => {
    if (!recordingRef) return;
    setRecording(false);
    setProcessing(true);

    try {
      await recordingRef.stopAndUnloadAsync();
      const uri = recordingRef.getURI();
      recordingRef = null;

      // Read audio as base64
      const audioB64 = uri
        ? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        : "";

      const frameB64 = await captureFrame();

      const result = await apiService.sendQuery({
        audio_b64: audioB64,
        frame_b64: frameB64,
        obstacles: obstacles,
      });

      const session: QuerySession = {
        id: Date.now().toString(),
        query: result.query,
        text_response: result.text_response,
        audio_response_b64: result.audio_response_b64,
        annotated_frame_b64: result.annotated_frame_b64,
        timestamp: Date.now(),
      };

      addSession(session);
      setActiveSession(session);
      await playAudio(result.audio_response_b64);
    } catch (e: any) {
      setErrorMsg("Query failed: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const sendTextQuery = async () => {
    if (!textInput.trim()) return;
    setProcessing(true);
    setErrorMsg("");
    try {
      const frameB64 = await captureFrame();
      const result = await apiService.sendQuery({
        text_query: textInput.trim(),
        frame_b64: frameB64,
        obstacles: obstacles,
      });
      const session: QuerySession = {
        id: Date.now().toString(),
        query: result.query,
        text_response: result.text_response,
        audio_response_b64: result.audio_response_b64,
        annotated_frame_b64: result.annotated_frame_b64,
        timestamp: Date.now(),
      };
      addSession(session);
      setActiveSession(session);
      setTextInput("");
      await playAudio(result.audio_response_b64);
    } catch (e: any) {
      setErrorMsg("Query failed: " + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const playAudio = async (audioB64: string) => {
    if (!audioB64) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mpeg;base64,${audioB64}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
    } catch (e) {
      console.warn("Audio playback error:", e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ask SeeForMe</Text>
        <Text style={styles.subtitle}>Hold mic to speak · Type to query</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Mic Button */}
        <View style={styles.micSection}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonActive, isProcessing && styles.micButtonProcessing]}
              onPressIn={startRecording}
              onPressOut={stopRecordingAndSend}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              <Text style={styles.micIcon}>
                {isProcessing ? "⏳" : isRecording ? "🔴" : "🎙"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.micHint}>
            {isProcessing ? "Processing..." : isRecording ? "Listening... release to send" : "Hold to speak"}
          </Text>
        </View>

        {/* Text Input */}
        <View style={styles.textRow}>
          <TextInput
            style={styles.textInput}
            value={textInput}
            onChangeText={setTextInput}
            placeholder="Or type your question..."
            placeholderTextColor="#444"
            onSubmitEditing={sendTextQuery}
            returnKeyType="send"
            editable={!isProcessing}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendTextQuery} disabled={isProcessing || !textInput.trim()}>
            <Text style={styles.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>

        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        {/* Response Card */}
        {activeSession && (
          <View style={styles.responseCard}>
            <Text style={styles.responseQuery}>"{activeSession.query}"</Text>

            {activeSession.annotated_frame_b64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${activeSession.annotated_frame_b64}` }}
                style={styles.annotatedFrame}
                resizeMode="cover"
              />
            )}

            <Text style={styles.responseText}>{activeSession.text_response}</Text>

            <TouchableOpacity
              style={styles.replayBtn}
              onPress={() => playAudio(activeSession.audio_response_b64 || "")}
            >
              <Text style={styles.replayBtnText}>🔊  Replay Audio</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#1A1A2E" },
  title: { fontSize: 22, fontWeight: "800", color: "#00F5C4", letterSpacing: 1 },
  subtitle: { color: "#555", fontSize: 12, marginTop: 2 },
  content: { padding: 20, gap: 20 },

  micSection: { alignItems: "center", paddingVertical: 20, gap: 16 },
  micButton: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: "#111827",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#1A1A2E",
    shadowColor: "#00F5C4", shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  micButtonActive: { backgroundColor: "#1A0A0A", borderColor: "#FF4444", shadowColor: "#FF4444" },
  micButtonProcessing: { borderColor: "#FF9500", shadowColor: "#FF9500" },
  micIcon: { fontSize: 40 },
  micHint: { color: "#555", fontSize: 13 },

  textRow: { flexDirection: "row", gap: 8 },
  textInput: {
    flex: 1, backgroundColor: "#111827", borderRadius: 12, padding: 14,
    color: "#EEE", fontSize: 14, borderWidth: 1, borderColor: "#1A1A2E",
  },
  sendBtn: {
    width: 50, backgroundColor: "#00F5C4", borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnText: { fontSize: 22, color: "#0A0A0F", fontWeight: "800" },

  error: { color: "#FF6B6B", fontSize: 13, textAlign: "center" },

  responseCard: {
    backgroundColor: "#111827", borderRadius: 16, padding: 16,
    gap: 12, borderWidth: 1, borderColor: "#1A1A2E",
  },
  responseQuery: { color: "#888", fontSize: 13, fontStyle: "italic" },
  annotatedFrame: { width: "100%", height: 200, borderRadius: 10 },
  responseText: { color: "#EEE", fontSize: 15, lineHeight: 22 },
  replayBtn: {
    backgroundColor: "#0F2A24", borderRadius: 10, padding: 12,
    alignItems: "center", borderWidth: 1, borderColor: "#00F5C440",
  },
  replayBtnText: { color: "#00F5C4", fontWeight: "700", fontSize: 14 },
});
