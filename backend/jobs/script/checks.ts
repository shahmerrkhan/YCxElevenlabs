import { z } from "zod";

// `say` is the voiceover (S4), `show` is the on-screen text (S5).
const lineSchema = z.object({ say: z.string(), show: z.string() });

export const scriptPartsSchema = z.object({
  hook: lineSchema,
  beats: z.array(lineSchema),
  caption: z.string(),
});

export type ScriptParts = z.infer<typeof scriptPartsSchema>;

const DISCLOSURE = "Kiln is made up for this demo.";
// About 20 to 30 seconds spoken. The prompt aims a little inside this range.
const MIN_WORDS = 50;
const MAX_WORDS = 80;
const MAX_SHOW_WORDS = 7;
const MAX_CAPTION_CHARS = 200;
const COPY_RUN_WORDS = 8;

export function spokenText({ hook, beats }: ScriptParts): string {
  return [hook, ...beats].map((line) => line.say.trim()).join(" ");
}

export function withDisclosure(caption: string): string {
  const text = caption.trim();
  return `${/[.!?]$/.test(text) ? text : `${text}.`} ${DISCLOSURE}`;
}

// From data/company.md "Never claim". Word lists miss paraphrases, the prompt covers those.
const BANNED: [RegExp, string][] = [
  [/\busers\b/i, 'the word "users"'],
  [/\breviews\b/i, 'the word "reviews"'],
  [/\bYC\b|\by[\s-]?combinator\b/i, "YC"],
  [/@/, 'an "@" handle'],
  [/\bI used\b/i, '"I used"'],
  [
    /\bI(?:'ve| have|'d| had|'m| am)?(?: been)?(?: just| actually| finally| recently| started| always)? (?:use|used|using|tried|tested|testing)\b/i,
    "the speaker saying they used or tried something",
  ],
  [
    /\bI(?:'ve| have)?(?: just| finally| recently)? (?:found (?:this|an?) (?:app|tool|site)|discovered|switched to|downloaded|swear by)\b/i,
    "the speaker endorsing a product",
  ],
  [
    /\bI(?:'ve| have)?(?: just| finally| actually)? (?:passed|aced|scored|got an? (?:a|b|\d+)\b|went from)|\b(?:saved|changed) my (?:life|grades?|gpa|semester|midterms?)\b/i,
    "the speaker claiming a result",
  ],
  [
    /\b(?:better|higher|improves?|improved|boosts?|boosted|raises?) (?:your |my )?(?:grades?|marks|gpa)\b|\bguarantee/i,
    "a grade or result claim",
  ],
  [
    /\b(?:thousands|millions) of (?:students|people)\b|\beveryone(?:'s| is) using\b|\b(?:five|5)[\s-]stars?\b|\btestimonials?\b|\binvestors?\b|\bbacked by\b|\bpartner(?:ed|ship)s?\b/i,
    "fake social proof",
  ],
  [
    /https?:|\bwww\.|\b[\w-]+\.(?:com|ai|app|io|co|ca|org|net|edu)\b|\blink in (?:my )?bio\b|\b(?:app|play) store\b/i,
    "a link or store listing",
  ],
  [/\d\s*%|\bpercent\b/i, "a percentage"],
  [
    /\bgame[\s-]?chang|\brevolutionary\b|\bseamless|\bsupercharge|\beffortless|\blife[\s-]changing\b|\bmind[\s-]blowing\b|\bunlock your\b/i,
    "a hype word",
  ],
];

const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|I'll|me|my|mine|myself)\b/i;

const plain = (text: string) => text.replace(/[‘’]/g, "'");
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const normalWords = (text: string) =>
  words(plain(text).toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " "));

function copiedRun(text: string, transcripts: string[]): string | undefined {
  const own = normalWords(text);
  const sources = transcripts.map((source) => ` ${normalWords(source).join(" ")} `);
  for (let i = 0; i + COPY_RUN_WORDS <= own.length; i++) {
    const run = own.slice(i, i + COPY_RUN_WORDS).join(" ");
    if (sources.some((source) => source.includes(` ${run} `))) return run;
  }
  return undefined;
}

/** Everything wrong with a script. An empty list means it can ship. */
export function checkScript(parts: ScriptParts, transcripts: string[]): string[] {
  const { hook, beats, caption } = parts;
  const lines = [hook, ...beats];
  const spoken = plain(spokenText(parts));
  const texts = [spoken, ...lines.map((line) => plain(line.show)), plain(caption)];
  const problems: string[] = [];

  for (const [pattern, label] of BANNED) {
    if (texts.some((text) => pattern.test(text))) problems.push(`contains ${label}`);
  }

  // The speaker may talk about their own studying, but once Kiln comes up it is never "I" or "my".
  const kilnAt = spoken.search(/\bkiln\b/i);
  if (kilnAt < 0) {
    problems.push("never says Kiln out loud");
  } else {
    const sentenceStart = spoken.slice(0, kilnAt).search(/[^.!?]*$/);
    if (FIRST_PERSON.test(spoken.slice(sentenceStart))) {
      problems.push("uses I, me or my in the Kiln sentence or after it, which sounds like a testimonial");
    }
  }
  for (const text of texts.slice(1)) {
    if (/\bkiln\b/i.test(text) && FIRST_PERSON.test(text)) {
      problems.push("puts I, me or my next to Kiln in on-screen text or the caption");
    }
  }

  const count = words(spoken).length;
  if (count < MIN_WORDS || count > MAX_WORDS) {
    problems.push(`has ${count} spoken words, it needs ${MIN_WORDS} to ${MAX_WORDS}`);
  }
  if (beats.length < 3 || beats.length > 6) {
    problems.push(`has ${beats.length} beats, it needs 3 to 6`);
  }
  if (lines.some((line) => !line.say.trim() || !line.show.trim()) || !caption.trim()) {
    problems.push("has an empty field");
  }
  if (lines.some((line) => words(line.show).length > MAX_SHOW_WORDS)) {
    problems.push(`has on-screen text over ${MAX_SHOW_WORDS} words`);
  }
  if (caption.length > MAX_CAPTION_CHARS) {
    problems.push(`has a caption over ${MAX_CAPTION_CHARS} characters`);
  }

  for (const text of texts) {
    const run = copiedRun(text, transcripts);
    if (run) problems.push(`copies a transcript word for word: "${run}"`);
  }

  return [...new Set(problems)];
}
