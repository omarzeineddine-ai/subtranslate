import { describe, it, expect } from "vitest";
import {
	PREFERRED_LANGUAGE_KEY,
	initialLanguage,
	readPreferredLanguage,
	readRequestedLanguage,
	writePreferredLanguage,
	type LanguageStore,
} from "@/lib/language-preference";
import { languageToSlug } from "@/lib/languages";

const memoryStore = (initial: Record<string, string> = {}): LanguageStore & { data: Record<string, string> } => {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => (key in data ? data[key] : null),
		setItem: (key, value) => {
			data[key] = value;
		},
	};
};

const throwingStore: LanguageStore = {
	getItem: () => {
		throw new Error("SecurityError");
	},
	setItem: () => {
		throw new Error("QuotaExceededError");
	},
};

describe("readPreferredLanguage", () => {
	it("returns the saved language when it is in the catalog", () => {
		const store = memoryStore({ [PREFERRED_LANGUAGE_KEY]: "Polish" });
		expect(readPreferredLanguage(store)).toBe("Polish");
	});

	it("returns undefined when nothing was saved", () => {
		expect(readPreferredLanguage(memoryStore())).toBeUndefined();
	});

	it("ignores a saved value that is not a known language", () => {
		const store = memoryStore({ [PREFERRED_LANGUAGE_KEY]: "Klingon" });
		expect(readPreferredLanguage(store)).toBeUndefined();
	});

	it("ignores an empty saved value", () => {
		const store = memoryStore({ [PREFERRED_LANGUAGE_KEY]: "" });
		expect(readPreferredLanguage(store)).toBeUndefined();
	});

	it("survives a storage that throws on access", () => {
		expect(readPreferredLanguage(throwingStore)).toBeUndefined();
	});

	it("survives a missing storage", () => {
		expect(readPreferredLanguage(undefined)).toBeUndefined();
	});
});

describe("writePreferredLanguage", () => {
	it("saves a known language", () => {
		const store = memoryStore();
		writePreferredLanguage(store, "French");
		expect(store.data[PREFERRED_LANGUAGE_KEY]).toBe("French");
	});

	it("does not save an unknown language", () => {
		const store = memoryStore();
		writePreferredLanguage(store, "Klingon");
		expect(store.data).toEqual({});
	});

	it("does not save the empty placeholder choice", () => {
		const store = memoryStore({ [PREFERRED_LANGUAGE_KEY]: "French" });
		writePreferredLanguage(store, "");
		expect(store.data[PREFERRED_LANGUAGE_KEY]).toBe("French");
	});

	it("swallows storage failures", () => {
		expect(() => writePreferredLanguage(throwingStore, "French")).not.toThrow();
	});

	it("round-trips through read", () => {
		const store = memoryStore();
		writePreferredLanguage(store, "Japanese");
		expect(readPreferredLanguage(store)).toBe("Japanese");
	});
});

describe("readRequestedLanguage", () => {
	it("resolves a language slug from the query", () => {
		expect(readRequestedLanguage("?to=french")).toBe("French");
		expect(readRequestedLanguage(`?to=${languageToSlug("Spanish (Spain)")}`)).toBe("Spanish (Spain)");
	});

	it("ignores a missing, empty, or unknown slug", () => {
		expect(readRequestedLanguage("")).toBeUndefined();
		expect(readRequestedLanguage("?to=")).toBeUndefined();
		expect(readRequestedLanguage("?to=klingon")).toBeUndefined();
		expect(readRequestedLanguage("?from=french")).toBeUndefined();
	});
});

describe("initialLanguage", () => {
	it("prefers the requested language over the remembered one", () => {
		const store = memoryStore({ [PREFERRED_LANGUAGE_KEY]: "German" });
		expect(initialLanguage("?to=french", store)).toBe("French");
	});

	it("falls back to the remembered language when the query names nothing", () => {
		const store = memoryStore({ [PREFERRED_LANGUAGE_KEY]: "German" });
		expect(initialLanguage("?to=klingon", store)).toBe("German");
		expect(initialLanguage("", store)).toBe("German");
	});

	it("returns undefined with neither a query nor a store", () => {
		expect(initialLanguage("", undefined)).toBeUndefined();
	});
});
