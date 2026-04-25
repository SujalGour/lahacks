// ── Gaze ─────────────────────────────────────────────────────────────────────

export interface GazePoint {
  x: number;
  y: number;
  confidence: number; // 0.0–1.0
  timestamp: number;  // Unix ms
}

export interface GazeSequence {
  points: GazePoint[];
  dwellTargetId: string;   // tile ID that triggered the dwell
  dwellDurationMs: number;
  sessionId: string;
  userId: string;
}


// ── Intent ────────────────────────────────────────────────────────────────────

export type IntentCategory = "need" | "greeting" | "emergency" | "social" | "response";

export interface Intent {
  category: IntentCategory;
  label: string;    // e.g. "wants water"
  urgency: number;  // 1–5; 4+ triggers SMS + emergency dashboard
  tileId: string;
  userId: string;
  sessionId: string;
}


// ── Phrase prediction ─────────────────────────────────────────────────────────

export interface PhrasePrediction {
  phraseId: string;
  text: string;
  similarity: number;       // 0.0–1.0 cosine similarity from vector search
  lastUsed?: number | null; // Unix ms
}


// ── Generated message ─────────────────────────────────────────────────────────

export interface GeneratedMessage {
  text: string;
  sourceIntent: Intent;
  similarPhrases: PhrasePrediction[];
  voiceId?: string | null;  // ElevenLabs voice ID
  audioUrl?: string | null; // filled in after TTS synthesis
}


// ── Routing ───────────────────────────────────────────────────────────────────

export type RouteDestination = "tts" | "sms" | "dashboard" | "emergency";

export interface RouteDecision {
  message: GeneratedMessage;
  destinations: RouteDestination[];
  smsSent: boolean;
  audioUrl?: string | null;
  routedAt: number; // Unix ms
}


// ── User / Caregiver ──────────────────────────────────────────────────────────

export interface Caregiver {
  id: string;
  name: string;
  relationship: string; // "daughter", "nurse", etc.
  phone: string;        // E.164 format
  notifyUrgencyGte: number; // SMS threshold, default 4
}

export type Theme = "standard" | "highContrast" | "largeText";

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  diagnosis?: string | null;
  preferredVoiceId?: string | null; // ElevenLabs voice
  preferredTheme: Theme;
  caregivers: Caregiver[];
}


// ── Tile manifest (Cloudinary) ────────────────────────────────────────────────

export interface TileVariants {
  standard: string;
  highContrast: string;
  largeText: string;
}

// tile ID → theme variants
export type TileManifest = Record<string, TileVariants>;
