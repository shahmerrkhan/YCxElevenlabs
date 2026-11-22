// The voiceover: ElevenLabs text to speech, plus word timings for the video step (S5).
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { MEDIA_DIR } from "../../core/media.js";

export const AUDIO_FILE = "voice.mp3";
export const TIMINGS_FILE = "timings.json";

const API = "https://api.elevenlabs.io/v1/text-to-speech";
const MODEL = "eleven_flash_v2_5"; // fast, and half the price of multilingual v2
const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9"; // Jessica, a premade voice, so the free plan can use it
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20_000;

/** The message is safe to show and to read out loud, so no final period. */
export class VoiceFailedError extends Error {}

export interface WordTiming {
  word: string;
  start: number; // seconds
  end: number;
}

interface Voiceover {
  audio: Buffer;
  words: WordTiming[];
}

const answerSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: z.object({
    characters: z.array(z.string()),
    character_start_times_seconds: z.array(z.number()),
    character_end_times_seconds: z.array(z.number()),
  }),
});

type Alignment = z.infer<typeof answerSchema>["alignment"];

/** Whitespace splits words, so they line up with `say.split(/\s+/)` in the script parts. */
function toWords({
  characters,
  character_start_times_seconds: starts,
  character_end_times_seconds: ends,
}: Alignment): WordTiming[] {
  if (starts.length !== characters.length || ends.length !== characters.length) return [];

  const words: WordTiming[] = [];
  let current: WordTiming | undefined;
  characters.forEach((char, i) => {
    if (!char.trim()) {
      current = undefined;
    } else if (current) {
      current.word += char;
      current.end = ends[i];
    } else {
      current = { word: char, start: starts[i], end: ends[i] };
      words.push(current);
    }
  });
  return words;
}

function httpFailure(status: number, body: string): string {
  // ElevenLabs also sends some of these as a 401, so the specific ones go first.
  if (/quota_exceeded|insufficient_credits/.test(body)) return "ElevenLabs is out of credits";
  if (/paid_plan_required/.test(body)) return "that ElevenLabs voice needs a paid plan";
  if (/detected_unusual_activity/.test(body)) {
    return "ElevenLabs blocked the free plan from this server";
  }
  if (/missing_permissions/.test(body)) {
    return "the ElevenLabs API key is not allowed to use text to speech";
  }
  if (status === 401) return "ElevenLabs rejected the API key";
  if (status === 402) return "ElevenLabs needs more credits or a paid plan";
  if (status === 404 || /voice_not_found/.test(body)) return "the ElevenLabs voice was not found";
  if (status === 429) return "ElevenLabs is busy or rate limited";
  if (status >= 500) return "ElevenLabs is unavailable";
  return `ElevenLabs rejected the voiceover with status ${status}`;
}

async function callElevenLabs(
  text: string,
  key: string,
  voiceId: string,
): Promise<{ value: Voiceover } | { failure: string }> {
  // Not AbortSignal.timeout, to match llm.ts: that timer can get lost on Node 20.
  const request = new AbortController();
  const timer = setTimeout(() => request.abort(), REQUEST_TIMEOUT_MS);

  let body: string;
  try {
    const res = await fetch(`${API}/${encodeURIComponent(voiceId)}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL }),
      signal: request.signal,
    });
    body = await res.text();
    if (!res.ok) return { failure: httpFailure(res.status, body) };
  } catch {
    // The error itself is dropped: it can quote request headers, and so the key.
    return {
      failure: request.signal.aborted ? "ElevenLabs timed out" : "could not reach ElevenLabs",
    };
  } finally {
    clearTimeout(timer);
  }

  try {
    const answer = answerSchema.parse(JSON.parse(body));
    const audio = Buffer.from(answer.audio_base64, "base64");
    const words = toWords(answer.alignment);
    if (audio.length && words.length) return { value: { audio, words } };
  } catch {
    // Not JSON, or the wrong shape. Same failure as empty audio or timings.
  }
  return { failure: "ElevenLabs sent back no usable audio or timings" };
}

/** Writes the mp3 and its timings to output/media/<id>/. */
export async function makeVoiceover(options: {
  id: string;
  text: string;
  log: (line: string) => void;
}): Promise<{ audioFile: URL; timingsFile: URL; words: WordTiming[] }> {
  const { id, text, log } = options;
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new VoiceFailedError("ELEVENLABS_API_KEY is not set on the server");
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;

  let voiceover: Voiceover | undefined;
  let failure = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(RETRY_DELAY_MS);

    const started = Date.now();
    const result = await callElevenLabs(text, key, voiceId);
    const ms = Date.now() - started;
    if ("value" in result) {
      log(`answered model=${MODEL} attempt=${attempt} chars=${text.length} ms=${ms}`);
      voiceover = result.value;
      break;
    }
    failure = result.failure;
    log(`failed attempt=${attempt} of ${ATTEMPTS} reason="${failure}" ms=${ms}`);
  }
  if (!voiceover) throw new VoiceFailedError(failure);

  const { audio, words } = voiceover;
  const dir = new URL(`${id}/`, MEDIA_DIR);
  const audioFile = new URL(AUDIO_FILE, dir);
  const timingsFile = new URL(TIMINGS_FILE, dir);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(audioFile, audio);
    await writeFile(timingsFile, `${JSON.stringify({ words }, null, 2)}\n`);
  } catch (err) {
    log(`write failed code=${(err as NodeJS.ErrnoException).code ?? "unknown"}`);
    throw new VoiceFailedError("the voiceover could not be saved on the server");
  }
  return { audioFile, timingsFile, words };
}
