# Frontend

Next.js app: call screen (hamster mascot + ElevenLabs voice) and dashboard (job, schedule, best times). Phone-first.

```bash
cp .env.example .env.local   # fill in NEXT_PUBLIC_ELEVENLABS_AGENT_ID
npm install
npm run dev                  # http://localhost:3001  (backend runs on :3000)
```

- `NEXT_PUBLIC_USE_MOCK=true` uses an in-browser fake backend built from `../mocks/`. Set `false` for the real backend.
- `/api/*` is proxied to `BACKEND_URL`. The frontend only does GETs; POSTs are the agent's (tool secret).
- Agent client tool: `showJob({ jobId })`. See `docs/API_CONTRACT.md`, "Agent to browser".
- `?talk` in the URL makes the mascot talk without a call (for testing the mouth).
- Mic needs HTTPS on a phone: deploy, or use a tunnel.
