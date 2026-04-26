# EyeText / Catalyst for Care Monorepo

Gaze-powered AAC platform for non-verbal communication. The primary runtime entrypoint is the gaze demo in `gaze-engine/demo`, which captures webcam gaze, resolves dwell selections, and orchestrates calls into the agent pipeline and backend.

## What is the main entrypoint?

For end-to-end local usage, start from:

- `gaze-engine` (`npm run dev`)
- Open the demo page and click "Start with Webcam"

The demo drives everything else:

- Sends phrase prediction requests to `agents/http_gateway.py` (`POST /predict`)
- Sends intent/routing requests to `agents/http_gateway.py` (`POST /intent`)
- Logs history and phrases to `backend` (`/history`, `/phrases`)
- Generates session summaries through `backend` (`POST /session/end`)
- Records and uploads session video via `claudinary-video`

## High-level architecture

```text
Webcam + WebGazer
      -> gaze-engine/demo/main.ts (UI + app flow)
            -> @catalyst/gaze-engine (core gaze library)
                  -> onSelect/onDwellProgress events

Demo runtime network calls:
      -> agents/http_gateway.py:8000
             - POST /predict  (next-word suggestions)
             - POST /intent   (6-step agent pipeline)
      -> backend/src/server.ts:3001
             - POST /history
             - POST /phrases
             - POST /session/end
             - GET  /history/:userId (caregiver dashboard path)

Media path:
      -> claudinary-video/src/recorder.ts (MediaRecorder)
      -> claudinary-video/src/uploader.ts (Cloudinary upload API)
      -> backend/src/lib/claude-analyzer.ts (Gemini summary from frames + transcript)
```

## Repository map

### Core runtime modules

- `gaze-engine/`
      - Core TS library in `src/` (`GazeEngine`, filter, dwell, calibration, trackers)
      - Main app demo in `demo/` (this is the active UX flow)
      - Primary command: `npm run dev`

- `agents/`
      - FastAPI gateway in `http_gateway.py` (frontend/backend bridge)
      - 6-agent decomposition represented in prompts and per-step functions
      - Optional uAgents registration/orchestration scripts (e.g. `bureau.py`)

- `backend/`
      - Express + MongoDB API (`src/server.ts`)
      - Vector search and embedding pipelines
      - Session analysis endpoint (`/session/end`) using Gemini

- `claudinary-video/`
      - Browser-side session recorder and Cloudinary uploader utilities used by the gaze demo

### Supporting modules

- `frontend/`
      - Separate React dashboard/board app (not the primary gaze demo entrypoint)
      - Also talks to `agents` and `backend`

- `cloudinary-assets/`
      - Node scripts to upload icon assets, generate tile manifest, and verify URLs

- `shared/`
      - Cross-language model contracts (`models.ts`, `models.py`)
      - API contract document (`api-contract.md`)

- `cloudinary-video/`
      - TS package for frame extraction/analysis helpers
      - Coexists with `claudinary-video` (name is similar; purposes overlap partially)

## Detailed flow from gaze selection to caregiver output

1. User starts camera in `gaze-engine/demo/main.ts`.
2. Demo loads WebGazer and creates `GazeEngine`.
3. `GazeEngine` pipeline executes per frame:
       - optional calibration transform (`src/calibration.ts`)
       - EMA smoothing (`src/filter.ts`)
       - dwell target detection (`src/dwell.ts`)
4. On tile selection (`onSelect`), demo handles mode-specific behavior:
       - Talk mode: compose text, request predictions, send final phrase
       - Help mode: immediate phrase speech
5. For intent generation, demo calls `POST /intent` on `agents/http_gateway.py`.
6. Gateway runs a 6-step pipeline:
       - gaze interpretation
       - intent understanding
       - user profile/memory lookup
       - emotional state inference
       - output generation
       - communication routing
7. Gateway returns a route decision payload to the demo.
8. Demo speaks returned message (browser TTS/audio URL path if present).
9. Demo writes telemetry to backend:
       - `POST /history` for message history
       - `POST /phrases` for phrase memory
