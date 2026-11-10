// Terminal punctuation for major languages:
//   Latin: . ! ?
//   CJK:   。！？
//   Arabic: ؟ (question mark — period is just .)
//   Devanagari: ।
//   Ellipsis sequences (… or ...) are NOT terminal — they're continuations.
// Trailing closing brackets / quotes / parens after punctuation are tolerated,
// including the CJK and full-width ones (」』）】》〉).
const CLOSERS = `"'”’»)\\]>」』）】》〉`;
const TERMINAL_PUNCT_RE = new RegExp(`[.!?。！？؟।][${CLOSERS}]*\\s*$`);
const ELLIPSIS_RE = new RegExp(`(?:\\.{2,}|…)[${CLOSERS}]*\\s*$`);
const TRAILING_CLOSERS_RE = new RegExp(`[${CLOSERS}\\s]+$`);

/** A letter or combining mark of a script whose subtitles end a sentence with
 * no mark at all: Japanese, Chinese and Korean subtitling drops the final
 * full stop by convention, and Thai, Lao, Khmer and Burmese have none.
 * Script_Extensions rather than Script, so the kana long-vowel mark (ー)
 * counts; the letter/mark test keeps out the punctuation those scripts share
 * (、 and 。 carry the same extensions). */
const UNPUNCTUATED_SCRIPT_RE =
	/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Thai}\p{scx=Lao}\p{scx=Khmer}\p{scx=Myanmar}]/u;
const LETTER_OR_MARK_RE = /[\p{L}\p{M}]/u;

/**
 * True when the text ends on a word of a script that leaves sentence ends
 * unmarked, so a missing full stop there says nothing about whether the
 * sentence was cut short. A line that stops on a comma or colon does not
 * count: that is a real sign of a cut in any script.
 */
export function endsUnpunctuatedByConvention(text: string): boolean {
	const last = Array.from(text.replace(TRAILING_CLOSERS_RE, "")).pop();
	if (!last) return false;
	return LETTER_OR_MARK_RE.test(last) && UNPUNCTUATED_SCRIPT_RE.test(last);
}

/**
 * Returns true if the text ends with terminal punctuation indicating a complete
 * sentence/utterance. Ellipsis is treated as a continuation, not a terminal.
 */
export function endsWithTerminalPunctuation(text: string): boolean {
	if (!text) return false;
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (ELLIPSIS_RE.test(trimmed)) return false;
	return TERMINAL_PUNCT_RE.test(trimmed);
}

/**
 * Detect likely segment merges by comparing character-length ratios.
 * Returns indices where translation[i] appears to have absorbed translation[i+1].
 */
export function detectMergedSegments(originals: string[], translations: string[]): number[] {
	if (originals.length < 2 || originals.length !== translations.length) return [];

	const ratios = originals.map((orig, i) => {
		if (orig.length === 0) return 0;
		return translations[i].length / orig.length;
	});

	const suspects: number[] = [];
	for (let i = 0; i < originals.length - 1; i++) {
		// Skip if original ends with terminal punctuation (complete sentence) —
		// a complete original can't have its meaning absorbed forward.
		if (endsWithTerminalPunctuation(originals[i])) continue;

		// Signal A: extreme length-ratio contrast. A merged segment has a
		// much higher length ratio than its shifted neighbor.
		if (ratios[i + 1] > 0) {
			const contrast = ratios[i] / ratios[i + 1];
			if (contrast > 3) {
				suspects.push(i);
				continue;
			}
		}

		// Signal B: punctuation pattern flip. Original is mid-sentence (no
		// terminal punctuation) but the translation ends with terminal AND is
		// noticeably longer than expected — strongly suggests the next
		// segment's content was absorbed forward. Catches subtle merges where
		// the ratio contrast isn't extreme enough for Signal A.
		if (
			endsWithTerminalPunctuation(translations[i]) &&
			ratios[i] > 1.4
		) {
			suspects.push(i);
		}
	}

	return suspects;
}

/** Minimum linguistic substance before an identical output counts as
 * "untranslated" rather than legitimately unchanged (names, numbers, "OK",
 * onomatopoeia). Word count also shields CJK text, which has no spaces and so
 * never reaches the word threshold — identical CJK output is usually script
 * conversion territory we can't judge here. */
const MIN_UNTRANSLATED_LETTERS = 12;
const MIN_UNTRANSLATED_WORDS = 3;

