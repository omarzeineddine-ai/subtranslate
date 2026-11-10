import { describe, it, expect } from "vitest";
import {
	LANGUAGES,
	LANGUAGE_CODES,
	LANGUAGE_COUNT_LABEL,
	LANGUAGE_PAIRS,
	POPULAR_LANGUAGES,
	languageToSlug,
	slugToLanguage,
} from "@/lib/languages";
import { LANGUAGE_DATA, RELATED_LANGUAGES } from "@/lib/language-data";

describe("language catalog invariants", () => {
	const known = new Set(LANGUAGES);

	it("every LANGUAGE_PAIRS entry uses known languages and never pairs a language with itself", () => {
		for (const pair of LANGUAGE_PAIRS) {
			expect(known.has(pair.source), `unknown pair source: ${pair.source}`).toBe(true);
			expect(known.has(pair.target), `unknown pair target: ${pair.target}`).toBe(true);
			expect(pair.source).not.toBe(pair.target);
		}
	});

	it("has no duplicate pairs", () => {
		const keys = LANGUAGE_PAIRS.map((p) => `${p.source}→${p.target}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("every POPULAR_LANGUAGES entry is a known language", () => {
		for (const language of POPULAR_LANGUAGES) {
			expect(known.has(language), `unknown popular language: ${language}`).toBe(true);
		}
	});

	it("every LANGUAGE_DATA key is a known language", () => {
		for (const key of Object.keys(LANGUAGE_DATA)) {
			expect(known.has(key), `unknown LANGUAGE_DATA key: ${key}`).toBe(true);
		}
	});

	it("every RELATED_LANGUAGES key and value is a known language", () => {
		for (const [key, related] of Object.entries(RELATED_LANGUAGES)) {
			expect(known.has(key), `unknown RELATED_LANGUAGES key: ${key}`).toBe(true);
			for (const language of related) {
				expect(known.has(language), `unknown related language under ${key}: ${language}`).toBe(true);
			}
		}
	});
});

describe("LANGUAGE_CODES", () => {
	it("has a code for exactly the known languages", () => {
		expect(Object.keys(LANGUAGE_CODES).sort()).toEqual(LANGUAGES);
	});

	it("gives every language its own code", () => {
		const codes = Object.values(LANGUAGE_CODES);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it("writes every code as a language subtag with an optional script or region", () => {
		for (const [language, code] of Object.entries(LANGUAGE_CODES)) {
			expect(code, language).toMatch(/^[a-z]{2,3}(-(?:[A-Z][a-z]{3}|[A-Z]{2}))?$/);
		}
	});
});

describe("LANGUAGES", () => {
	it("contains no duplicates", () => {
		expect(new Set(LANGUAGES).size).toBe(LANGUAGES.length);
	});

	it("is sorted alphabetically", () => {
		expect([...LANGUAGES].sort()).toEqual(LANGUAGES);
	});

	it("includes Bulgarian (user request)", () => {
		expect(LANGUAGES).toContain("Bulgarian");
	});

	it("includes Slovak (user request)", () => {
		expect(LANGUAGES).toContain("Slovak");
	});

	it("includes Portuguese (Portugal) alongside Portuguese (user request)", () => {
		expect(LANGUAGES).toContain("Portuguese");
		expect(LANGUAGES).toContain("Portuguese (Portugal)");
	});
});

describe("slug round-trip", () => {
	it("every language survives languageToSlug → slugToLanguage", () => {
		for (const lang of LANGUAGES) {
			expect(slugToLanguage(languageToSlug(lang))).toBe(lang);
		}
	});

	it("slugs are lowercase words joined by single hyphens", () => {
		for (const lang of LANGUAGES) {
			expect(languageToSlug(lang)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});

	it("drops the parentheses of a regional variant", () => {
		expect(languageToSlug("Spanish (Spain)")).toBe("spanish-spain");
		expect(languageToSlug("Portuguese (Portugal)")).toBe("portuguese-portugal");
	});

	it("gives every language its own slug", () => {
		const slugs = LANGUAGES.map(languageToSlug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it("returns undefined for unknown slugs", () => {
		expect(slugToLanguage("klingon")).toBeUndefined();
	});
});

describe("language count label", () => {
	it("rounds the catalog size down to the nearest ten with a plus", () => {
		expect(LANGUAGE_COUNT_LABEL).toBe(`${Math.floor(LANGUAGES.length / 10) * 10}+`);
		expect(LANGUAGE_COUNT_LABEL).toMatch(/^\d+0\+$/);
	});

	it("never overstates the catalog", () => {
		expect(Number.parseInt(LANGUAGE_COUNT_LABEL, 10)).toBeLessThanOrEqual(LANGUAGES.length);
	});
});
