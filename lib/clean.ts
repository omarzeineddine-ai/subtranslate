/**
 * SRT cleaner — pure string transformations, no network, no LLM.
 *
 * Mirrors the option set of common online cleaners (subtitletools.com et al.)
 * Each option is independent; the orchestrator below applies them in a fixed
 * order chosen to avoid interference (e.g. strip formatting tags before
 * collapsing whitespace).
 */

import { parseSrt, serializeSrt } from "@/lib/srt-codec";
import type { Cue } from "@/types";

export interface CleanOptions {
	/** Strip the first cue if it looks like a title card / credit. */
	removeFirstCue: boolean;
	/** Remove URLs (http://, https://, www.) anywhere in cue text. */
	removeWatermarks: boolean;
	/** Strip HTML tags (<i>, <b>, <font…>) and ASS/SSA override blocks ({\an8}). */
	removeFormatting: boolean;
	/** Remove anything inside [ ... ] (e.g. "[music]", "[laughter]"). */
	removeSquareBrackets: boolean;
	/** Remove anything inside ( ... ) (e.g. "(crying)"). */
	removeParens: boolean;
	/** Remove anything inside < ... > (excluding HTML tags, which removeFormatting handles). */
	removeAngleBrackets: boolean;
	/** Remove anything inside { ... } (after removeFormatting strips SSA blocks). */
	removeBraces: boolean;
	/** Strip "NAME:" speaker labels at the start of a line. */
	removeSpeakerLabels: boolean;
	/** Merge consecutive cues with identical text into a single cue spanning both. */
	mergeDuplicates: boolean;
	/** Collapse multi-line cues into a single line (joined with a space). */
	collapseLineBreaks: boolean;
	/** Drop cues whose text is empty after cleaning. */
	removeBlankCues: boolean;
	/** Convert all cue text to lowercase. */
	lowercase: boolean;
	/** Convert all cue text to uppercase. */
	uppercase: boolean;
}

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = {
	removeFirstCue: false,
	removeWatermarks: true,
	removeFormatting: true,
	removeSquareBrackets: true,
	removeParens: false,
	removeAngleBrackets: true,
	removeBraces: true,
	removeSpeakerLabels: false,
	mergeDuplicates: false,
	collapseLineBreaks: false,
	removeBlankCues: true,
	lowercase: false,
	uppercase: false,
};

export type CleanOptionGroup = "rules" | "brackets" | "case";

export interface CleanOptionMeta {
	key: keyof CleanOptions;
	label: string;
	hint?: string;
	group: CleanOptionGroup;
}

/** Every option with its UI description, in display order. Owned here so a
 * new option cannot ship without a label — tests assert this list covers
 * every CleanOptions key. */
export const CLEAN_OPTION_META: CleanOptionMeta[] = [
	{ key: "removeFormatting", label: "Remove formatting", hint: "<i>, <b>, {\\an8}, {\\b1}", group: "rules" },
	{ key: "removeBlankCues", label: "Remove blank cues", group: "rules" },
	{ key: "removeWatermarks", label: "Remove watermarks", hint: "URLs, http(s)://", group: "rules" },
	{ key: "removeSpeakerLabels", label: "Remove speaker labels", hint: "JOHN: at line start", group: "rules" },
	{ key: "collapseLineBreaks", label: "Collapse to single line", hint: "one line per cue", group: "rules" },
	{ key: "mergeDuplicates", label: "Merge duplicate cues", group: "rules" },
	{ key: "removeFirstCue", label: "Remove first cue", hint: "title cards", group: "rules" },
	{ key: "removeSquareBrackets", label: "[ … ]", hint: "[music]", group: "brackets" },
	{ key: "removeParens", label: "( … )", hint: "(crying)", group: "brackets" },
	{ key: "removeAngleBrackets", label: "< … >", group: "brackets" },
	{ key: "removeBraces", label: "{ … }", group: "brackets" },
	{ key: "lowercase", label: "lowercase everything", group: "case" },
	{ key: "uppercase", label: "UPPERCASE EVERYTHING", group: "case" },
];

/** Toggle one option, enforcing the rules options hold between them —
 * lowercase and uppercase are mutually exclusive. */
