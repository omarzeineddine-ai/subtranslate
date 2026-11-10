import type { Cue } from "@/types";

/**
 * SRT codec — the one module that knows the SRT file format.
 *
 * Parsing is tolerant: a block is a cue when one of its first two non-empty
 * lines is a timestamp line ("start --> end", with or without the spaces
 * around the arrow). The leading cue-number line is
 * optional and its value is ignored (numbers are positional, re-assigned on
 * serialization), so files with missing, non-numeric, or BOM-prefixed index
 * lines parse fine. Blocks without a timestamp line (e.g. stream status
 * frames) are skipped.
 *
 * Line endings are normalised first (CRLF and the bare CR of old Mac files
 * become LF), and a line holding only spaces or tabs separates cues just as
 * an empty one does — editors and converters leave those behind, and reading
 * them as text would fold the next cue, number and timestamp included, into
 * the one above it.
 *
 * Timestamps are rewritten in the standard "00:01:02,345" form when they
 * parse, so a file written with a period before the milliseconds (the WebVTT
 * habit) or without zero padding comes out as SRT that strict players accept.
 * One that does not parse is kept as written.
 *
 * WebVTT files read the same way: the WEBVTT header, NOTE and STYLE blocks
 * have no timestamp line and are skipped, a timestamp may leave out the
 * hours, and cue settings ("align:start") are dropped because they mean
 * nothing in SRT. Cue text loses the WebVTT-only tags and escapes (see
 * stripVttMarkup) and keeps the <i>, <b> and <u> that SRT players also
 * understand. The cues come out as SRT.
 *
 * Cues with empty text are preserved — filtering them is caller policy (the
 * translation route drops them; the cleaner counts and optionally removes
 * them).
 */

const LINE_ENDING_RE = /\r\n?/g;
const BLOCK_SEPARATOR_RE = /\n(?:[ \t]*\n)+/;
const TIMESTAMP_ARROW = "-->";
/** The arrow as written on output; hand-edited files often drop the spaces. */
const TIMESTAMP_SEPARATOR = ` ${TIMESTAMP_ARROW} `;

const WEBVTT_HEADER_RE = /^WEBVTT(?=\s|$)/;

export function parseSrt(content: string): Cue[] {
  const normalized = content.replace(/^\uFEFF/, "").replace(LINE_ENDING_RE, "\n");
  const webvtt = WEBVTT_HEADER_RE.test(normalized);
  const blocks = normalized.split(BLOCK_SEPARATOR_RE);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let first = 0;
    while (first < lines.length && !lines[first].trim()) first++;

    let timestampIndex = -1;
    for (let i = first; i < Math.min(lines.length, first + 2); i++) {
      if (lines[i].includes(TIMESTAMP_ARROW)) {
        timestampIndex = i;
        break;
      }
    }
    if (timestampIndex === -1) continue;

    const line = lines[timestampIndex];
    const arrow = line.indexOf(TIMESTAMP_ARROW);
    const start = line.slice(0, arrow).trim();
    // The end time is the first word after the arrow; anything after it is
    // positioning, which would otherwise read as part of the end time.
    const [end, settings] = splitEnd(line.slice(arrow + TIMESTAMP_ARROW.length).trim());
    if (!start || !end) continue;

    const textLines = lines.slice(timestampIndex + 1);
    while (textLines.length && !textLines[textLines.length - 1].trim()) textLines.pop();
    const text = textLines.join("\n");
    const cue: Cue = {
      start: normalizeTimestamp(start),
      end: normalizeTimestamp(end),
      text: webvtt ? stripVttMarkup(text) : text,
    };
    if (settings && !webvtt) cue.settings = settings;
    cues.push(cue);
  }
  return cues;
}

/** Ruby annotation text (<rt>…</rt>): the reading printed above a word. With
 * the tags gone it would run into the word it annotates ("漢かん"), so it goes
 * with them. */
const VTT_RUBY_TEXT_RE = /<rt(?:\.[^>]*)?>[\s\S]*?<\/rt>/g;
/** The WebVTT tags SRT has no use for: class spans (<c.yellow>), voices
 * (<v Bob>), language spans, ruby wrappers, and the karaoke timestamps that
 * reveal a line word by word (<00:01.500>). Left in, they reach the
 * translator as text it may translate or mangle, and the SRT file shows them
 * as literal angle brackets. The name after "c", "v" etc. must be followed by
 * a class dot, a space or the closing bracket, so <cite> or <var> written as
 * plain text survive. */
const VTT_TAG_RE = /<\/?(?:c|v|lang|ruby|rt)(?:[.\s][^>]*)?>|<(?:\d+:)?\d{2}:\d{2}\.\d{3}>/g;

