import { describe, expect, it } from "vitest";
import { CLEAN_HANDOFF_KEY, offerCleanedFile, takeCleanedFile, type HandoffStore } from "@/lib/clean-handoff";

const memoryStore = (initial: Record<string, string> = {}): HandoffStore & { data: Record<string, string> } => {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => (key in data ? data[key] : null),
		setItem: (key, value) => {
			data[key] = value;
		},
		removeItem: (key) => {
			delete data[key];
		},
	};
};

const throwingStore: HandoffStore = {
	getItem: () => {
		throw new Error("SecurityError");
	},
	setItem: () => {
		throw new Error("QuotaExceededError");
	},
	removeItem: () => {
		throw new Error("SecurityError");
	},
};

const FILE = { name: "movie-cleaned.srt", content: "1\n00:00:01,000 --> 00:00:02,000\nHello\n" };

describe("clean handoff", () => {
	it("hands the offered file to whoever takes it", () => {
		const store = memoryStore();
		offerCleanedFile(store, FILE);
		expect(takeCleanedFile(store)).toEqual(FILE);
	});

	it("gives the file out once", () => {
		const store = memoryStore();
		offerCleanedFile(store, FILE);
		takeCleanedFile(store);
		expect(takeCleanedFile(store)).toBeUndefined();
		expect(store.data).toEqual({});
	});

	it("returns nothing when no file was offered", () => {
		expect(takeCleanedFile(memoryStore())).toBeUndefined();
		expect(takeCleanedFile(undefined)).toBeUndefined();
	});

	it("discards a stored value that is not a file", () => {
		for (const raw of ["not json", "{}", JSON.stringify({ name: "a.srt" }), JSON.stringify({ name: "", content: "x" })]) {
			const store = memoryStore({ [CLEAN_HANDOFF_KEY]: raw });
			expect(takeCleanedFile(store)).toBeUndefined();
			expect(store.data).toEqual({});
		}
	});

	it("never throws when storage does", () => {
		expect(() => offerCleanedFile(throwingStore, FILE)).not.toThrow();
		expect(takeCleanedFile(throwingStore)).toBeUndefined();
	});
});
