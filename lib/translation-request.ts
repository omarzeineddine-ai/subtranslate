import { LANGUAGES } from "@/lib/languages";

/**
 * The translation request — the one shape that crosses every seam between
 * the form, the client, and the route, together with the limits that cap its
 * fields and the validator the route runs. The filename deliberately stays
 * out: it is client-side state (used to derive the download name) and has no
 * business on the wire.
 */

export interface TranslationRequest {
	content: string;
	language: string;
	netflixFormat: boolean;
	context: string;
	/** The user's own OpenAI API key, when they bring one. It pays for this
	 * request only: the route hands it to the provider and keeps no copy. */
	apiKey?: string;
}

/** Longest API key accepted. OpenAI's are around 160 characters; the cap only
 * keeps junk out of the Authorization header. */
export const MAX_API_KEY_LENGTH = 300;

/** A key is one run of printable ASCII: anything else (a space, a line
 * break, a pasted sentence) cannot be a key and would corrupt the header it
 * is sent in. Returns the trimmed key, or undefined when it cannot be one. */
export function normalizeApiKey(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const key = value.trim();
	if (key.length < 8 || key.length > MAX_API_KEY_LENGTH) return undefined;
	return /^[\x21-\x7E]+$/.test(key) ? key : undefined;
}

/** SRT file size cap, in UTF-8 bytes. Counted in bytes, not characters,
 * because the platform caps request bodies in bytes (4.5 MB on Vercel): a
 * Cyrillic or CJK file takes two or three bytes per character, so a cap in
 * characters let through files the platform rejects before the route runs.
 * The headroom covers the JSON escaping and the other fields. */
export const MAX_CONTENT_BYTES = 4_000_000;

/** Whether the content is over the size cap. */
export function isContentTooLarge(content: string): boolean {
	// Every character is at least one byte, so a short string needs no encoding.
	return content.length > MAX_CONTENT_BYTES / 3 && new TextEncoder().encode(content).length > MAX_CONTENT_BYTES;
}

/** Cap on the optional user-provided context. Long enough for a synopsis and
 * a character list, short enough to keep the per-batch token overhead small. */
export const MAX_CONTEXT_LENGTH = 2000;

export type RequestValidation =
	| { ok: true; request: TranslationRequest }
	| { ok: false; error: string };

/**
 * Validate an untrusted request body into a TranslationRequest.
 * Context is truncated to its cap rather than rejected; everything else
 * fails loudly.
 */
export function validateTranslationRequest(body: unknown): RequestValidation {
	if (typeof body !== "object" || body === null) {
		return { ok: false, error: "Invalid request body" };
	}
	const { content, language, netflixFormat = false, context = "", apiKey } =
		body as Record<string, unknown>;

	if (typeof language !== "string" || !LANGUAGES.includes(language)) {
		return { ok: false, error: "Unsupported language" };
	}

	if (!content || typeof content !== "string" || isContentTooLarge(content)) {
		return { ok: false, error: "Content too large or missing" };
	}

	// No key (absent, empty, blank) means "use the server's". A key that is
	// there but cannot be one fails loudly: silently falling back would bill
	// the server for a request the user meant to pay for.
	const hasKey = apiKey !== undefined && apiKey !== null && !(typeof apiKey === "string" && !apiKey.trim());
	const key = hasKey ? normalizeApiKey(apiKey) : undefined;
	if (hasKey && !key) {
		return { ok: false, error: "That does not look like an API key" };
	}

	return {
		ok: true,
		request: {
			content,
			language,
			netflixFormat: netflixFormat === true,
			context: typeof context === "string" ? context.slice(0, MAX_CONTEXT_LENGTH) : "",
			...(key ? { apiKey: key } : {}),
		},
	};
}
