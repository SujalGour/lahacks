# shared/ — The Contract

**Read this before writing a single line of code.**

This folder is the single source of truth for every type and endpoint in the project. All four tasks depend on it. Changes require group consensus — don't edit it unilaterally.

---

## Files

| File | What it is |
|------|-----------|
| `models.py` | Pydantic models for Task 2 (agents). Import from here, don't redefine. |
| `models.ts` | Identical types in TypeScript for Tasks 1, 3, 4. |
| `api-contract.md` | Full HTTP spec for both services. When Task 2 and Task 4 disagree, this wins. |

---

## Type summary (plain English)

**GazePoint** — a single raw gaze sample: screen position, confidence score, timestamp.

**GazeSequence** — the full payload the gaze engine emits when a dwell fires. Contains the stream of gaze points, which tile was dwelled on, how long, and who the user is. This is what gets POSTed to `/intent`.

**Intent** — what the Intent Agent concludes the user wants. Has a category (`need`, `greeting`, `emergency`, `social`, `response`), a human label, and an urgency score 1–5. Urgency ≥ 4 triggers SMS.

**PhrasePrediction** — a past phrase retrieved by vector search that is semantically similar to the current intent. The Memory Agent uses these as context for LLM generation.

**GeneratedMessage** — the LLM-generated text response, plus the intent that caused it, the similar phrases used as context, and (after TTS) an audio URL.

**RouteDecision** — the final output of the pipeline. Includes the generated message and the list of destinations it was sent to (`tts`, `sms`, `dashboard`, `emergency`).

**UserProfile** — patient data: name, age, diagnosis, preferred voice/theme, list of caregivers.

**Caregiver** — contact info + the urgency threshold at which they get an SMS.

**TileManifest** (TS only) — maps every tile ID to its three Cloudinary URLs (standard, high-contrast, large-text). Produced by Task 3, consumed by the frontend.

---

## Naming conventions

| Context | Style | Example |
|---------|-------|---------|
| Python fields | `snake_case` | `dwell_target_id` |
| TypeScript fields | `camelCase` | `dwellTargetId` |
| Tile IDs | `SCREAMING_SNAKE` | `THANK_YOU` |
| HTTP JSON bodies | `snake_case` (matches Python) | `user_id` |

The backend (Task 4) stores in MongoDB with snake_case and serves snake_case JSON. TypeScript consumers convert to camelCase at the edge — don't let camelCase leak into HTTP payloads.

---

## Urgency scale

| Score | Meaning | Triggers |
|-------|---------|---------|
| 1–3 | Routine | TTS + dashboard |
| 4 | Urgent | TTS + dashboard + SMS to caregivers |
| 5 | Emergency | All of the above + emergency dashboard alert |

---

## How to propose a change

1. Post in the group chat: "I need to add field X to model Y because Z."
2. Get thumbs-up from anyone whose task is affected.
3. One person updates both `models.py` and `models.ts` in a single commit.
4. Everyone pulls before continuing.

Don't open a PR that touches `shared/` without that conversation first.
