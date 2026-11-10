import { describe, it, expect, vi } from "vitest";
import wtf from "wtf_wikipedia";
import {
	candidatePages,
	charactersFromDocument,
	episodeFromDocument,
	fetchFirstPage,
	fetchPage,
	lookupTitle,
	showTitleFromPage,
	titleInfoFromDocument,
} from "@/lib/wikipedia";

/** Serve canned wikitext per page title, in the MediaWiki revisions shape; null means the page is missing. */
function fakeFetch(pages: Record<string, string | null>) {
	const calls: URL[] = [];
	const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
		calls.push(url);
		const title = url.searchParams.get("titles") ?? "";
		const wikitext = pages[title];
		const page =
			wikitext === undefined || wikitext === null
				? { title, missing: true }
				: { title, revisions: [{ slots: { main: { content: wikitext } } }] };
		void init;
		return new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200 });
	});
	return { fetchFn: fetchFn as unknown as typeof fetch, calls, mock: fetchFn };
}

const requestedTitles = (calls: URL[]) => calls.map((url) => url.searchParams.get("titles"));


/** A fetch that never answers on its own: like the real one, it rejects
 * only once the request's signal aborts. Stands in for a hung upstream. */
const hangingFetch = (async (_input: string | URL | Request, init?: RequestInit) =>
	new Promise<Response>((_, reject) => {
		const signal = init?.signal;
		if (signal?.aborted) return reject(signal.reason);
		signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
	})) as typeof fetch;

describe("candidatePages", () => {
	it("tries the season page, the episode list, then the main article for a show", () => {
		expect(candidatePages({ title: "The Sopranos", season: 1, episode: 1 })).toEqual([
			"The Sopranos season 1",
			"List of The Sopranos episodes",
			"The Sopranos (TV series)",
			"The Sopranos",
		]);
	});

	it("tries film disambiguations before the bare title, with the year when known", () => {
		expect(candidatePages({ title: "Dune", year: 2021 })).toEqual([
			"Dune (2021 film)",
			"Dune (film)",
			"Dune (TV series)",
			"Dune",
		]);
		expect(candidatePages({ title: "Heat" })).toEqual(["Heat (film)", "Heat (TV series)", "Heat"]);
	});
});

describe("fetchPage", () => {
	it("asks the API for the page's wikitext and identifies the client", async () => {
		const { fetchFn, calls, mock } = fakeFetch({ "Breaking Bad season 1": "The first season aired in 2008." });
		const doc = await fetchPage("Breaking Bad season 1", { fetch: fetchFn, userAgent: "test-agent" });
		expect(doc?.title()).toBe("Breaking Bad season 1");
		expect(doc?.text()).toBe("The first season aired in 2008.");
		const url = calls[0];
		expect(url.hostname).toBe("en.wikipedia.org");
		expect(url.searchParams.get("redirects")).toBe("1");
		expect(url.searchParams.get("formatversion")).toBe("2");
		expect(mock.mock.calls[0][1]?.headers).toEqual({ "User-Agent": "test-agent" });
	});

	it("returns null for a missing page", async () => {
		const { fetchFn } = fakeFetch({});
		expect(await fetchPage("Nope", { fetch: fetchFn })).toBeNull();
	});

	it("throws on an API failure", async () => {
		const fetchFn = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
		await expect(fetchPage("Anything", { fetch: fetchFn })).rejects.toThrow('Wikipedia query for "Anything" failed: 503');
	});
});

describe("fetchFirstPage", () => {
	it("stops at the first candidate that exists", async () => {
		const { fetchFn, calls } = fakeFetch({ "Fleabag": "A comedy.", "Fleabag season 1": null });
		const doc = await fetchFirstPage(["Fleabag season 1", "List of Fleabag episodes", "Fleabag"], { fetch: fetchFn });
		expect(doc?.title()).toBe("Fleabag");
		expect(requestedTitles(calls)).toEqual(["Fleabag season 1", "List of Fleabag episodes", "Fleabag"]);
	});

	it("skips disambiguation pages", async () => {
		const { fetchFn } = fakeFetch({
			"Heat (film)": "'''Heat''' is a 1995 film.",
			"Heat": "'''Heat''' may refer to:\n{{disambiguation}}",
		});
		const doc = await fetchFirstPage(["Heat", "Heat (film)"], { fetch: fetchFn });
		expect(doc?.title()).toBe("Heat (film)");
	});

	it("returns null when nothing exists", async () => {
		const { fetchFn } = fakeFetch({});
		expect(await fetchFirstPage(["A", "B"], { fetch: fetchFn })).toBeNull();
	});
});

