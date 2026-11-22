// Real Reels to kiln.study through Composio Connect. The ck_ consumer key only works on this
// endpoint: @composio/core rejects it with 401. Throws on any failure, the caller falls back.
import { setTimeout as sleep } from "node:timers/promises";

const ENDPOINT = "https://connect.composio.dev/mcp";
const USERNAME = "kiln.study";
const POLL_MS = 3000;
const PROCESSING_MS = 60_000;
const CALL_MS = 20_000;

type Data = Record<string, any>;

async function run(key: string, slug: string, args: Data, timeoutMs = CALL_MS): Promise<Data> {
  const fail = (detail: string) => new Error(`${slug}: ${detail.slice(0, 1000)}`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-consumer-api-key": key,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "COMPOSIO_MULTI_EXECUTE_TOOL",
        arguments: { tools: [{ tool_slug: slug, arguments: args }], sync_response_to_workbench: false },
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw fail(`HTTP ${res.status} ${raw}`);

  // The reply is either JSON or a server-sent event holding the same JSON.
  const json = raw.trim().startsWith("{") ? raw : raw.split("\n").filter((l) => l.startsWith("data:")).pop()?.slice(5);
  if (!json) throw fail(`empty reply ${raw}`);
  const text = JSON.parse(json).result?.content?.[0]?.text;
  if (typeof text !== "string" || !text.startsWith("{")) throw fail(text ?? json);

  const result = JSON.parse(text).data?.results?.[0]?.response;
  if (!result?.successful) throw fail(text);
  return result.data;
}

/** Publishes once, never retried. Resolves only when Instagram returned a permalink. */
export async function postReel({ videoUrl, caption }: { videoUrl: string; caption: string }): Promise<string> {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  if (!/^https:\/\/.+\.mp4$/.test(videoUrl)) throw new Error(`not a public https mp4 URL: ${videoUrl}`);

  const user = await run(key, "INSTAGRAM_GET_USER_INFO", {});
  if (user.username !== USERNAME) throw new Error(`connected account is ${user.username}, not ${USERNAME}`);
  const ig_user_id = String(user.id);

  const container = await run(key, "INSTAGRAM_POST_IG_USER_MEDIA", {
    ig_user_id,
    media_type: "REELS",
    video_url: videoUrl,
    caption: caption.replaceAll("#", "%23"), // the tool's schema asks for this
  });
  if (!container.id) throw new Error(`no container id: ${JSON.stringify(container)}`);
  const creation_id = String(container.id);

  const deadline = Date.now() + PROCESSING_MS;
  for (;;) {
    await sleep(POLL_MS);
    const state = await run(key, "INSTAGRAM_GET_POST_STATUS", { creation_id });
    if (state.status_code === "FINISHED") break;
    if (state.status_code === "ERROR" || state.status_code === "EXPIRED" || Date.now() > deadline) {
      throw new Error(`container ${creation_id} not ready: ${JSON.stringify(state)}`);
    }
  }

  const media = await run(
    key,
    "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
    { ig_user_id, creation_id, max_wait_seconds: 10 },
    45_000,
  );
  if (!media.id) throw new Error(`no media id: ${JSON.stringify(media)}`);

  const { permalink } = await run(key, "INSTAGRAM_GET_IG_MEDIA", {
    ig_media_id: String(media.id),
    fields: "id,permalink",
  });
  if (typeof permalink !== "string") throw new Error(`published ${media.id}, but got no permalink`);
  return permalink;
}
