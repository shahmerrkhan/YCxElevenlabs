# Tasks: Sun Nov 22

**2:15 feature freeze. 2:50 submit. 3:00 hard deadline.**
API: [docs/API_CONTRACT.md](docs/API_CONTRACT.md). Fake responses: [mocks/](mocks/).

## How to start

Paste your line into your own Claude Code:

- **Shahmeer:** "I'm Shahmeer, Backend 1. Read CLAUDE.md and the API contract. Do only my section of TASKS.md and only touch my folders."
- **Artin:** "I'm Artin, Backend 2. Read CLAUDE.md and the API contract. Do only my section of TASKS.md and only touch my folders."
- **Frontend:** "I'm [NAME TBD], Frontend. Read CLAUDE.md and the API contract. Do only my section of TASKS.md and only touch my folders."

## Who owns which folder

| Owner | Only they edit |
|---|---|
| Shahmeer | `backend/` except the two folders below, `data/`, `docs/`, `mocks/`, root files, backend deploy config |
| Artin | `backend/agent/`, `backend/posting/` |
| Frontend | `frontend/`, including its package.json, lockfile and deploy config |

- Need a change in someone else's folder, or a backend dependency? Ask the owner.
- Small commits on main. `git pull --rebase` before every push. Never force push.
- Secrets go in `.env` or the host's settings. Share them privately, never in git.

## Shahmeer (Backend 1)

- [ ] **S1, by 12:25: backend skeleton.** Node + TypeScript + Express, CORS, media route, tool-secret check, in-memory job store (include a caption and one seeded test job).
  - Handoff: **Shahmeer gives Artin** the job store interface, router mount point and stub /jobs routes (to test tools against) by 12:25.
  - Handoff: **Shahmeer gives Artin** the tool secret privately by 12:25.
- [ ] **S2, by 12:50: collect and drop in inputs.** Viral UGC transcripts in `data/transcripts/` (one .txt each), ~50 photos in `data/photos/`, company facts. The repo is public, so only commit what can be shared.
- [ ] **S3, by 1:15: script generator and /jobs.** Claude via `ANTHROPIC_API_KEY`. Follow the contract's script quality rule: extract patterns, draft, at least 2 compare-and-rewrite rounds. No transcripts means 422 `no_transcripts`. Also produce the caption.
  - Handoff: **Shahmeer gives Artin** working POST and GET /jobs routes by 1:15.
- [ ] **S4, by 1:35: voiceover.** ElevenLabs TTS, save audio, set `audioUrl`.
- [ ] **S5, by 2:00: video.** ffmpeg 9:16 from photos, voiceover and text. End at `awaiting_approval`. Create the host account while it renders (host picked by the team by 1:30).
  - Handoff: **Shahmeer gives Artin** one finished job with a video by 2:00.
- [ ] **S6, 2:00-2:30: deploy backend.** ffmpeg on the host, env vars set, one full job on the public URL. From 2:15 fixes only.
  - Handoff: **Shahmeer gives Artin and Frontend** the public backend URL by 2:10.
- [ ] **S7, 2:30-2:50: submit the form.** Repo, app link, description, partner tools, demo video. No redeploys after this starts, they wipe jobs.

## Artin (Backend 2)

- [ ] **A1, by 12:25: create the ElevenLabs agent.** Mascot persona, voice, asks before posting, says "simulated" out loud.
  - Handoff: **Artin gives Frontend** the agent ID by 12:25.
- [ ] **A2, by 12:50: posting account.** Pick Ayrshare or Late, connect 2-3 real accounts, prove one test video post works on the plan we have.
- [ ] **A3, by 1:15: agent tools.** Server tools for create, get and approve, with the secret header. Client tool `showJob`. Test through a temporary tunnel URL. Speak errors, including "no transcripts loaded".
  - Handoff: **Artin gives Frontend** the `showJob` tool, configured as in the contract, by 1:15.
- [ ] **A4, by 1:40: /approve and real posts.** Build on the seeded test job. Guard against double posts, record failures.
  - Handoff: **Artin gives Shahmeer** the posting router to mount by 1:40.
- [ ] **A5, by 2:00: fan-out and fake data.** 100 accounts (2-3 real, rest simulated), /accounts, /schedule, /best-times labeled "sample".
  - Handoff: **Artin gives Frontend** the three working GET routes by 2:00.
- [ ] **A6, 2:00-2:30: agent hookup.** Point tools at the public backend URL, test spoken approval end to end. From 2:15 fixes only.
- [ ] **A7, 2:30-2:50: partner tool list.** Only tools we really used, one line each on how.
  - Handoff: **Artin gives Shahmeer** that list by 2:40.

## Frontend ([NAME TBD])

- [ ] **F1, by 12:25: call screen.** Vite + React in `frontend/`, mascot, call button, transcript area, data from `mocks/`.
- [ ] **F2, by 12:50: live call.** ElevenLabs React SDK with Artin's agent ID, mic permission, live transcript, talking state.
- [ ] **F3, by 1:15: job panel.** Status, script and video from mocks (the mock video URL is a placeholder), plus error and empty states.
- [ ] **F4, by 1:40: job sync.** Implement `showJob`, poll every 2 seconds, send the ready or failed message once.
- [ ] **F5, by 2:00: dashboard.** Schedule grid with a "simulated" badge on every simulated row, best-time chart with a visible "sample" label.
- [ ] **F6, 2:00-2:30: deploy frontend.** Switch mocks to the backend URL, HTTPS for the mic, test on a second laptop. From 2:15 fixes only.
  - Handoff: **Frontend gives Shahmeer** the app URL and origin (for CORS) by 2:15.
- [ ] **F7, 2:30-2:50: backup demo.** Record the 90-second flow.
  - Handoff: **Frontend gives Shahmeer** the recording by 2:45.
