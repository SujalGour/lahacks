# Catalyst for Care

An AI-powered AAC (Augmentative and Alternative Communication) system for non-verbal patients. A patient dwells their gaze on a tile; the system speaks a personalized, context-aware response and — if urgent — texts their caregivers.

## Sponsor tracks

| Track | Component |
|-------|-----------|
| Fetch.ai Agentverse | 3-agent pipeline (intent → memory → router) |
| Cloudinary | Tile icon hosting + accessibility theme transforms |
| MongoDB Atlas | Vector search for personalized phrase prediction |
| ElevenLabs | Voice synthesis in the Router Agent |

## Architecture

```
Webcam
  └─► gaze-engine (TS lib)
          └─► POST /intent  ──► agents/ (Fetch.ai uAgents)
                                    ├─ Intent Agent   (classify)
                                    ├─ Memory Agent   (retrieve + LLM generate)
                                    └─ Router Agent   (TTS + SMS + log)
                                          └─► backend/ (MongoDB + Express)
                                                └─► caregiver dashboard
```

## Repos / folders

| Folder | Owner | What it does |
|--------|-------|-------------|
| [shared/](shared/README.md) | all | Type contracts and API spec — read before coding |
| [gaze-engine/](gaze-engine/README.md) | A | Webcam → tile-selection events (TypeScript) |
| [agents/](agents/README.md) | B | Fetch.ai uAgent pipeline + HTTP gateway |
| [cloudinary-assets/](cloudinary-assets/README.md) | C | Icon upload, theme presets, tile manifest |
| [backend/](backend/README.md) | D | REST API + MongoDB Atlas Vector Search |

## Quick start (integration day)

```bash
# 1. backend
cd backend && cp .env.example .env  # fill in MONGODB_URI, OPENAI_API_KEY
npm install && npm run dev          # :3001

# 2. agents
cd agents && cp .env.example .env   # fill in LLM_API_KEY, ELEVENLABS_API_KEY
pip install -r requirements.txt
python bureau.py                    # starts all 3 agents + gateway on :8000

# 3. seed demo data
cd backend && npm run seed

# 4. smoke test
curl -X POST http://localhost:8000/intent \
  -H "Content-Type: application/json" \
  -d '{"dwell_target_id":"WATER","dwell_duration_ms":1350,"session_id":"s1","user_id":"demo-1","points":[]}'
```

## Branch conventions

```
main          ← stable, judges-facing
gaze-engine   ← Webcam + gaze tracking
cloudinary    ← Tile icons, themes, upload widget, React frontend
task2-agents  ← Fetch.ai uAgent pipeline
task4-backend ← REST API + MongoDB
```

Merge to `main` twice: after the day-1 stub commit, and after integration.

---

## Cloudinary branch — what it does and how it connects

### How we use Cloudinary

Cloudinary powers all visual assets and accessibility theming in the app. Instead of bundling icons locally, we host them on Cloudinary's CDN and apply **real-time URL transformations** to support multiple accessibility themes from a single uploaded image — zero extra storage or duplicate files.

**1. Tile icon hosting (`cloudinary-assets/`)**
- 29 AAC tile icons (water, food, pain, family, yes, no, etc.) are uploaded to Cloudinary under the `catalyst-care/{category}/{tile_id}` folder structure.
- Upload is idempotent (`overwrite: false`) — safe to re-run.
- A manifest builder queries the Cloudinary API and generates `tile-manifest.json` mapping each tile ID to themed URLs.

**2. Accessibility theme transforms (URL-based, no extra uploads)**
| Theme | Cloudinary Transform | Purpose |
|-------|---------------------|---------|
| `standard` | *(none)* | Default delivery |
| `highContrast` | `e_contrast:50,e_brightness:20` | Low-vision users |
| `largeText` | `c_pad,w_400,h_400` | Motor-impaired users (bigger tap targets) |

All URLs also include `f_auto,q_auto` for automatic format and quality optimization.

**3. React frontend (`frontend/`)**
- Uses `@cloudinary/react` with `AdvancedImage` component for optimized rendering (lazy loading + blur placeholders).
- `buildTileImage(publicId, theme)` in `cloudinary.ts` applies theme-specific transforms via the `@cloudinary/url-gen` SDK.
- `buildAvatarImage(publicId)` generates face-detected circular crop avatars for caregiver profiles.
- **Upload Widget** — lets caregivers upload custom icons via Cloudinary's unsigned upload preset (`Lahacks`), tagged and dropped into the `catalyst-care` folder.
- **Emoji fallback** — if Cloudinary is not configured or an image fails to load, tiles gracefully fall back to emoji display.

**4. Theme selector**
- `ThemeSelector` component lets users switch between standard / highContrast / largeText.
- Switching themes instantly re-renders all 29 tiles with new Cloudinary URL transforms — no re-upload, no extra API calls.

### How the Cloudinary branch connects to other branches

```
┌─────────────────────────────────────────────────────────────┐
│                      cloudinary branch                      │
│                                                             │
│  frontend/          → Full React UI (tiles, themes, upload) │
│  cloudinary-assets/ → Icon upload scripts + manifest        │
│  shared/            → Type contracts (models.ts, models.py) │
└──────────┬──────────────────────┬───────────────────────────┘
           │                      │
     ┌─────▼──────┐        ┌──────▼───────┐
     │ gaze-engine│        │  task2-agents │
     │   branch   │        │    branch     │
     └─────┬──────┘        └──────┬───────┘
           │                      │
           │  Tile dwell events   │  POST /intent → RouteDecision
           │  feed into frontend  │  (text, audio_url, urgency)
           │                      │
           └──────────┬───────────┘
                      │
               ┌──────▼───────┐
               │ task4-backend │
               │    branch     │
               └──────────────┘
               GET /history/:userId
               (CaregiverDashboard)
```

**Integration points:**

| Branch | What it provides to Cloudinary branch | What it consumes from Cloudinary branch |
|--------|--------------------------------------|----------------------------------------|
| `gaze-engine` | `dwell_target_id` — the tile ID selected by gaze tracking | The React frontend renders the tile board that gaze-engine targets |
| `task2-agents` | `RouteDecision` response (generated text, audio URL, destinations) | Receives `POST /intent` with `tile_id` from the frontend's tile select handler |
| `task4-backend` | `GET /history/:userId` — message history for the caregiver dashboard | Shared type contracts (`models.ts`) ensure schema consistency |

**Shared contracts (`shared/`)** are the glue — all branches import the same `TileId`, `Theme`, `RouteDecision`, and `TileManifest` types to prevent schema drift between frontend, agents, and backend.

### Integration steps (merge day)

1. Merge `cloudinary` into `main` first (frontend + shared contracts).
2. Merge `gaze-engine` — wire gaze dwell events to the frontend's `onSelect(tileId)` handler.
3. Merge `task2-agents` — the frontend's `POST /intent` calls land on the agent gateway at `:8000`.
4. Merge `task4-backend` — the `CaregiverDashboard` component connects to the backend's history API at `:3001`.
5. Drop icon files into `cloudinary-assets/source-icons/`, run `npm run upload && npm run manifest && npm run verify`.
