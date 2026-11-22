// Word timings to an ASS subtitle file: 3 or 4 words at a time, on while they are spoken.

interface TimedWord {
  word: string;
  start: number; // seconds
  end: number;
}

// Layout is in a fixed 720x1280 space. libass scales it to the real output size.
const WIDTH = 720;
const HEIGHT = 1280;
const CENTER_Y = 832; // 65% down: lower middle, above the caption area of phone apps
const SIDE_MARGIN = 100; // clear of the buttons on the right
const FONT = "Poppins ExtraBold"; // the bundled file in fonts/
const FONT_SIZE = 84;
const WORD_GAP = "  "; // two spaces, or the outlines of neighbouring words touch
const LONG_WORD = 14; // characters that fit on one line at FONT_SIZE
const HOLD_GAP = 0.3; // shorter silences keep the text up, so it does not flicker
const TAIL = 0.15;

/** Four words, or three where that ends a sentence or avoids a 1 or 2 word leftover. */
function groupWords(words: TimedWord[]): TimedWord[][] {
  const groups: TimedWord[][] = [];
  let at = 0;
  while (at < words.length) {
    const left = words.length - at;
    const endsSentence = left >= 6 && left !== 8 && /[.!?]["'”’)]*$/.test(words[at + 2].word);
    const size = endsSentence || [5, 6, 9].includes(left) ? 3 : 4;
    groups.push(words.slice(at, at + size));
    at += size;
  }
  return groups;
}

/** No ASS control characters, and nothing the bundled font cannot draw as an emoji. */
function cleanWord(word: string): string {
  return word.replace(/[{}\\\p{Cc}\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim();
}

function assTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100));
  const two = (value: number) => String(value).padStart(2, "0");
  const minutes = Math.floor(total / 6000);
  return `${Math.floor(minutes / 60)}:${two(minutes % 60)}:${two(Math.floor(total / 100) % 60)}.${two(total % 100)}`;
}

export function buildCaptions(words: TimedWord[], audioSec: number): string {
  const shown = words.map((w) => ({ ...w, word: cleanWord(w.word) })).filter((w) => w.word);
  const groups = groupWords(shown);

  const events = groups.flatMap((group, i) => {
    const start = group[0].start;
    const spokenUntil = group[group.length - 1].end;
    const next = groups[i + 1]?.[0].start ?? Infinity;
    const until = next - spokenUntil < HOLD_GAP ? next : spokenUntil + TAIL;
    const end = Math.min(until, audioSec);
    if (end <= start) return [];

    const longest = Math.max(...group.map(({ word }) => [...word].length));
    const shrink =
      longest > LONG_WORD ? `\\fs${Math.floor((FONT_SIZE * LONG_WORD) / longest)}` : "";
    const text = `{\\an5\\pos(${WIDTH / 2},${CENTER_Y})${shrink}}${group.map((w) => w.word).join(WORD_GAP)}`;
    return [`Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${text}`];
  });

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${FONT},${FONT_SIZE},&H00FFFFFF,&H00FFFFFF,&H00101010,&H00000000,0,0,0,0,100,100,1,0,1,5,0,5,${SIDE_MARGIN},${SIDE_MARGIN},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}