export function toggleCleanOption(
	options: CleanOptions,
	key: keyof CleanOptions,
	value: boolean,
): CleanOptions {
	const next = { ...options, [key]: value };
	if (key === "lowercase" && value) next.uppercase = false;
	if (key === "uppercase" && value) next.lowercase = false;
	return next;
}

export interface CleanStats {
	inputCues: number;
	outputCues: number;
	removedCues: number;
	modifiedCues: number;
}

// ─── Per-line transformations ─────────────────────────────────────────────

// Order-sensitive regexes. Tested against:
//   <i>Hello</i>, <font color="red">x</font>, {\an8}, {\b1\i0}, [music], (sigh)
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const SSA_OVERRIDE_RE = /\{\\[^}]*\}/g;
const SQUARE_BRACKET_RE = /\[[^\]]*\]/g;
const PAREN_RE = /\([^)]*\)/g;
const ANGLE_BRACKET_RE = /<[^>]*>/g;
const BRACE_RE = /\{[^}]*\}/g;
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
// Speaker label: 1-3 ALL-CAPS words (letters incl. accented Latin) followed by
// ":" at the start of a line. Permissive on hyphens, apostrophes, spaces.
const SPEAKER_LABEL_RE = /^\s*[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ0-9 .'-]{0,40}?:\s*/;

function applyLineRules(line: string, opts: CleanOptions): string {
	let s = line;
	if (opts.removeFormatting) {
		s = s.replace(HTML_TAG_RE, "");
		s = s.replace(SSA_OVERRIDE_RE, "");
	}
	if (opts.removeSquareBrackets) s = s.replace(SQUARE_BRACKET_RE, "");
	if (opts.removeParens) s = s.replace(PAREN_RE, "");
	if (opts.removeAngleBrackets) s = s.replace(ANGLE_BRACKET_RE, "");
	if (opts.removeBraces) s = s.replace(BRACE_RE, "");
	if (opts.removeSpeakerLabels) s = s.replace(SPEAKER_LABEL_RE, "");
	if (opts.removeWatermarks) s = s.replace(URL_RE, "");
	if (opts.uppercase) s = s.toUpperCase();
	else if (opts.lowercase) s = s.toLowerCase();
	return s.replace(/[ \t]+/g, " ").trim();
}

// ─── Public entry ─────────────────────────────────────────────────────────

export function cleanSrt(
	content: string,
	options: CleanOptions,
): { cleaned: string; stats: CleanStats } {
	const parsed = parseSrt(content);
	let modifiedCount = 0;

	let processed = parsed.map((cue) => {
		let lines = cue.text.split("\n").map((line) => applyLineRules(line, options));
		lines = lines.filter((l) => l.length > 0);
		if (options.collapseLineBreaks && lines.length > 0) {
			lines = [lines.join(" ").replace(/\s+/g, " ").trim()];
		}
		const newText = lines.join("\n");
		if (newText !== cue.text) modifiedCount++;
		return { ...cue, text: newText };
	});

	if (options.removeFirstCue && processed.length > 0) {
		processed = processed.slice(1);
	}

	if (options.removeBlankCues) {
		processed = processed.filter((cue) => cue.text.length > 0);
	}

	if (options.mergeDuplicates) {
		const merged: Cue[] = [];
		for (const cue of processed) {
			const prev = merged[merged.length - 1];
			if (prev && cue.text.trim() && cue.text.trim() === prev.text.trim()) {
				prev.end = cue.end;
			} else {
				merged.push({ ...cue });
			}
		}
		processed = merged;
	}

	return {
		cleaned: serializeSrt(processed),
		stats: {
			inputCues: parsed.length,
			outputCues: processed.length,
			removedCues: parsed.length - processed.length,
			modifiedCues: modifiedCount,
		},
	};
}

/** The start of a cleaned file for the done screen's preview: as many whole
 * cues as fit in `maxChars`, so the cut never lands mid-cue. A first cue
 * longer than the limit is cut at the limit. */
export function previewCleanedSrt(content: string, maxChars: number): { text: string; truncated: boolean } {
	if (content.length <= maxChars) return { text: content, truncated: false };
	const lastBreak = content.lastIndexOf("\n\n", maxChars);
	return { text: content.slice(0, lastBreak > 0 ? lastBreak : maxChars), truncated: true };
}
