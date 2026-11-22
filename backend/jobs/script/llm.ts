// The model chain: any OpenAI-style chat endpoint, tried in SCRIPT_MODELS order.
import { z } from "zod";

const DEFAULT_MODELS = [
  "gemini:gemini-3.8-flash",
  "gemini:gemini-3.6-flash",
  "gemini:gemini-3.5-flash-lite",
  "groq:openai/gpt-oss-120b",
].join(",");

// Any other name works through <NAME>_BASE_URL and <NAME>_API_KEY.
const BASE_URLS = new Map([
  ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai"],
  ["groq", "https://api.groq.com/openai/v1"],
  ["openrouter", "https://openrouter.ai/api/v1"],
  ["anthropic", "https://api.anthropic.com/v1"],
]);

const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_MS = 60_000;
const DAILY_QUOTA_MS = 30 * 60_000;
const UNAVAILABLE_MS = 30_000;
const BROKEN_SETUP_MS = 10 * 60_000;

/** No model can be tried. A setup mistake, so the safety net must not hide it. */
export class NotConfiguredError extends Error {}

/** Every model failed, is cooling down, or the job ran out of time. */
export class AllModelsFailedError extends Error {}

export interface Model {
  readonly id: string; // provider:model, safe to log
  readonly provider: string;
  readonly name: string;
  readonly url: string;
  readonly key: string;
}

export interface Message {
  role: "system" | "user";
  content: string;
}

interface Failure {
  reason: string;
  cooldownMs: number;
}

export function configuredModels(env = process.env): Model[] {
  const entries = (env.SCRIPT_MODELS?.trim() || DEFAULT_MODELS)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const models: Model[] = [];
  const problems: string[] = [];

  for (const entry of new Set(entries)) {
    // Split on the first colon only: model names like "x:free" have their own.
    const [, provider, name] = /^([\w-]+):(.+)$/.exec(entry) ?? [];
    if (!provider || !name) {
      problems.push("SCRIPT_MODELS entries must look like provider:model");
      continue;
    }
    const prefix = provider.toUpperCase().replaceAll("-", "_");
    const base = env[`${prefix}_BASE_URL`]?.trim() || BASE_URLS.get(provider);
    const key = env[`${prefix}_API_KEY`]?.trim();

    if (!base) {
      problems.push(`${prefix}_BASE_URL is not set on the server`);
    } else if (!key) {
      problems.push(`${prefix}_API_KEY is not set on the server`);
    } else {
      models.push({
        id: entry,
        provider,
        name,
        url: `${base.replace(/\/+$/, "")}/chat/completions`,
        key,
      });
    }
  }

  if (!models.length) {
    throw new NotConfiguredError(
      `no script model is set up, ${problems[0] ?? "SCRIPT_MODELS is empty"}`,
    );
  }
  return models;
}

function retryAfterMs(res: Response, body: string): number | undefined {
  // Gemini puts the delay in the body instead of the header.
  const raw = res.headers.get("retry-after") ?? /"retryDelay":\s*"([\d.]+)s"/.exec(body)?.[1];
  const seconds = Number(raw);
  return seconds > 0 ? seconds * 1000 : undefined;
}

function httpFailure(res: Response, body: string): Failure {
  const { status } = res;
  if (status === 429 || status === 402) {
    const daily =
      status === 402 ||
      /per_?day|requests per day|tokens per day|\((?:RPD|TPD)\)|insufficient_quota/i.test(body);
    return daily
      ? { reason: "quota used up", cooldownMs: DAILY_QUOTA_MS }
      : { reason: "rate limit", cooldownMs: retryAfterMs(res, body) ?? RATE_LIMIT_MS };
  }
  // Groq answers 413 when one request is bigger than the per-minute token limit.
  if (status === 413) return { reason: "request too large", cooldownMs: RATE_LIMIT_MS };
  if (status === 408 || status >= 500) {
    return { reason: "service unavailable", cooldownMs: UNAVAILABLE_MS };
  }
  if (status === 401 || status === 403 || (status === 400 && /api.?key/i.test(body))) {
    return { reason: "API key rejected", cooldownMs: BROKEN_SETUP_MS };
  }
  if (status === 404 || (status === 400 && /model.{0,60}(?:not found|does not exist)/i.test(body))) {
    return { reason: "model not found", cooldownMs: BROKEN_SETUP_MS };
  }
  // Other 4xx can be down to this one prompt, so don't bench the model for it.
  return { reason: `request rejected with ${status}`, cooldownMs: 0 };
}

