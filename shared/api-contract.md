# API Contract — Catalyst for Care

Two services expose HTTP APIs. All requests/responses are JSON. All timestamps are Unix milliseconds.

---

## Agent Gateway — `http://localhost:8000` (Task 2)

The single entry point from the frontend into the agent pipeline.

### `POST /intent`

Submit a gaze sequence. The gateway forwards it through Intent → Memory → Router agents and returns the final route decision synchronously (under ~3 s).

**Request body** — `GazeSequence`
```json
{
  "points": [
    { "x": 412.3, "y": 301.1, "confidence": 0.91, "timestamp": 1714000000000 }
  ],
  "dwell_target_id": "WATER",
  "dwell_duration_ms": 1350,
  "session_id": "sess-abc123",
  "user_id": "demo-1"
}
```

**Response 200** — `RouteDecision`
```json
{
  "message": {
    "text": "I would like some water, please.",
    "source_intent": {
      "category": "need",
      "label": "wants water",
      "urgency": 2,
      "tile_id": "WATER",
      "user_id": "demo-1",
      "session_id": "sess-abc123"
    },
    "similar_phrases": [
      {
        "phrase_id": "ph-001",
        "text": "Can I have a glass of water?",
        "similarity": 0.94,
        "last_used": 1713900000000
      }
    ],
    "voice_id": "EXAVITQu4vr4xnSDxMaL",
    "audio_url": "https://res.cloudinary.com/demo/video/upload/tts-abc.mp3"
  },
  "destinations": ["tts", "dashboard"],
  "sms_sent": false,
  "audio_url": "https://res.cloudinary.com/demo/video/upload/tts-abc.mp3",
  "routed_at": 1714000003100
}
```

**Errors**
| Status | Meaning |
|--------|---------|
| 400 | Malformed body / missing required fields |
| 422 | Field validation failure |
| 500 | Internal agent pipeline error |

---

## Backend REST API — `http://localhost:3001` (Task 4)

Consumed by the agent pipeline (Task 2) and the caregiver dashboard frontend.

---

### Users

#### `GET /users/:id/profile`

Returns the full user profile including caregivers. The Memory Agent calls this on every request.

**Response 200** — `UserProfile`
```json
{
  "id": "demo-1",
  "name": "John Davis",
  "age": 72,
  "diagnosis": "ALS",
  "preferred_voice_id": "EXAVITQu4vr4xnSDxMaL",
  "preferred_theme": "highContrast",
  "caregivers": [
    {
      "id": "cg-001",
      "name": "Mary Davis",
      "relationship": "daughter",
      "phone": "+12125550101",
      "notify_urgency_gte": 4
    }
  ]
}
```

**Errors**: 404 if user not found.

---

#### `PUT /users/:id`

Update mutable profile fields. Omit fields you don't want changed.

**Request body** (all fields optional)
```json
{
  "preferred_voice_id": "EXAVITQu4vr4xnSDxMaL",
  "preferred_theme": "highContrast"
}
```

**Response 200** — updated `UserProfile`

---

### Caregivers

#### `POST /users/:id/caregivers`

Add a caregiver to a user's profile.

**Request body**
```json
{
  "name": "Mary Davis",
  "relationship": "daughter",
  "phone": "+12125550101",
  "notify_urgency_gte": 4
}
```

**Response 201** — the created `Caregiver` with generated `id`.

---

#### `DELETE /users/:userId/caregivers/:caregiverId`

Remove a caregiver. Returns 204 on success, 404 if not found.

---

### Phrases

#### `GET /phrases?userId=:id`

Return all stored phrases for a user.

**Response 200**
```json
[
  {
    "id": "ph-001",
    "user_id": "demo-1",
    "text": "Can I have a glass of water?",
    "tile_id": "WATER",
    "embedding": null,
    "created_at": 1713000000000
  }
]
```

---

#### `POST /phrases`

Store a phrase (does not trigger embedding — embedding is generated async).

**Request body**
```json
{
  "user_id": "demo-1",
  "text": "I need my medication.",
  "tile_id": "MEDICATION"
}
```

**Response 201** — created phrase with generated `id`.

---

#### `POST /phrases/predict`

Vector-search for the top 5 phrases most similar to the query. This is the headline MongoDB Atlas Vector Search endpoint.

**Request body**
```json
{
  "user_id": "demo-1",
  "query": "thirsty, want something to drink",
  "limit": 5
}
```

**Response 200** — array of `PhrasePrediction`
```json
[
  {
    "phrase_id": "ph-001",
    "text": "Can I have a glass of water?",
    "similarity": 0.94,
    "last_used": 1713900000000
  }
]
```

---

### History

#### `POST /history`

Log a routed message. The Router Agent calls this after every successful route. Embedding is generated asynchronously (does not block the response).

**Request body**
```json
{
  "user_id": "demo-1",
  "session_id": "sess-abc123",
  "text": "I would like some water, please.",
  "tile_id": "WATER",
  "intent_category": "need",
  "urgency": 2,
  "destinations": ["tts", "dashboard"],
  "sms_sent": false
}
```

**Response 201**
```json
{ "id": "hist-xyz789", "queued_embedding": true }
```

---

#### `GET /history/:userId`

Return message history for the caregiver dashboard.

**Query params**: `limit` (default 50), `before` (Unix ms cursor for pagination).

**Response 200**
```json
[
  {
    "id": "hist-xyz789",
    "user_id": "demo-1",
    "text": "I would like some water, please.",
    "tile_id": "WATER",
    "intent_category": "need",
    "urgency": 2,
    "destinations": ["tts", "dashboard"],
    "sms_sent": false,
    "created_at": 1714000003200
  }
]
```

---

### SMS (optional)

#### `POST /sms/send`

Trigger an SMS to all caregivers with `notify_urgency_gte <= urgency`. Falls back to `console.log` if Twilio creds are absent.

**Request body**
```json
{
  "user_id": "demo-1",
  "message": "URGENT: John needs help. He said: I am in pain.",
  "urgency": 5
}
```

**Response 200**
```json
{ "sent_to": ["+12125550101"], "provider": "twilio" }
```

---

## Tile IDs

These are the canonical tile identifiers used across all four tasks. The Cloudinary manifest key, the gaze engine target ID, and the backend `tile_id` field all use these exact strings.

### needs
`WATER` `FOOD` `BATHROOM` `PAIN` `MEDICATION` `HOT` `COLD` `SLEEP`

### people
`FAMILY` `CAREGIVER` `DOCTOR` `NURSE` `DAUGHTER` `SON`

### feelings
`HAPPY` `SAD` `TIRED` `SCARED` `FRUSTRATED`

### responses
`YES` `NO` `MAYBE` `THANK_YOU` `PLEASE`

### actions
`HELLO` `GOODBYE` `HELP` `CALL` `STOP`

---

## Naming conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Python / JSON wire | `snake_case` | `dwell_target_id` |
| TypeScript | `camelCase` | `dwellTargetId` |
| Tile IDs | `SCREAMING_SNAKE` | `THANK_YOU` |
| MongoDB `_id` | omitted from API responses | — |