function normalizeForComparison(text: string): string {
	return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Detect segments the LLM passed through untranslated: the output is
 * (case/whitespace-insensitively) identical to the input even though the input
 * has enough words that a real translation would differ. This is the failure
 * mode behind "some sentences stay in the source language" user reports.
 *
 * Unlike splits/merges this does NOT shift alignment, so each flagged index
 * can be repaired individually without touching downstream slots.
 */
export function detectUntranslatedSegments(
	originals: string[],
	translations: string[],
): number[] {
	if (originals.length !== translations.length) return [];

	const suspects: number[] = [];
	for (let i = 0; i < originals.length; i++) {
		const orig = originals[i];
		const trans = translations[i];
		if (!orig?.trim() || !trans?.trim()) continue;
		if (normalizeForComparison(orig) !== normalizeForComparison(trans)) continue;

		const letters = orig.match(/\p{L}/gu)?.length ?? 0;
		const words = orig
			.split(/\s+/)
			.filter((w) => /\p{L}/u.test(w)).length;
		if (letters >= MIN_UNTRANSLATED_LETTERS && words >= MIN_UNTRANSLATED_WORDS) {
			suspects.push(i);
		}
	}
	return suspects;
}

/**
 * Detect slots the LLM left blank: the original has text, the translation is
 * empty or whitespace. The count still matches, so nothing else notices — the
 * other detectors all skip a blank translation — and the cue would reach the
 * file with no text at all.
 *
 * A blank slot is usually the visible half of a merge: its content went into
 * a neighbour (most often the slot before it), so the caller should distrust
 * that neighbour too.
 */
export function detectEmptySegments(originals: string[], translations: string[]): number[] {
	if (originals.length !== translations.length) return [];

	const suspects: number[] = [];
	for (let i = 0; i < originals.length; i++) {
		if (originals[i]?.trim() && !translations[i]?.trim()) suspects.push(i);
	}
	return suspects;
}

/** English function words that reliably signal an English sentence. Curated to
 * EXCLUDE words that are everyday vocabulary in likely target languages, since
 * a false positive would trigger a pointless (and possibly lossy) re-translate:
 * no "a"/"i"/"to"/"on"/"my"/"was"/"do"/"by" (Polish), no "in"/"an"/"so"/"man"/
 * "will" (German), no "is" (Dutch), no "me"/"no" (Spanish/Italian), no "at"/
 * "her" (Danish/Norwegian). Ambiguous-but-rare collisions ("for" in
 * Scandinavian, "of" in Dutch, "as" in French) stay in — the hit-count
 * threshold absorbs them. */
const ENGLISH_MARKERS = new Set([
	"the", "and", "then", "than", "that", "this", "these", "those", "there",
	"their", "theirs", "they", "them", "it", "its", "are", "were", "been",
	"have", "has", "had", "does", "did", "doing", "would", "could", "should",
	"shall", "might", "must", "you", "your", "yours", "he", "him", "his",
	"she", "we", "our", "ours", "from", "with", "without", "of", "for", "but",
	"when", "which", "what", "who", "whom", "whose", "how", "why", "because",
	"not", "don't", "didn't", "doesn't", "can't", "won't", "isn't", "wasn't",
	"it's", "i'm", "i'll", "i've", "you're", "that's", "there's",
]);

/** Minimum evidence before a segment is called English: at least this many
 * marker hits AND at least this share of the segment's words. Both thresholds
 * exist to keep isolated loanwords/titles ("Oglądałem The Walking Dead") and
 * single-collision sentences (French "tu as", Danish "for") from flagging. */
const MIN_ENGLISH_HITS = 3;
const MIN_ENGLISH_RATIO = 0.25;
const MIN_ENGLISH_WORDS = 4;

/**
 * Detect segments the LLM wrote in English when the target language is
 * something else — the "instead of translating them into the target language,
 * it translates them into English" failure mode from user reports. English is
 * the model's strongest fallback language, so drift lands there regardless of
 * the source/target pair, which is what makes a fixed marker list workable.
 *
 * Like untranslated pass-throughs, English drift does NOT shift alignment, so
 * each flagged index can be repaired individually.
 */
export function detectEnglishDriftSegments(
	translations: string[],
	targetLanguage: string,
): number[] {
	if (targetLanguage === "English") return [];

	const suspects: number[] = [];
	for (let i = 0; i < translations.length; i++) {
		const words = (translations[i] ?? "")
			.toLowerCase()
			.match(/[\p{L}'’]+/gu);
		if (!words || words.length < MIN_ENGLISH_WORDS) continue;

		let hits = 0;
		for (const word of words) {
			if (ENGLISH_MARKERS.has(word.replace(/’/g, "'"))) hits++;
		}
		if (hits >= MIN_ENGLISH_HITS && hits / words.length >= MIN_ENGLISH_RATIO) {
			suspects.push(i);
		}
	}
	return suspects;
}

/**
 * Detect likely segment splits. A split happens when the LLM truncates one
 * source segment across multiple output slots, shifting all subsequent
 * translations by one or more positions.
 *
 * Primary signal: original ends with terminal punctuation (a complete sentence)
 * but the translation does NOT — meaning the translation was cut mid-sentence
 * and its tail spilled into the next slot.
 *
 * This is the exact failure mode that produces "unsync subtitles" in user
 * reports: long English sentences arriving in Spanish/French/Portuguese as
 * fragmented chunks scattered across adjacent timestamps.
 *
 * The signal only exists where the translation's script marks sentence ends.
 * For the scripts that do not (see endsUnpunctuatedByConvention) a split is
 * left to the merge and blank-slot detectors, which read lengths instead.
 */
export function detectSplitSegments(originals: string[], translations: string[]): number[] {
	if (originals.length !== translations.length || originals.length === 0) return [];

	const suspects: number[] = [];
	for (let i = 0; i < originals.length; i++) {
		const orig = originals[i];
		const trans = translations[i];
		if (!orig?.trim() || !trans?.trim()) continue;

		const origComplete = endsWithTerminalPunctuation(orig);
		const transComplete = endsWithTerminalPunctuation(trans);

		// A translation that ends on a word of a script with no sentence-final
		// mark is complete as far as punctuation can tell. Without this, one
		// file's English→Japanese translation had 268 correct cues flagged and
		// 1,205 of its 2,172 cues re-translated one by one.
		if (origComplete && !transComplete && !endsUnpunctuatedByConvention(trans)) {
			suspects.push(i);
		}
	}
	return suspects;
}