async function callModel<T>(
  model: Model,
  messages: Message[],
  schema: z.ZodType<T>,
  deadline: AbortSignal,
): Promise<{ value: T } | { failure: Failure }> {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
  const lowEffort =
    model.provider === "gemini" || (model.provider === "groq" && model.name.includes("gpt-oss"));
  // Not AbortSignal.any + AbortSignal.timeout: on Node 20 that timer gets lost and never fires.
  const request = new AbortController();
  const abort = () => request.abort();
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
  deadline.addEventListener("abort", abort, { once: true });

  let text: string;
  try {
    const res = await fetch(model.url, {
      method: "POST",
      headers: { authorization: `Bearer ${model.key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: model.name,
        messages,
        ...(lowEffort && { reasoning_effort: "low" }),
        response_format: {
          type: "json_schema",
          json_schema: { name: "script", strict: true, schema: jsonSchema },
        },
      }),
      signal: request.signal,
    });
    text = await res.text();
    if (!res.ok) return { failure: httpFailure(res, text) };
  } catch {
    // The error itself is dropped: it can quote request headers, and so the key.
    if (deadline.aborted) return { failure: { reason: "time limit", cooldownMs: 0 } };
    const reason = request.signal.aborted ? "timeout" : "network error";
    return { failure: { reason, cooldownMs: UNAVAILABLE_MS } };
  } finally {
    clearTimeout(timer);
    deadline.removeEventListener("abort", abort);
  }

  try {
    const choice = JSON.parse(text).choices[0];
    if (choice.message.refusal || /content_filter|safety/i.test(choice.finish_reason ?? "")) {
      return { failure: { reason: "refusal", cooldownMs: 0 } };
    }
    return { value: schema.parse(JSON.parse(choice.message.content)) };
  } catch {
    return { failure: { reason: "unreadable answer", cooldownMs: 0 } };
  }
}

// Shared by all jobs: model id -> when it may be tried again, and why it is waiting.
const coolingDown = new Map<string, { until: number; reason: string }>();

/** Sends one request down the chain and returns the first usable answer. */
export async function askChain<T>(options: {
  models: Model[];
  messages: Message[];
  schema: z.ZodType<T>;
  deadline: AbortSignal;
  log: (line: string) => void;
}): Promise<{ value: T; model: Model }> {
  const { models, messages, schema, deadline, log } = options;
  const reasons = new Set<string>();

  for (const model of models) {
    if (deadline.aborted) break;

    const cooling = coolingDown.get(model.id);
    if (cooling && cooling.until > Date.now()) {
      reasons.add(cooling.reason);
      log(`skip model=${model.id} cooling down after ${cooling.reason}`);
      continue;
    }

    const started = Date.now();
    const result = await callModel(model, messages, schema, deadline);
    const ms = Date.now() - started;
    if ("value" in result) {
      log(`answered model=${model.id} ms=${ms}`);
      return { value: result.value, model };
    }

    const { reason, cooldownMs } = result.failure;
    reasons.add(reason);
    if (cooldownMs) coolingDown.set(model.id, { until: Date.now() + cooldownMs, reason });
    log(`failed model=${model.id} reason="${reason}" ms=${ms} cooldown_ms=${cooldownMs}`);
  }

  throw new AllModelsFailedError(
    deadline.aborted
      ? "script generation ran out of time"
      : `every script model failed, ${[...reasons].join(" and ")}`,
  );
}
