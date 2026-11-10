import { describe, expect, it } from "vitest";
import {
	STORED_API_KEY,
	apiKeyState,
	describeRefusal,
	readStoredApiKey,
	writeStoredApiKey,
	type KeyStore,
} from "@/lib/api-key";

const KEY = "sk-proj-abcDEF_123-xyz";

function memoryStore(initial: Record<string, string> = {}): KeyStore & { data: Record<string, string> } {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => (key in data ? data[key] : null),
		setItem: (key, value) => { data[key] = value; },
		removeItem: (key) => { delete data[key]; },
	};
}

const throwingStore: KeyStore = {
	getItem: () => { throw new Error("SecurityError"); },
	setItem: () => { throw new Error("QuotaExceededError"); },
	removeItem: () => { throw new Error("SecurityError"); },
};

describe("readStoredApiKey", () => {
	it("returns the remembered key", () => {
		expect(readStoredApiKey(memoryStore({ [STORED_API_KEY]: KEY }))).toBe(KEY);
	});
	it("is undefined when nothing was saved", () => {
		expect(readStoredApiKey(memoryStore())).toBeUndefined();
	});
	it("ignores a saved value that could not be a key", () => {
		expect(readStoredApiKey(memoryStore({ [STORED_API_KEY]: "not a key" }))).toBeUndefined();
	});
	it("is undefined without storage, or when storage throws", () => {
		expect(readStoredApiKey(undefined)).toBeUndefined();
		expect(readStoredApiKey(throwingStore)).toBeUndefined();
	});
});

describe("writeStoredApiKey", () => {
	it("saves a key, trimmed", () => {
		const store = memoryStore();
		writeStoredApiKey(store, `  ${KEY} `);
		expect(store.data[STORED_API_KEY]).toBe(KEY);
	});
	it("forgets the saved key when given none", () => {
		const store = memoryStore({ [STORED_API_KEY]: KEY });
		writeStoredApiKey(store, undefined);
		expect(STORED_API_KEY in store.data).toBe(false);
	});
	it("forgets the saved key rather than keep one beside an unusable value", () => {
		const store = memoryStore({ [STORED_API_KEY]: KEY });
		writeStoredApiKey(store, "has a space in it 123");
		expect(STORED_API_KEY in store.data).toBe(false);
	});
	it("does nothing without storage and swallows storage failures", () => {
		expect(() => writeStoredApiKey(undefined, KEY)).not.toThrow();
		expect(() => writeStoredApiKey(throwingStore, KEY)).not.toThrow();
		expect(() => writeStoredApiKey(throwingStore, undefined)).not.toThrow();
	});
});

describe("apiKeyState", () => {
	it("tells an empty field from a bad value from a usable key", () => {
		expect(apiKeyState("")).toBe("empty");
		expect(apiKeyState("   ")).toBe("empty");
		expect(apiKeyState("my key is sk-123")).toBe("invalid");
		expect(apiKeyState("short")).toBe("invalid");
		expect(apiKeyState(` ${KEY}\n`)).toBe("ok");
	});
});

describe("describeRefusal", () => {
	it("says what to fix for each reason when the key is the user's own", () => {
		expect(describeRefusal("invalid_key", true)).toMatch(/rejected this API key/);
		expect(describeRefusal("no_credits", true)).toMatch(/no credits left/);
		expect(describeRefusal("no_access", true)).toMatch(/not allowed to use the translation model/);
		expect(describeRefusal("unknown", true)).toMatch(/refused this API key/);
	});
	it("asks for the user's own key when the site's key was the one refused", () => {
		for (const reason of ["invalid_key", "no_credits", "no_access", "unknown"] as const) {
			const message = describeRefusal(reason, false);
			expect(message).toMatch(/Add your own OpenAI API key/);
			// Not their key, so nothing about "this key" being wrong.
			expect(message).not.toMatch(/rejected|credits/);
		}
	});
});
