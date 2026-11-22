// Draft, then two compare-and-rewrite rounds (the script quality rule in docs/API_CONTRACT.md).
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { checkScript, scriptPartsSchema, type ScriptParts } from "./checks.js";
import {
  AllModelsFailedError,
  askChain,
  configuredModels,
  type Message,
  type Model,
} from "./llm.js";
import { draftPrompt, readerPrompt, repairPrompt, tastePrompt, type Brief } from "./prompts.js";

const COMPANY_FILE = new URL("../../../data/company.md", import.meta.url);
const JOB_LIMIT_MS = 60_000;

const answerSchema = z.object({ notes: z.array(z.string()), ...scriptPartsSchema.shape });

const withoutNotes = ({ hook, beats, caption }: ScriptParts): ScriptParts => ({
  hook,
  beats,
  caption,
});

function randomPainPoint(company: string): string {
  const section = /^## Student pain points.*\n((?:- .*(?:\n|$))+)/m.exec(company)?.[1] ?? "";
  const points = section.split("\n").filter(Boolean).map((line) => line.slice(2));
  return points[Math.floor(Math.random() * points.length)] ?? "studying for exams";
}

export async function generateScript(options: {
  request: string;
  transcripts: string[];
  log: (line: string) => void;
}): Promise<ScriptParts> {
  const { request, transcripts, log } = options;
  const started = Date.now();
  const models = configuredModels();
  const company = await readFile(COMPANY_FILE, "utf8");
  const brief: Brief = { company, transcripts };
  const jobLimit = new AbortController();
  setTimeout(() => jobLimit.abort(), JOB_LIMIT_MS).unref();
  const answeredBy: string[] = [];

  async function ask(step: string, messages: Message[], chain: Model[]) {
    const { value, model } = await askChain({
      models: chain,
      messages,
      schema: answerSchema,
      deadline: jobLimit.signal,
      log: (line) => log(`${step}: ${line}`),
    });
    answeredBy.push(`${step}=${model.id}`);

    const parts = withoutNotes(value);
    const problems = checkScript(parts, transcripts);
    if (problems.length) log(`${step}: checks found ${JSON.stringify(problems)}`);
    return { parts, notes: value.notes, problems, model };
  }

  const draft = await ask("draft", draftPrompt(brief, request, randomPainPoint(company)), models);
  const round1 = await ask(
    "r1",
    tastePrompt(brief, draft.notes, draft.parts, draft.problems),
    models,
  );

  // The final round has to pass the checks: one repair, then the next model gets a go.
  // askChain throws once no models are left.
  let candidates = models;
  for (;;) {
    let final = await ask("r2", readerPrompt(brief, round1.parts, round1.problems), candidates);
    const writer = final.model;
    if (final.problems.length) {
      const writerFirst = [writer, ...candidates.filter((model) => model.id !== writer.id)];
      final = await ask("repair", repairPrompt(brief, final.parts, final.problems), writerFirst);
    }
    if (!final.problems.length) {
      log(`script ready rounds=2 ms=${Date.now() - started} ${answeredBy.join(" ")}`);
      return final.parts;
    }

    const rejected = [writer.id, final.model.id];
    candidates = candidates.filter((model) => !rejected.includes(model.id));
    if (!candidates.length) {
      throw new AllModelsFailedError("no script model wrote a script that passed the checks");
    }
  }
}
