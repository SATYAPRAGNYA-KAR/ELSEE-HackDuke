/**
 * Global state store using Zustand
 */

import { create } from "zustand";

export interface Obstacle {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  position: "left" | "center" | "right";
  depth_score: number;
  near: boolean;
}

export interface QuerySession {
  id: string;
  query: string;
  text_response: string;
  audio_response_b64?: string;
  annotated_frame_b64?: string;
  timestamp: number;
}

interface AppState {
  // Auth
  token: string;
  user: any;
  setAuth: (token: string, user: any) => void;
  clearAuth: () => void;

  // Live feed
  isLive: boolean;
  obstacles: Obstacle[];
  liveFeedFrame: string;   // base64 JPEG from Pi
  setLiveFeed: (frame: string, obstacles: Obstacle[]) => void;
  setIsLive: (v: boolean) => void;

  // Query sessions
  sessions: QuerySession[];
  activeSession: QuerySession | null;
  addSession: (s: QuerySession) => void;
  setActiveSession: (s: QuerySession | null) => void;

  // UI state
  isRecording: boolean;
  isProcessing: boolean;
  setRecording: (v: boolean) => void;
  setProcessing: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  token: "",
  user: null,
  setAuth: (token, user) => set({ token, user }),
  clearAuth: () => set({ token: "", user: null }),

  // Live feed
  isLive: false,
  obstacles: [],
  liveFeedFrame: "",
  setLiveFeed: (frame, obstacles) => set({ liveFeedFrame: frame, obstacles }),
  setIsLive: (v) => set({ isLive: v }),

  // Sessions
  sessions: [],
  activeSession: null,
  addSession: (s) => set((state) => ({ sessions: [s, ...state.sessions] })),
  setActiveSession: (s) => set({ activeSession: s }),

  // UI
  isRecording: false,
  isProcessing: false,
  setRecording: (v) => set({ isRecording: v }),
  setProcessing: (v) => set({ isProcessing: v }),
}));
