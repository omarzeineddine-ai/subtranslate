import { describe, it, expect } from "vitest";
import { MAX_TITLE_LENGTH, validateContextRequest } from "@/lib/context-request";

describe("validateContextRequest", () => {
	it("accepts a title with optional numeric fields", () => {
		expect(validateContextRequest({ title: " Breaking Bad ", year: 2008, season: 1, episode: 1 })).toEqual({
			ok: true,
			query: { title: "Breaking Bad", year: 2008, season: 1, episode: 1 },
		});
	});

	it("omits absent or empty optional fields rather than passing undefined through", () => {
		const result = validateContextRequest({ title: "Dune", year: "", season: null });
		expect(result).toEqual({ ok: true, query: { title: "Dune" } });
	});

	it("rejects a missing, blank, or oversized title", () => {
		for (const title of [undefined, "", "   ", 42, "x".repeat(MAX_TITLE_LENGTH + 1)]) {
			expect(validateContextRequest({ title })).toEqual({
				ok: false,
				error: "Title missing or too long",
			});
		}
	});

	it("rejects out-of-range or non-integer numbers", () => {
		for (const bad of [{ year: 1500 }, { year: "2008" }, { season: -1 }, { episode: 1.5 }]) {
			expect(validateContextRequest({ title: "Dune", ...bad }).ok).toBe(false);
		}
	});

	it("rejects non-object bodies", () => {
		expect(validateContextRequest(null)).toEqual({ ok: false, error: "Invalid request body" });
		expect(validateContextRequest("Dune")).toEqual({ ok: false, error: "Invalid request body" });
	});
});
