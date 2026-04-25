from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


# ── Gaze ─────────────────────────────────────────────────────────────────────

class GazePoint(BaseModel):
    x: float
    y: float
    confidence: float  # 0.0–1.0
    timestamp: int     # Unix ms

class GazeSequence(BaseModel):
    points: list[GazePoint]
    dwell_target_id: str          # tile ID that triggered the dwell
    dwell_duration_ms: int
    session_id: str
    user_id: str


# ── Intent ────────────────────────────────────────────────────────────────────

class Intent(BaseModel):
    category: str   # "need" | "greeting" | "emergency" | "social" | "response"
    label: str      # human-readable, e.g. "wants water"
    urgency: int    # 1–5; 4+ triggers SMS + emergency dashboard
    tile_id: str
    user_id: str
    session_id: str


# ── Phrase prediction ─────────────────────────────────────────────────────────

class PhrasePrediction(BaseModel):
    phrase_id: str
    text: str
    similarity: float   # 0.0–1.0 cosine similarity from vector search
    last_used: Optional[int] = None  # Unix ms


# ── Generated message ─────────────────────────────────────────────────────────

class GeneratedMessage(BaseModel):
    text: str
    source_intent: Intent
    similar_phrases: list[PhrasePrediction]
    voice_id: Optional[str] = None   # ElevenLabs voice ID, set by Router
    audio_url: Optional[str] = None  # filled in after TTS synthesis


# ── Routing ───────────────────────────────────────────────────────────────────

class RouteDecision(BaseModel):
    message: GeneratedMessage
    destinations: list[str]   # subset of ["tts", "sms", "dashboard", "emergency"]
    sms_sent: bool
    audio_url: Optional[str] = None
    routed_at: int            # Unix ms


# ── User / Caregiver ──────────────────────────────────────────────────────────

class Caregiver(BaseModel):
    id: str
    name: str
    relationship: str   # "daughter", "nurse", etc.
    phone: str          # E.164 format
    notify_urgency_gte: int = 4  # SMS threshold override per caregiver


class UserProfile(BaseModel):
    id: str
    name: str
    age: int
    diagnosis: Optional[str] = None
    preferred_voice_id: Optional[str] = None  # ElevenLabs voice
    preferred_theme: str = "standard"  # "standard" | "highContrast" | "largeText"
    caregivers: list[Caregiver] = Field(default_factory=list)
