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
task1-gaze    ← Owner A
task2-agents  ← Owner B
task3-cdn     ← Owner C
task4-backend ← Owner D
```

Merge to `main` twice: after the day-1 stub commit, and after integration.