/** An opening voice tag that names its speaker: <v Bob>, <v.loud Mary Ann>. */
const VTT_VOICE_RE = /<v(?:\.[^\s>]*)?\s+([^>]*\S)\s*>\s*/g;

/** The character references WebVTT defines. Its text must escape &, < and >,
 * so "Tom & Jerry" is stored as "Tom &amp; Jerry"; SRT has no escaping, and
 * a reference left in would show on screen as written. The direction marks
 * become the invisible characters they stand for. */
const VTT_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": "\u00A0",
  "&lrm;": "\u200E",
  "&rlm;": "\u200F",
};
const VTT_ENTITY_RE = /&(?:amp|lt|gt|nbsp|lrm|rlm);/g;

/** Cue text with the WebVTT-only markup removed. A voice tag is the one tag
 * that carries words the viewer needs — who is speaking — so it becomes the
 * "BOB: " label SRT captions use for that, in capitals because that is the
 * convention and what the cleaner's "remove speaker labels" option matches. */
function stripVttMarkup(text: string): string {
  return text
    .replace(VTT_RUBY_TEXT_RE, "")
    .replace(VTT_VOICE_RE, (_, speaker: string) => `${speaker.toUpperCase()}: `)
    .replace(VTT_TAG_RE, "")
    // Last, so an escaped "&lt;c&gt;" comes out as the text "<c>" rather than
    // being read as a tag and stripped.
    .replace(VTT_ENTITY_RE, (entity) => VTT_ENTITIES[entity]);
}

/** Split what follows the arrow into the end time and the settings after it. */
function splitEnd(rest: string): [string, string] {
  const space = rest.search(/\s/);
  if (space === -1) return [rest, ""];
  return [rest.slice(0, space), rest.slice(space).trim()];
}

/** A blank line ends a cue, so one inside cue text (a translation that came
 * back with a doubled or leading line break, a blank line typed in the review
 * editor) would cut the cue short and orphan the rest of its text — in the
 * file and on the translation stream, which frames on the same separator. */
function withoutBlankLines(text: string): string {
  return text
    .replace(LINE_ENDING_RE, "\n")
    .split("\n")
    .filter((line) => line.trim())
    .join("\n");
}

/** Serialize one cue as an SRT block (no trailing separator). `number` is the
 * 1-based position of the cue in the file. Blank lines in the text are
 * dropped: the block must stay one block. */
export function serializeCue(cue: Cue, number: number): string {
  const settings = cue.settings ? ` ${cue.settings}` : "";
  return `${number}\n${cue.start}${TIMESTAMP_SEPARATOR}${cue.end}${settings}\n${withoutBlankLines(cue.text)}`;
}

export function serializeSrt(cues: Cue[]): string {
  if (cues.length === 0) return "";
  return cues.map((cue, i) => serializeCue(cue, i + 1)).join("\n\n") + "\n";
}

/** Hours are optional: WebVTT leaves them out under an hour ("01:02.345"). */
const TIMESTAMP_RE = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/;

/** Parse an SRT timestamp ("00:01:02,345") to milliseconds; null if malformed. */
export function timestampToMs(timestamp: string): number | null {
  const m = TIMESTAMP_RE.exec(timestamp.trim());
  if (!m) return null;
  const [, h = "0", min, s, ms] = m;
  return ((+h * 60 + +min) * 60 + +s) * 1000 + +ms.padEnd(3, "0");
}

/** A timestamp in the standard SRT form, or as written when it does not parse. */
function normalizeTimestamp(timestamp: string): string {
  const ms = timestampToMs(timestamp);
  return ms === null ? timestamp : msToTimestamp(ms);
}

export function msToTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const h = Math.floor(clamped / 3_600_000);
  const min = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  return `${pad(h)}:${pad(min)}:${pad(s)},${pad(clamped % 1000, 3)}`;
}

/**
 * Compact display form of a timestamp: "mm:ss", or "mm:ss.d" with
 * deciseconds, led by "h:" once it passes the hour so a cue an hour into a
 * film does not read as one at the start. Falls back to the raw string when the timestamp is malformed —
 * display must never throw on input the tolerant parser accepted.
 */
export function formatTimestamp(
  timestamp: string,
  precision: "seconds" | "deciseconds" = "seconds",
): string {
  const ms = timestampToMs(timestamp);
  if (ms === null) return timestamp;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(ms / 3_600_000);
  const base = `${hours ? `${hours}:` : ""}${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}`;
  return precision === "deciseconds" ? `${base}.${Math.floor((ms % 1000) / 100)}` : base;
}