/* ---------- Reading pages ---------- */

const SEASON_PAGE = `{{Infobox television season
| season_name = Show X season 1
| first_aired = {{Start date|2020|1|1}}
}}
The first season of the American drama series ''[[Show X]]'' aired in 2020. It was released on DVD in 2021.

==Cast==
===Main cast===
* [[Alice Actor]] as Jane Doe, a detective.
* Bob Actor as Dr. John Roe
* Carol Actor as Jane Doe (young)
===Recurring cast===
* Dan Actor as The Chief: Jane's boss.

==Episodes==
{{Episode table |background=#000 |overall= |season= |title= |airdate= |episodes=
{{Episode list
| EpisodeNumber = 1
| EpisodeNumber2 = 1
| Title = [[Pilot (Show X)|Pilot]]
| OriginalAirDate = {{Start date|2020|1|1}}
| ShortSummary = Jane meets [[John Roe|John]] at the precinct.<ref>A source.</ref> They clash.
| LineColor = 000
}}
{{Episode list
| EpisodeNumber = 1.5
| EpisodeNumber2 = 1.5
| Title = Recap Special
| ShortSummary = A recap.
}}
{{Episode list
| EpisodeNumber = 2
| EpisodeNumber2 = 2
| Title = Second Steps
| ShortSummary = The case deepens.
}}
}}
`;

const MULTI_SEASON_PAGE = `{{Infobox television
| genre = {{ubl|Thriller|Science fiction}}
| first_aired = {{Start date|2022|2|18}}
}}
'''''Show Y''''' is an American thriller television series. It stars several people.

==Episodes==
===Season 1 (2022)===
{{Episode table |episodes=
{{Episode list
| EpisodeNumber = 1
| EpisodeNumber2 = 1
| Title = Good News
| ShortSummary = Season one starts.
}}
}}
===Season 2 (2025)===
{{Episode table |episodes=
{{Episode list
| EpisodeNumber = 2
| EpisodeNumber2 = 1
| Title = Hello
| ShortSummary = Season two starts.
}}
}}
`;

const SERIES_PAGE = `'''''Show Z''''' is a British comedy series.

==Episodes==
===Series 1 (2016)===
{{Episode table |episodes=
{{Episode list
| EpisodeNumber = 1
| RTitle = Episode 1
| ShortSummary = First of series one.
}}
{{Episode list
| EpisodeNumber = 2
| RTitle = Episode 2
| ShortSummary = Second of series one.
}}
}}
===Series 2 (2019)===
{{Episode table |episodes=
{{Episode list
| EpisodeNumber = 3
| RTitle = Episode 1
| ShortSummary = First of series two.
}}
}}
`;

const FILM_PAGE = `{{Infobox film
| name = Sandworm
| released = {{Film date|2021|10|22}}
}}
'''''Sandworm''''' is a 2021 American science fiction film directed by Someone.

==Plot==
A young noble travels to a desert planet. His family is betrayed.

==Cast==
* Lead Actor as Paul
* Other Actor as Jessica, his mother
`;

const parse = (wikitext: string, title: string) => wtf(wikitext, { title });

describe("episodeFromDocument", () => {
	it("picks the row by in-season number and skips fractional specials", () => {
		const doc = parse(SEASON_PAGE, "Show X season 1");
		expect(episodeFromDocument(doc, 1, 1)).toEqual({
			season: 1,
			episode: 1,
			name: "Pilot",
			overview: "Jane meets John at the precinct. They clash.",
		});
		expect(episodeFromDocument(doc, 1, 2)?.name).toBe("Second Steps");
		expect(episodeFromDocument(doc, 1, 3)).toBeUndefined();
	});

	it("scopes to the matching season heading on a multi-season page", () => {
		const doc = parse(MULTI_SEASON_PAGE, "Show Y");
		expect(episodeFromDocument(doc, 2, 1)).toEqual({ season: 2, episode: 1, name: "Hello", overview: "Season two starts." });
		expect(episodeFromDocument(doc, 1, 1)?.name).toBe("Good News");
		expect(episodeFromDocument(doc, 3, 1)).toBeUndefined();
	});

	it("falls back to the N-th row under a series heading when rows only carry overall numbers", () => {
		const doc = parse(SERIES_PAGE, "Show Z");
		expect(episodeFromDocument(doc, 2, 1)).toEqual({ season: 2, episode: 1, name: "Episode 1", overview: "First of series two." });
		expect(episodeFromDocument(doc, 1, 2)?.overview).toBe("Second of series one.");
	});
});

