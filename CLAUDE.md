# Project: AI growth coworker (name TBD)
Hackathon: YC x ElevenLabs, Waterloo, Nov 22 2026. Hacking 11:00-15:00. Submission form due 15:00.
Rules: all code written after 11:00 in this repo. Live demo on real input. List only partner tools we actually use.
Judging: 25% technical, 25% ElevenLabs + partner tools central, 25% usefulness, 15% demo, 10% creativity.

## What it is
A web app with a talking mascot, an AI growth coworker for ONE fixed company: Kiln (made up for the demo), an AI study app that turns university students' lecture notes into flashcards and quizzes.
Not generalized. No "enter your URL" flow. No scraping at runtime.

## Demo flow (90 sec)
1. User calls the mascot (ElevenLabs agent, browser voice).
2. User says "make today's UGC".
3. Agent calls a tool -> POST /jobs. Backend writes a script from viral transcripts in data/transcripts/,
   voices it with ElevenLabs, builds a 9:16 video from photos in /data/photos + text overlay (ffmpeg).
4. Dashboard shows the video. Agent asks for approval by voice. User approves.
5. Backend posts/schedules across accounts. 2-3 real, the rest simulated (kept, but not badged in the UI).
6. Dashboard shows schedule grid and best-time chart (sample data, not badged in the UI).

## Stack (change only if the team agrees)
- Backend: Node + TypeScript + Express in `backend/`, port 3000. Frontend: Next.js (App Router) + React + TypeScript in `frontend/`, port 3001, phone-first
- Gemini for script generation (GEMINI_API_KEY), Groq as fallback (GROQ_API_KEY). Model order: SCRIPT_MODELS
- ElevenLabs Agents (voice interface + tools), ElevenLabs TTS for voiceover
- Unified posting API (Ayrshare or Late) for real posts; Composio optional add-on
- ffmpeg for video assembly
- Partner tools to decide: Maritime, Expected Parrot, Alter, Wasp (pick 2-3)

## API contract (do not change without telling the team)
Full shapes and errors: docs/API_CONTRACT.md
POST /jobs {prompt} -> {id, status}
GET /jobs/:id -> {id, status, script, audioUrl, videoUrl, error}
POST /jobs/:id/approve {accountIds?} -> {id, status}
GET /accounts -> [{id, platform, handle, kind}]
GET /schedule -> [{id, jobId, accountId, platform, caption, postAt, status, kind}]
GET /best-times -> {label: "sample", byHour: [{hour, score}]}

## Frontend facts (every agent should know these)
- The mascot is a hamster (`frontend/public/hamster.png`). Its mouth follows the agent's voice.
- The frontend only does GETs, through its own `/api/*` proxy to `BACKEND_URL`. It never sends the tool secret.
- Client tool name is exactly `showJob` with param `jobId` (string). The agent calls it right after POST /jobs.
- On `awaiting_approval` or `failed` the frontend calls `sendUserMessage` once. The text starts with `[status]`, see docs/API_CONTRACT.md "Agent to browser". The agent treats it as a cue to speak, never as approval.
- Approval is voice only. There is no approve button in the real app.
- Simulated accounts and sample data stay in the app. Do not add "simulated"/"sample"/"mock" badges to rows, cards or buttons; the single disclosure line at the bottom of the Schedule tab covers it.
- `frontend/` mock mode reads `mocks/*.json`, so keep those files identical to the contract examples.
- Next.js 16 differs from older versions. Before editing `frontend/`, read `frontend/AGENTS.md`.

## Ownership (team of 3)
Backend 1: script gen, voiceover, video build, /jobs endpoints
Backend 2: ElevenLabs agent + tools, posting layer, fan-out, fake analytics, /approve
Frontend: call screen (mascot + call button + transcript), dashboard

## Rules for the coding agent
- Plan first: before editing code, list the files you will touch, what changes, what could break, and open questions. Wait for the user's OK.
- Keep it simple. This is a 4-hour demo, not a product.
- UI labels: no per-item "sample", "simulated" or "mock" badges or tags. The dashboard has ONE small disclosure line instead ("Demo: N of M accounts are simulated and never posted to. Best times are sample data."). Keep that line. Never claim simulated or sample data is real, on screen or out loud.
- Secrets in .env only, never committed. Keys: ELEVENLABS_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, DEMO_TOOL_SECRET, posting API key.
- Do not add features outside this file without asking the user.
- Demo path comes first: one happy path that works every time beats many half features.
