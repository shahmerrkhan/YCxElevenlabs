# MyLittleHamswer growth coworker

Built at YC x ElevenLabs, Waterloo. MyLittleHamster is a made-up AI study app that turns lecture notes into flashcards and quizzes.
This project is its AI growth coworker. The CEO calls a hamster mascot (an ElevenLabs voice agent),
asks for a UGC video, approves it out loud, and the backend posts it to Instagram.

- App: https://y-cx-elevenlabs.vercel.app
- Backend (API only, try `/accounts`): https://ycxelevenlabs.onrender.com

## How it works
1. The voice agent sends the request to the backend.
2. Gemini writes a script grounded in 22 viral UGC transcripts, then rewrites it twice. Groq is the backup.
3. ElevenLabs records the voiceover.
4. ffmpeg builds a vertical video with captions over photos downloaded from Pinterest.
5. The agent asks for approval. After a spoken yes, the backend sends a Reel to kiln.study through Composio.

## Honest status
- Demo videos are pre-rendered for speed: `DEMO_MODE=cache` replays 3 saved pipeline runs and ignores the request.
- Without that setting, the full pipeline runs. If every script model fails, it can use one of 2 saved scripts.
- Only kiln.study can post for real. It shows up in the app only after a post succeeds.
- If that post fails, the error is only logged and the app still says "Scheduled".
- The other 4 accounts are simulated and never posted to. Their schedule is simulated too.
- Best-time-to-post analytics are made-up sample data.
- Jobs and the schedule live in memory, so a backend restart clears them.

## Partner tools used
- **ElevenLabs:** voice agent and voiceover
- **Composio:** Instagram posting
- **Gemini:** script writing
- **Groq:** backup script writing

## Run locally
You need Node 20.12 or newer. ffmpeg is installed by npm.

Backend, from the repo root (port 3000):
1. `npm install && cp .env.example .env`
2. In `.env`, set `DEMO_TOOL_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY` and `ELEVENLABS_API_KEY`.
3. `npm run dev`

Frontend, in a second terminal (port 3001):
1. `cd frontend && npm install && cp .env.example .env.local`
2. In `.env.local`, set `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`. Set `NEXT_PUBLIC_USE_MOCK` to false to use the backend.
3. `npm run dev`

- Voice agent: its tools need a public HTTPS backend URL and the same `DEMO_TOOL_SECRET`, saved in ElevenLabs.
- Real posting: add `COMPOSIO_API_KEY` (not in `.env.example`) and set `PUBLIC_BASE_URL` to a public HTTPS URL.
  **With both set, approving a new job for all accounts publishes to Instagram.**
- Optional: `DEMO_MODE`, `SCRIPT_MODELS`, `ELEVENLABS_VOICE_ID`, `VIDEO_SIZE`, `PORT`, `BACKEND_URL` (frontend).

## Team
- Shahmeer (backend)
- Artin (backend)
- Dhanika (frontend)
