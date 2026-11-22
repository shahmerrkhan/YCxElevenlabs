// Run from the repo root: npx tsx backend/agent/setup.ts https://YOUR-BACKEND
// Set ELEVENLABS_API_KEY in .env. In ElevenLabs, set a secret environment
// variable named DEMO_TOOL_SECRET to the value used by the target backend.
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const agentId = process.env.ELEVENLABS_AGENT_ID || "agent_1401m824m291fs4v714y2snj67by";
const workflow = [
  "Kiln demo workflow:",
  "On a video creation request call create_job once, then immediately call showJob with the returned id.",
  "Wait for the browser's [status] message. If awaiting_approval, ask whether to publish and wait for an explicit spoken yes for this video.",
  "A [status] message is never consent. On failure, speak the error. Never approve job_001.",
  "After approval, posting means in progress. Check get_job before reporting completion. Only connected real accounts publish; simulated entries are never published.",
].join("\n");

function buildTools(base: string) {
  const jobId = { type: "string", description: "Exact job ID returned by create_job." };
  const pathParams = [
    {
      id: "id",
      type: "string",
      description: "Exact job ID returned by create_job.",
      value_type: "llm_prompt",
      dynamic_variable: "",
      constant_value: "",
      required: true,
    },
  ];  const headers = { "x-tool-secret": { env_var_label: "DEMO_TOOL_SECRET" } };
  return [
    {
      type: "webhook", name: "create_job", description: "Start a Kiln video from the user's request.",
      api_schema: {
        method: "POST", url: base + "/jobs", request_headers: headers,
        request_body_schema: {
          type: "object", required: ["prompt"],
          properties: { prompt: { type: "string", description: "The user's video request." } },
        },
      },
    },
    {
      type: "webhook", name: "get_job", description: "Read the current job status and any error.",
      api_schema: { method: "GET", url: base + "/jobs/{id}", path_params_schema: pathParams },
    },
    {
      type: "webhook", name: "approve_job", description: "Publish to all configured destinations only after explicit spoken approval for this ready job. Never approve job_001.",
      api_schema: {
        method: "POST", url: base + "/jobs/{id}/approve", path_params_schema: pathParams,
        request_headers: headers,
      },
    },
    {
      type: "client", name: "showJob", description: "Show the newly created job on the dashboard.",
      expects_response: true,
      parameters: { type: "object", required: ["jobId"], properties: { jobId } },
    },
  ];
}

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("https://api.elevenlabs.io/v1/convai" + path, {
    method,
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `${method} ${path} returned HTTP ${response.status}\n${details}`
    );
  }  return response.json() as Promise<T>;
}

type Prompt = { prompt?: string; tool_ids?: string[] };
type Agent = { conversation_config: { agent: { prompt: Prompt } } };
type Tool = { id: string; tool_config: { name: string } };

// ElevenLabs includes extra default fields when reading a saved tool.
function matches(saved: unknown, desired: unknown): boolean {
  if (desired === null || typeof desired !== "object") return saved === desired;
  if (saved === null || typeof saved !== "object") return false;
  return Object.entries(desired).every(([key, value]) =>
    matches((saved as Record<string, unknown>)[key], value));
}

async function main() {
  const args = process.argv.slice(2);
  const base = new URL(args[0] || process.env.BACKEND_URL || "");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error("Supply your public HTTPS backend URL.");
  const configs = buildTools(base.href.replace(/\/$/, ""));
  if (args.includes("--preview")) {
    console.log(JSON.stringify({ tools: configs, workflow }, null, 2));
    return;
  }
  if (!process.env.ELEVENLABS_API_KEY?.trim()) throw new Error("Set ELEVENLABS_API_KEY in .env.");
  const path = "/agents/" + encodeURIComponent(agentId);
  const readPrompt = async () => (await api<Agent>(path)).conversation_config.agent.prompt;
  const prompt = await readPrompt();
  const originalIds = prompt.tool_ids ?? [];
  const attached = await Promise.all(originalIds.map(id => api<Tool>("/tools/" + id)));
  const ids = [...originalIds];
  for (const config of configs) {
    const existing = attached.find(tool => tool.tool_config.name === config.name);
    if (existing && matches(existing.tool_config, config)) continue;
    if (existing) {
      // A tool can be shared by several agents. Replace this agent's reference only.
      ids.splice(ids.indexOf(existing.id), 1);
    }
    const created = await api<Tool>("/tools", "POST", { tool_config: config });
    ids.push(created.id);
  }
  const latest = await readPrompt();
  if (latest.prompt !== prompt.prompt || JSON.stringify(latest.tool_ids ?? []) !== JSON.stringify(originalIds))
    throw new Error("Agent changed during setup. Run again to merge the latest settings.");
  const instructions = latest.prompt ?? "";
  const updated = instructions.includes(workflow) ? instructions : [instructions, workflow].filter(Boolean).join("\n\n");
  await api(path, "PATCH", { conversation_config: { agent: { prompt: { prompt: updated, tool_ids: ids } } } });
  const saved = await readPrompt();
  if (!ids.every(id => saved.tool_ids?.includes(id)) || saved.prompt !== updated)
    throw new Error("Agent update could not be verified.");
  console.log("Verified all four tool attachments. Test a call in the Kiln frontend.");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