10. On summary, demo uploads video to Cloudinary and calls `POST /session/end`.
11. Backend analyzes transcript + extracted Cloudinary frames with Gemini and stores summary.

## gaze-engine internals

The library code in `gaze-engine/src` is designed to be UI-agnostic:

- `index.ts`
      - Exposes `GazeEngine` and calibration helpers
      - Owns lifecycle (`start`, `stop`) and event subscriptions
- `tracker.ts`
      - `WebGazerSource` for browser runtime
      - `MockGazeSource` for tests and harness playback
- `filter.ts`
      - Confidence gating + EMA smoothing
- `dwell.ts`
      - Rectangle hit-testing + dwell timing + single-fire re-entry behavior
- `calibration.ts`
      - Linear fit + IDW blending calibration profile
- `types.ts`
      - Engine config and callback types

## Runtime services and ports

- Gaze demo (Vite): `http://localhost:5173` (default)
- Agent gateway (FastAPI): `http://localhost:8000`
- Backend API (Express): `http://localhost:3001`

## Setup and run

Use 3 terminals at minimum.

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill required values (MongoDB URI, API keys)
npm run dev
```

### 2) Agent gateway

```bash
cd agents
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python http_gateway.py
```

Notes:

- If requirements are incomplete on your machine, install `fastapi`, `python-dotenv`, `openai`, `uvicorn`, and `httpx`.
- Gateway attempts backend profile/history lookup when backend is available.

### 3) gaze-engine demo (main entrypoint)

```bash
cd gaze-engine
npm install
npm run dev
```

Then open the Vite URL and run:

1. Start webcam
2. Calibrate
3. Select Talk or Help
4. Use dwell interactions to communicate

## Environment variables

### backend/.env

Current code references:

- `MONGODB_URI`
- `PORT` (default 3001)
- `GEMINI_API_KEY` (embeddings + session analysis)
- Optional Twilio keys in `src/routes/sms.ts`:
      - `TWILIO_ACCOUNT_SID`
      - `TWILIO_AUTH_TOKEN`
      - `TWILIO_PHONE_NUMBER`

### agents/.env

Current code references:

- `ASI1_API_KEY`
- `BACKEND_URL` (default `http://localhost:3001`)
- `GEMINI_API_KEY` (optional fallback/primary for `/predict` path)
- Agent mailbox keys and seeds (for uAgents registration paths)

## API touchpoints used by gaze-engine demo

From `gaze-engine/demo/main.ts`:

- `POST http://localhost:8000/predict`
      - Input: current composed text
      - Output: 4 weighted next words
- `POST http://localhost:8000/intent`
      - Input: selected phrase/tile context
      - Output: route decision + generated response
- `POST http://localhost:3001/history`
      - Logs sent or spoken message history
- `POST http://localhost:3001/phrases`
      - Stores phrases for future prediction context
- `POST http://localhost:3001/session/end`
      - Returns session summary (or 400 if no messages)

## Testing and utility scripts

- `gaze-engine`
      - `npm test`
      - `npm run harness`
- `backend`
      - `npm test`
      - `npm run dev`
- `cloudinary-assets`
      - `npm run upload`
      - `npm run manifest`
      - `npm run verify`

## Important implementation notes

- The gaze demo currently imports recording/upload utilities from `claudinary-video` (spelling with "clau").
- There is also a `cloudinary-video` package with overlapping video-analysis concerns.
- `shared/api-contract.md` is useful as a design reference, but live route payloads should be verified against implementation in `backend/src/routes/*` and `agents/http_gateway.py`.
- The main user journey is in `gaze-engine/demo/main.ts`; the React app in `frontend/` is a separate UI surface.

## Quick troubleshooting

- If word predictions are empty:
      - confirm `agents/http_gateway.py` is running on port 8000
      - check ASI/Gemini keys for model calls
- If history/dashboard is empty:
      - confirm backend is running on 3001
      - verify `POST /history` returns 201
- If summary fails:
      - send at least one message first
      - confirm Cloudinary upload succeeds or expect text-only fallback

## License

See `LICENSE`.
