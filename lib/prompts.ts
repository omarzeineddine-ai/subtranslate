/** In-content newline sentinel. SRT segments often have embedded `\n` (line-2
 * of a two-line cue). If we send those literal newlines to the batch LLM, it
 * treats them as item delimiters and emits one output per visual line — which
 * inflates the output count and breaks 1:1 alignment with the input. We swap
 * `\n` for this U+23CE before the call and swap it back after. Picked because
 * it's a single codepoint and effectively never appears in real subtitles. */
export const LINEBREAK_SENTINEL = "⏎";

/** Characters per line under Netflix's per-language timed text style
 * guides. Chinese, Japanese and Korean set a line in wide characters, so it
 * holds far fewer of them; Thai's limit sits between. Every language not
 * listed uses the Latin-script default. */
const NETFLIX_LINE_LIMITS: Record<string, number> = {
	Japanese: 13,
	Korean: 16,
	"Simplified Chinese": 16,
	"Traditional Chinese": 16,
	"Yue Chinese": 16,
	"Wu Chinese": 16,
	"Jin Chinese": 16,
	"Xiang Chinese": 16,
	"Min Nan": 16,
	Hakka: 16,
	Thai: 35,
};

const DEFAULT_NETFLIX_LINE_LIMIT = 42;

/** Netflix's lines-per-subtitle limit, the same for every language. */
export const NETFLIX_MAX_LINES = 2;

/** Netflix's characters-per-line limit for a target language. */
export function netflixLineLimit(language: string): number {
	return NETFLIX_LINE_LIMITS[language] ?? DEFAULT_NETFLIX_LINE_LIMIT;
}

function netflixRules(language: string): string {
	const limit = netflixLineLimit(language);
	return `
NETFLIX FORMATTING:
- Max ${NETFLIX_MAX_LINES} lines per subtitle segment
- Max ${limit} characters per line
- Break lines at natural linguistic points (after punctuation, conjunctions, or clause boundaries)
- If a translation exceeds ${limit} chars, split into ${NETFLIX_MAX_LINES} lines with a line break (\\n)
- Never break a line in the middle of a word or name`;
}

/** Regional variants need explicit steering — the bare label ("Portuguese
 * (Portugal)") is not enough to keep the model from drifting into the variant
 * that dominates its training data (Brazilian Portuguese, Latin American
 * Spanish). Keyed by the LANGUAGES entry; anything not listed passes through. */
const LANGUAGE_VARIANT_SPECS: Record<string, string> = {
	"Portuguese (Portugal)":
		'European Portuguese as spoken in Portugal — use European Portuguese vocabulary, spelling, and grammar (e.g. "a fazer", not the Brazilian "fazendo"; "pequeno-almoço", not "café da manhã"; informal "tu" where natural). NEVER use Brazilian Portuguese',
	"Spanish (Spain)":
		'European Spanish as spoken in Spain — use Castilian vocabulary and grammar (e.g. "vosotros" for informal plural, "coche", "ordenador"). NEVER use Latin American Spanish',
};

/** Expand a target-language label into an unambiguous prompt description. */
export function describeTargetLanguage(language: string): string {
	return LANGUAGE_VARIANT_SPECS[language] ?? language;
}

const ALIGNMENT_RULES = (expectedCount: number, language: string) => `You translate subtitle segments to ${describeTargetLanguage(language)}.

You receive ${expectedCount} numbered input segments. You must return EXACTLY ${expectedCount} translations as a string array, in the same order.

NON-NEGOTIABLE ALIGNMENT RULES (violating these breaks the subtitle file):
1. translations[i] must contain ONLY the translation of input segment [i+1] — nothing from any other segment.
2. NEVER split content across multiple array items. If a translation is long, embed a newline (\\n) WITHIN that single string. Never produce extra items.
3. NEVER merge two input segments into one item. Each input maps to exactly one output, even when the inputs flow as a single sentence.
4. Preserve the input segmentation EXACTLY. The timing track is locked to the original segments — your job is translation, not subtitle re-segmentation.
5. When a sentence spans multiple input segments (e.g. one ends with a comma and the next continues), translate each piece into its own slot. Word order may differ in ${language}, but the item count must stay identical.
6. The character "${LINEBREAK_SENTINEL}" inside an input segment marks an in-content line break (the original subtitle was displayed on two lines). Treat it as part of the content of that single segment — NEVER as a separator between segments. In your translation, keep "${LINEBREAK_SENTINEL}" at a natural breaking point, or drop it if the translated word order doesn't allow a clean break.

TARGET LANGUAGE RULE: Every single output item must be written in ${language}. Never leave an item in the source language and never fall back to English${language === "English" ? "" : " — English is NOT the target"}. This applies to every item, including short fragments, mid-sentence continuations, and lines you are unsure about; if a segment is hard to translate, still produce your best ${language} translation rather than copying the input or switching language. Only proper names, numbers, and untranslatable onomatopoeia may remain as-is.`;

export interface PromptOptions {
	netflixFormat?: boolean;
	/** Optional user-provided description of the video (synopsis, character
	 * names/genders, tone). Subtitle text alone often can't resolve gendered
	 * grammar (Polish past-tense verb endings, French adjective agreement) or
	 * formality — this is the missing signal. */
	context?: string;
}

function contextBlock(context: string | undefined): string {
	const trimmed = context?.trim();
	if (!trimmed) return "";
	return `

VIDEO CONTEXT (provided by the user — use it to resolve ambiguity such as speaker gender, grammatical gender agreement, formality, names, and terminology; it is background information, never content to translate or output):
${trimmed}`;
}

/** System prompt for the structured-output batch translator. */
export function buildBatchSystemPrompt(
	expectedCount: number,
	language: string,
	options: PromptOptions = {},
): string {
	return `${ALIGNMENT_RULES(expectedCount, language)}${options.netflixFormat ? "\n" + netflixRules(language) : ""}${contextBlock(options.context)}`;
}

/** System prompt for the per-segment fallback translator. */
export function buildSingleSystemPrompt(
	language: string,
	options: PromptOptions = {},
): string {
	return `Translate the following single subtitle segment to ${describeTargetLanguage(language)}. Output ONLY the translation, with no quotes, no commentary, no labels, no numbering. Preserve any embedded newlines. Even if the segment looks like an incomplete fragment (e.g. ends with a comma), translate exactly that fragment — do not invent a continuation or merge with anything else. Your output must be written in ${language} — never leave the segment in its source language and never fall back to English${language === "English" ? "" : " (English is NOT the target)"}.${options.netflixFormat ? "\n" + netflixRules(language) : ""}${contextBlock(options.context)}`;
}
