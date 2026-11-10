import { describe, it, expect, vi } from "vitest";
import { lookupTitle, pickResult, toCharacters, withoutGenderIfAnimated } from "@/lib/tmdb";

type Route = (url: URL) => unknown | null;

/** Build a fetch stub that serves canned JSON per path; null means 404. */
function fakeFetch(routes: Record<string, Route>) {
	const calls: URL[] = [];
	const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
		calls.push(url);
		const path = url.pathname.replace(/^\/3/, "");
		const route = routes[path];
		if (!route) return new Response("not found", { status: 404 });
		const body = route(url);
		if (body === null) return new Response("not found", { status: 404 });
		void init;
		return new Response(JSON.stringify(body), { status: 200 });
	});
	return { fetchFn: fetchFn as unknown as typeof fetch, calls, mock: fetchFn };
}

const MOVIE_ROUTES: Record<string, Route> = {
	"/search/multi": () => ({
		results: [
			{ media_type: "person", id: 9, name: "Keanu Reeves" },
			{ media_type: "movie", id: 603, title: "The Matrix", release_date: "1999-03-30" },
			{ media_type: "movie", id: 604, title: "The Matrix Reloaded", release_date: "2003-05-15" },
		],
	}),
	"/movie/603": () => ({
		title: "The Matrix",
		release_date: "1999-03-30",
		overview: "A hacker learns the truth.",
		genres: [{ name: "Action" }, { name: "Science Fiction" }],
		credits: {
			cast: [
				{ name: "Keanu Reeves", gender: 2, character: "Neo" },
				{ name: "Carrie-Anne Moss", gender: 1, character: "Trinity" },
				{ name: "Someone", gender: 0, character: "Agent (voice)" },
			],
		},
	}),
};

