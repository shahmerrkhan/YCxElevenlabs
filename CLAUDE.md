# Project: AI growth coworker (name TBD)
Hackathon: YC x ElevenLabs, Waterloo, Nov 22 2026. Hacking 11:00-15:00. Submission form due 15:00.
Rules: all code written after 11:00 in this repo. Live demo on real input. List only partner tools we actually use.
Judging: 25% technical, 25% ElevenLabs + partner tools central, 25% usefulness, 15% demo, 10% creativity.

## What it is
A web app with a talking mascot, an AI growth coworker for ONE fixed company: [COMPANY TBD].
Not generalized. No "enter your URL" flow. No scraping at runtime.

## Demo flow (90 sec)
1. User calls the mascot (ElevenLabs agent, browser voice).
2. User says "make today's UGC".
3. Agent calls a tool -> POST /jobs. Backend writes a script from viral transcripts in data/transcripts/,
   voices it with ElevenLabs, builds a 9:16 video from photos in /data/pins + text overlay (ffmpeg).
4. Dashboard shows the video. Agent asks for approval by voice. User approves.
5. Backend posts/schedules across accounts. 2-3 real, the rest simulated and labeled "simulated".
6. Dashboard shows schedule grid and best-time chart (sample data, labeled).

## Stack (change only if the team agrees)
- Backend: Node + TypeScript + Express. Frontend: Vite + React
- Claude for script generation (ANTHROPIC_API_KEY)
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

## Ownership (team of 3)
Backend 1: script gen, voiceover, video build, /jobs endpoints
Backend 2: ElevenLabs agent + tools, posting layer, fan-out, fake analytics, /approve
Frontend: call screen (mascot + call button + transcript), dashboard

## Rules for the coding agent
- Plan first: before editing code, list the files you will touch, what changes, what could break, and open questions. Wait for the user's OK.
- Keep it simple. This is a 4-hour demo, not a product.
- Fake data must be labeled "sample" or "simulated" in the UI. Never claim it is real.
- Secrets in .env only, never committed. Keys: ELEVENLABS_API_KEY, ANTHROPIC_API_KEY, DEMO_TOOL_SECRET, posting API key.
- Do not add features outside this file without asking the user.
- Demo path comes first: one happy path that works every time beats many half features.