describe("charactersFromDocument", () => {
	it("keeps the character from 'Actor as Character' lines, deduplicated, without genders", () => {
		expect(charactersFromDocument(parse(SEASON_PAGE, "Show X season 1"))).toEqual([
			{ name: "Jane Doe" },
			{ name: "Dr. John Roe" },
			{ name: "The Chief" },
		]);
	});
});

describe("showTitleFromPage", () => {
	it("strips season, film, and series suffixes and the list-of wrapper", () => {
		expect(showTitleFromPage("The Sopranos season 1")).toBe("The Sopranos");
		expect(showTitleFromPage("List of Fleabag episodes")).toBe("Fleabag");
		expect(showTitleFromPage("Dune (2021 film)")).toBe("Dune");
		expect(showTitleFromPage("Heat (film)")).toBe("Heat");
		expect(showTitleFromPage("Severance (TV series)")).toBe("Severance");
		expect(showTitleFromPage("Chernobyl (miniseries)")).toBe("Chernobyl");
	});
});

describe("titleInfoFromDocument", () => {
	it("maps a season page to a show with its episode and cast", () => {
		const info = titleInfoFromDocument(parse(SEASON_PAGE, "Show X season 1"), { title: "Show X", season: 1, episode: 2 });
		expect(info).toEqual({
			title: "Show X",
			mediaType: "tv",
			year: 2020,
			genres: [],
			overview: "The first season of the American drama series Show X aired in 2020. It was released on DVD in 2021.",
			characters: [{ name: "Jane Doe" }, { name: "Dr. John Roe" }, { name: "The Chief" }],
			episode: { season: 1, episode: 2, name: "Second Steps", overview: "The case deepens." },
		});
	});

	it("reads genres and the first-aired year from a series infobox", () => {
		const info = titleInfoFromDocument(parse(MULTI_SEASON_PAGE, "Show Y"), { title: "Show Y", season: 1, episode: 1 });
		expect(info.genres).toEqual(["Thriller", "Science fiction"]);
		expect(info.year).toBe(2022);
		expect(info.episode?.name).toBe("Good News");
	});

	it("maps a film page to a movie whose overview is the plot", () => {
		const info = titleInfoFromDocument(parse(FILM_PAGE, "Sandworm (2021 film)"), { title: "Sandworm", year: 2021 });
		expect(info).toEqual({
			title: "Sandworm",
			mediaType: "movie",
			year: 2021,
			genres: [],
			overview: "A young noble travels to a desert planet. His family is betrayed.",
			characters: [{ name: "Paul" }, { name: "Jessica" }],
		});
	});

	it("leaves the episode out when the page has no matching row", () => {
		const info = titleInfoFromDocument(parse(SERIES_PAGE, "Show Z"), { title: "Show Z", season: 5, episode: 1 });
		expect(info.mediaType).toBe("tv");
		expect(info.episode).toBeUndefined();
	});
});

describe("lookupTitle", () => {
	it("walks the candidates and maps the first page found", async () => {
		const { fetchFn, calls } = fakeFetch({ "Show X season 1": SEASON_PAGE });
		const info = await lookupTitle({ title: "Show X", season: 1, episode: 1 }, { fetch: fetchFn });
		expect(requestedTitles(calls)).toEqual(["Show X season 1"]);
		expect(info?.title).toBe("Show X");
		expect(info?.episode?.name).toBe("Pilot");
	});

	it("returns null when no candidate page exists", async () => {
		const { fetchFn } = fakeFetch({});
		expect(await lookupTitle({ title: "Nothing Here" }, { fetch: fetchFn })).toBeNull();
	});

	it("ends on an aborted signal instead of trying the remaining pages", async () => {
		const fetchFn = vi.fn(hangingFetch);
		const controller = new AbortController();
		const lookup = lookupTitle({ title: "Breaking Bad", season: 1 }, { fetch: fetchFn, signal: controller.signal });
		controller.abort();
		await expect(lookup).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});
