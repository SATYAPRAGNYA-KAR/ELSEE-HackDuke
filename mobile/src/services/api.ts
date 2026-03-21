/**
 * SeeForMe API Client
 * Handles all REST + WebSocket communication with the backend.
 */

import axios, { AxiosInstance } from "axios";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "https://api.seefore.tech";
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || "wss://api.seefore.tech";

class ApiService {
  private client: AxiosInstance;
  private dashboardWs: WebSocket | null = null;
  private token: string = "";

  constructor() {
    this.client = axios.create({
      baseURL: BACKEND_URL,
      timeout: 30000,
    });

    // Attach auth token to every request
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string) {
    this.token = token;
  }

  // ── Query: audio/text + frame → Gemini → ElevenLabs ────────────────────────
  async sendQuery(payload: {
    audio_b64?: string;
    text_query?: string;
    frame_b64?: string;
    obstacles?: any[];
  }) {
    const resp = await this.client.post("/api/query", payload);
    return resp.data;
  }

  // ── Scene analysis ──────────────────────────────────────────────────────────
  async analyzeScene(frame_b64: string) {
    const resp = await this.client.post("/api/scene", { frame_b64 });
    return resp.data;
  }

  // ── Auth config ─────────────────────────────────────────────────────────────
  async getAuthConfig() {
    const resp = await this.client.get("/auth/config");
    return resp.data;
  }

  // ── WebSocket: subscribe to live obstacle feed ───────────────────────────────
  connectDashboard(onMessage: (data: any) => void, onError?: (e: Event) => void) {
    this.dashboardWs = new WebSocket(`${WS_URL}/ws/dashboard`);

    this.dashboardWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {}
    };

    this.dashboardWs.onerror = (e) => {
      console.error("Dashboard WS error:", e);
      onError?.(e);
    };

    this.dashboardWs.onclose = () => {
      // Auto-reconnect after 3 seconds
      setTimeout(() => this.connectDashboard(onMessage, onError), 3000);
    };

    return () => {
      this.dashboardWs?.close();
    };
  }

  disconnectDashboard() {
    this.dashboardWs?.close();
    this.dashboardWs = null;
  }
}

export const apiService = new ApiService();
export default apiService;
