import { describe, it, expect } from "vitest";
import {
	MAX_CONTENT_BYTES,
	MAX_API_KEY_LENGTH,
	MAX_CONTEXT_LENGTH,
	normalizeApiKey,
	validateTranslationRequest,
} from "@/lib/translation-request";

const VALID = {
	content: "1\n00:00:01,000 --> 00:00:02,000\nHello",
	language: "French",
	netflixFormat: true,
	context: "A short film.",
};

describe("validateTranslationRequest", () => {
	it("accepts a well-formed request verbatim", () => {
		const result = validateTranslationRequest(VALID);
		expect(result).toEqual({ ok: true, request: VALID });
	});

	it("defaults netflixFormat and context when absent", () => {
		const result = validateTranslationRequest({ content: VALID.content, language: "French" });
		expect(result).toEqual({
			ok: true,
			request: { content: VALID.content, language: "French", netflixFormat: false, context: "" },
		});
	});

	it("rejects unsupported or missing languages", () => {
		for (const language of ["Klingon", "", undefined, 42]) {
			const result = validateTranslationRequest({ ...VALID, language });
			expect(result).toEqual({ ok: false, error: "Unsupported language" });
		}
	});

	it("rejects missing, non-string, or oversized content", () => {
		for (const content of ["", undefined, 42, "x".repeat(MAX_CONTENT_BYTES + 1)]) {
			const result = validateTranslationRequest({ ...VALID, content });
			expect(result).toEqual({ ok: false, error: "Content too large or missing" });
		}
	});

	it("accepts content exactly at the size cap", () => {
		const result = validateTranslationRequest({ ...VALID, content: "x".repeat(MAX_CONTENT_BYTES) });
		expect(result.ok).toBe(true);
	});

	it("measures the cap in UTF-8 bytes, not characters", () => {
		// Two bytes per Cyrillic letter: under the cap in characters, over it in bytes.
		const content = "я".repeat(MAX_CONTENT_BYTES / 2 + 1);
		const result = validateTranslationRequest({ ...VALID, content });
		expect(result).toEqual({ ok: false, error: "Content too large or missing" });
	});

	it("truncates oversized context instead of rejecting", () => {
		const result = validateTranslationRequest({ ...VALID, context: "y".repeat(MAX_CONTEXT_LENGTH + 500) });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.request.context).toHaveLength(MAX_CONTEXT_LENGTH);
	});

	it("coerces non-string context and non-true netflixFormat to safe defaults", () => {
		const result = validateTranslationRequest({ ...VALID, context: { evil: true }, netflixFormat: "yes" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.request.context).toBe("");
			expect(result.request.netflixFormat).toBe(false);
		}
	});

	it("carries the user's own API key, trimmed", () => {
		const result = validateTranslationRequest({ ...VALID, apiKey: "  sk-test-1234567890abcdef\n" });
		expect(result).toEqual({ ok: true, request: { ...VALID, apiKey: "sk-test-1234567890abcdef" } });
	});

	it("treats a missing, empty or blank key as no key", () => {
		for (const apiKey of [undefined, null, "", "   "]) {
			const result = validateTranslationRequest({ ...VALID, apiKey });
			expect(result.ok).toBe(true);
			if (result.ok) expect("apiKey" in result.request).toBe(false);
		}
	});

	it("rejects a key that cannot be one instead of falling back to the server's", () => {
		for (const apiKey of [42, { key: "sk-x" }, "sk with spaces 1234567890", "short", "sk-ключ-1234567890", "sk-line\nbreak-1234567890", "x".repeat(MAX_API_KEY_LENGTH + 1)]) {
			const result = validateTranslationRequest({ ...VALID, apiKey });
			expect(result).toEqual({ ok: false, error: "That does not look like an API key" });
		}
	});

	it("rejects non-object bodies", () => {
		for (const body of [null, "string", 42, undefined]) {
			expect(validateTranslationRequest(body).ok).toBe(false);
		}
	});

	it("ignores extra fields such as filename — they never reach the request", () => {
		const result = validateTranslationRequest({ ...VALID, filename: "movie.srt" });
		expect(result).toEqual({ ok: true, request: VALID });
	});
});

describe("normalizeApiKey", () => {
	it("returns the key without surrounding whitespace", () => {
		expect(normalizeApiKey(" sk-proj-abcDEF_123-xyz ")).toBe("sk-proj-abcDEF_123-xyz");
	});
	it("accepts a key exactly at the length cap", () => {
		expect(normalizeApiKey("k".repeat(MAX_API_KEY_LENGTH))).toHaveLength(MAX_API_KEY_LENGTH);
	});
	it("is undefined for anything that cannot go in a header", () => {
		expect(normalizeApiKey("sk-a b-1234567890")).toBeUndefined();
		expect(normalizeApiKey("sk-\u0000-1234567890")).toBeUndefined();
		expect(normalizeApiKey("")).toBeUndefined();
		expect(normalizeApiKey(undefined)).toBeUndefined();
	});
});
