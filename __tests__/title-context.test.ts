import { describe, it, expect } from "vitest";
import {
	MAX_CHARACTERS,
	formatTitleContext,
	mergeTitleInfo,
	truncateProse,
	type TitleInfo,
} from "@/lib/title-context";
import { MAX_CONTEXT_LENGTH } from "@/lib/translation-request";

const BREAKING_BAD: TitleInfo = {
	title: "Breaking Bad",
	mediaType: "tv",
	year: 2008,
	genres: ["Drama", "Crime"],
	overview:
		"Walter White, a chemistry teacher, discovers that he has cancer and decides to get into the meth-making business to repay his medical debts.",
	characters: [
		{ name: "Walter White", gender: "man" },
		{ name: "Skyler White", gender: "woman" },
		{ name: "Jesse Pinkman" },
	],
};

describe("formatTitleContext", () => {
	it("leads with title, kind, year and genres", () => {
		const text = formatTitleContext(BREAKING_BAD);
		expect(text.split("\n")[0]).toBe('"Breaking Bad" (TV series, 2008). Genres: Drama, Crime.');
	});

	it("lists characters with gender when known", () => {
		expect(formatTitleContext(BREAKING_BAD)).toContain(
			"Characters: Walter White (man), Skyler White (woman), Jesse Pinkman.",
		);
	});

	it("includes the synopsis", () => {
		expect(formatTitleContext(BREAKING_BAD)).toContain("Synopsis: Walter White, a chemistry teacher");
	});

	it("adds an episode line for TV episodes", () => {
		const text = formatTitleContext({
			...BREAKING_BAD,
			episode: { season: 1, episode: 1, name: "Pilot", overview: "Walter starts cooking." },
		});
		expect(text).toContain('Episode S1E1 "Pilot": Walter starts cooking.');
	});

	it("describes a film without a year or genres", () => {
		const text = formatTitleContext({
			title: "Untitled",
			mediaType: "movie",
			genres: [],
			overview: "",
			characters: [],
		});
		expect(text).toBe('"Untitled" (Film).');
	});

	it("caps the character list", () => {
		const characters = Array.from({ length: 40 }, (_, i) => ({ name: `Person ${i}` }));
		const text = formatTitleContext({ ...BREAKING_BAD, characters });
		expect(text).toContain(`Person ${MAX_CHARACTERS - 1}`);
		expect(text).not.toContain(`Person ${MAX_CHARACTERS},`);
	});

	it("never exceeds the request context cap", () => {
		const text = formatTitleContext({
			...BREAKING_BAD,
			title: "T".repeat(1500),
			overview: "Long sentence. ".repeat(200),
			characters: Array.from({ length: 15 }, (_, i) => ({ name: "N".repeat(100) + i })),
		});
		expect(text.length).toBeLessThanOrEqual(MAX_CONTEXT_LENGTH);
	});
});

describe("truncateProse", () => {
	it("returns short text unchanged, whitespace collapsed", () => {
		expect(truncateProse("  a  b\n c ", 100)).toBe("a b c");
	});

	it("cuts at the last full sentence within the limit", () => {
		expect(truncateProse("One two. Three four. Five six seven.", 25)).toBe("One two. Three four.");
	});

	it("falls back to a word boundary with an ellipsis", () => {
		expect(truncateProse("alpha beta gamma delta", 14)).toBe("alpha beta…");
	});
});

describe("mergeTitleInfo", () => {
	const wiki: TitleInfo = {
		title: "Breaking Bad",
		mediaType: "tv",
		year: 2008,
		genres: [],
		overview: "The first season aired in 2008.",
		characters: [{ name: "Walter White" }, { name: "Jesse Pinkman" }],
		episode: { season: 1, episode: 1, name: "Pilot", overview: "A long and detailed summary of the pilot episode." },
	};
	const tmdb: TitleInfo = {
		title: "Breaking Bad",
		mediaType: "tv",
		year: 2008,
		genres: ["Drama", "Crime"],
		overview: "A chemistry teacher turns to crime.",
		characters: [
			{ name: "Walter White", gender: "man" },
			{ name: "Skyler White", gender: "woman" },
		],
		episode: { season: 1, episode: 1, name: "Pilot", overview: "Short overview." },
	};

	it("returns the primary untouched when there is no secondary", () => {
		expect(mergeTitleInfo(wiki, null)).toBe(wiki);
	});

	it("fills genres from the secondary, keeps the primary overview, and takes the longer episode summary", () => {
		const merged = mergeTitleInfo(wiki, tmdb);
		expect(merged.genres).toEqual(["Drama", "Crime"]);
		expect(merged.overview).toBe(wiki.overview);
		expect(merged.episode).toEqual(wiki.episode);
		expect(mergeTitleInfo(tmdb, wiki).episode?.overview).toBe(wiki.episode?.overview);
	});

	it("unions characters in primary order and copies genders the primary lacks", () => {
		expect(mergeTitleInfo(wiki, tmdb).characters).toEqual([
			{ name: "Walter White", gender: "man" },
			{ name: "Jesse Pinkman" },
			{ name: "Skyler White", gender: "woman" },
		]);
		expect(wiki.characters[0]).toEqual({ name: "Walter White" });
	});

	it("takes the episode from whichever side has one", () => {
		expect(mergeTitleInfo({ ...wiki, episode: undefined }, tmdb).episode).toEqual(tmdb.episode);
		expect(mergeTitleInfo(wiki, { ...tmdb, episode: undefined }).episode).toEqual(wiki.episode);
	});
});