const TV_ROUTES: Record<string, Route> = {
	"/search/multi": () => ({
		results: [
			{ media_type: "movie", id: 1, title: "Breaking Bad: The Movie", release_date: "2019-01-01" },
			{ media_type: "tv", id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" },
		],
	}),
	"/tv/1396": () => ({
		name: "Breaking Bad",
		first_air_date: "2008-01-20",
		overview: "A chemistry teacher turns to crime.",
		genres: [{ name: "Drama" }],
		aggregate_credits: {
			cast: [
				{
					name: "Bryan Cranston",
					gender: 2,
					roles: [
						{ character: "Walter White", episode_count: 62 },
						{ character: "Heisenberg", episode_count: 3 },
					],
				},
				{ name: "Anna Gunn", gender: 1, roles: [{ character: "Skyler White", episode_count: 62 }] },
			],
		},
	}),
	"/tv/1396/season/1/episode/1": () => ({
		name: "Pilot",
		overview: "Walter starts cooking.",
		guest_stars: [
			{ name: "Guest", gender: 2, character: "Krazy-8" },
			{ name: "Anna Gunn", gender: 1, character: "Skyler White" },
		],
	}),
};


/** A fetch that never answers on its own: like the real one, it rejects
 * only once the request's signal aborts. Stands in for a hung upstream. */
const hangingFetch = (async (_input: string | URL | Request, init?: RequestInit) =>
	new Promise<Response>((_, reject) => {
		const signal = init?.signal;
		if (signal?.aborted) return reject(signal.reason);
		signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
	})) as typeof fetch;

describe("lookupTitle", () => {
	it("maps a movie with cast and genders, skipping people and parentheticals", async () => {
		const { fetchFn } = fakeFetch(MOVIE_ROUTES);
		const info = await lookupTitle({ title: "The Matrix" }, { apiKey: "k", fetch: fetchFn });
		expect(info).toEqual({
			title: "The Matrix",
			mediaType: "movie",
			year: 1999,
			genres: ["Action", "Science Fiction"],
			overview: "A hacker learns the truth.",
			characters: [
				{ name: "Neo", gender: "man" },
				{ name: "Trinity", gender: "woman" },
				{ name: "Agent" },
			],
		});
	});

	it("maps a show with its episode and merges guest stars without duplicates", async () => {
		const { fetchFn } = fakeFetch(TV_ROUTES);
		const info = await lookupTitle(
			{ title: "Breaking Bad", season: 1, episode: 1 },
			{ apiKey: "k", fetch: fetchFn },
		);
		expect(info?.mediaType).toBe("tv");
		expect(info?.episode).toEqual({
			season: 1,
			episode: 1,
			name: "Pilot",
			overview: "Walter starts cooking.",
		});
		expect(info?.characters).toEqual([
			{ name: "Walter White", gender: "man" },
			{ name: "Skyler White", gender: "woman" },
			{ name: "Krazy-8", gender: "man" },
		]);
	});

	it("keeps series context when the episode is not found", async () => {
		const { fetchFn } = fakeFetch({ ...TV_ROUTES, "/tv/1396/season/1/episode/1": () => null });
		const info = await lookupTitle(
			{ title: "Breaking Bad", season: 1, episode: 1 },
			{ apiKey: "k", fetch: fetchFn },
		);
		expect(info?.title).toBe("Breaking Bad");
		expect(info?.episode).toEqual({ season: 1, episode: 1, name: undefined, overview: undefined });
	});

	it("returns null when nothing matches", async () => {
		const { fetchFn } = fakeFetch({ "/search/multi": () => ({ results: [] }) });
		expect(await lookupTitle({ title: "zzz" }, { apiKey: "k", fetch: fetchFn })).toBeNull();
	});

	it("throws on a non-404 API failure", async () => {
		const fetchFn = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
		await expect(lookupTitle({ title: "x" }, { apiKey: "k", fetch: fetchFn })).rejects.toThrow(
			"TMDB /search/multi failed: 401",
		);
	});

	it("sends a v3 key as a query param and a v4 token as a bearer header", async () => {
		const v3 = fakeFetch(MOVIE_ROUTES);
		await lookupTitle({ title: "The Matrix" }, { apiKey: "abc123", fetch: v3.fetchFn });
		expect(v3.calls[0].searchParams.get("api_key")).toBe("abc123");
		expect(v3.calls[0].searchParams.get("query")).toBe("The Matrix");

		const v4 = fakeFetch(MOVIE_ROUTES);
		await lookupTitle({ title: "The Matrix" }, { apiKey: "eyJ.header.sig", fetch: v4.fetchFn });
		expect(v4.calls[0].searchParams.get("api_key")).toBeNull();
		const init = v4.mock.mock.calls[0][1] as RequestInit;
		expect(init.headers).toEqual({ Authorization: "Bearer eyJ.header.sig" });
	});
});

describe("lookupTitle with a signal", () => {
	it("ends on an aborted signal instead of waiting on TMDB", async () => {
		const controller = new AbortController();
		const lookup = lookupTitle({ title: "The Matrix" }, { apiKey: "k", fetch: hangingFetch, signal: controller.signal });
		controller.abort();
		await expect(lookup).rejects.toMatchObject({ name: "AbortError" });
	});
});

describe("animated titles", () => {
	it("keeps character names but drops voice-actor gender", async () => {
		const { fetchFn } = fakeFetch({
			...TV_ROUTES,
			"/tv/1396": () => ({
				name: "Naruto",
				first_air_date: "2002-10-03",
				overview: "A ninja.",
				genres: [{ name: "Animation" }, { name: "Action & Adventure" }],
				aggregate_credits: {
					cast: [{ name: "Junko Takeuchi", gender: 1, roles: [{ character: "Naruto Uzumaki", episode_count: 220 }] }],
				},
			}),
			"/tv/1396/season/1/episode/1": () => ({
				name: "Enter: Naruto Uzumaki!",
				guest_stars: [{ name: "Guest", gender: 1, character: "Iruka Umino" }],
			}),
		});
		const info = await lookupTitle({ title: "Naruto", season: 1, episode: 1 }, { apiKey: "k", fetch: fetchFn });
		expect(info?.characters).toEqual([{ name: "Naruto Uzumaki" }, { name: "Iruka Umino" }]);
	});

	it("leaves live-action casts untouched", () => {
		const cast = [{ name: "Neo", gender: "man" as const }];
		expect(withoutGenderIfAnimated(["Action"], cast)).toEqual(cast);
		expect(withoutGenderIfAnimated(["Animation"], cast)).toEqual([{ name: "Neo" }]);
	});
});

describe("pickResult", () => {
	const results = [
		{ media_type: "person" as const },
		{ media_type: "movie" as const, id: 1, title: "Dune", release_date: "1984-12-14" },
		{ media_type: "movie" as const, id: 2, title: "Dune", release_date: "2021-10-22" },
		{ media_type: "tv" as const, id: 3, name: "Dune", first_air_date: "2000-12-03" },
	];

	it("takes the first movie or show when there is nothing to disambiguate", () => {
		expect(pickResult(results, { title: "Dune" })?.id).toBe(1);
	});

	it("prefers a release within a year of the requested year", () => {
		expect(pickResult(results, { title: "Dune", year: 2021 })?.id).toBe(2);
		expect(pickResult(results, { title: "Dune", year: 2022 })?.id).toBe(2);
	});

	it("falls back to the first result when no year matches", () => {
		expect(pickResult(results, { title: "Dune", year: 1950 })?.id).toBe(1);
	});

	it("requires a show when an episode code was given", () => {
		expect(pickResult(results, { title: "Dune", season: 1, episode: 2 })?.id).toBe(3);
		expect(pickResult(results.slice(0, 3), { title: "Dune", season: 1, episode: 2 })).toBeNull();
	});
});

describe("toCharacters", () => {
	it("drops self credits and empty roles, dedupes by name", () => {
		expect(
			toCharacters([
				{ name: "A", character: "Self" },
				{ name: "B", character: "" },
				{ name: "C", gender: 2, character: "Bob / Bob's twin" },
				{ name: "D", gender: 1, character: "bob" },
			]),
		).toEqual([{ name: "Bob", gender: "man" }]);
	});
});
