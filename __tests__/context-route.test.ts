import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/context/route";

const SEASON_PAGE = `{{Infobox television season
| first_aired = {{Start date|2008|1|20}}
}}
The first season of ''Breaking Bad'' aired in 2008.
==Cast==
* Bryan Cranston as Walter White, a teacher.
==Episodes==
{{Episode table |episodes=
{{Episode list
| EpisodeNumber = 1
| EpisodeNumber2 = 1
| Title = Pilot
| ShortSummary = Walter White learns he has cancer and cooks meth with Jesse Pinkman in the desert.
}}
}}
`;

const TMDB_ROUTES: Record<string, unknown> = {
	"/3/search/multi": { results: [{ media_type: "tv", id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" }] },
	"/3/tv/1396": {
		name: "Breaking Bad",
		first_air_date: "2008-01-20",
		overview: "A chemistry teacher turns to crime.",
		genres: [{ name: "Drama" }],
		aggregate_credits: { cast: [{ name: "Bryan Cranston", gender: 2, roles: [{ character: "Walter White" }] }] },
	},
	"/3/tv/1396/season/1/episode/1": { name: "Pilot", overview: "Short." },
};

/** Route both upstreams through one global fetch stub: Wikipedia by page title, TMDB by path. */
function stubUpstreams(options: {
	wikipedia?: Record<string, string>;
	tmdb?: Record<string, unknown> | "down";
	wikipediaDown?: boolean;
	/** Wikipedia accepts the request and never answers; only an abort ends it. */
	wikipediaHangs?: boolean;
}) {
	const calls: URL[] = [];
	const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
		calls.push(url);
		if (url.hostname === "en.wikipedia.org" && options.wikipediaHangs) {
			return new Promise<Response>((_, reject) => {
				const signal = init?.signal;
				if (signal?.aborted) return reject(signal.reason);
				signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
			});
		}
		if (url.hostname === "en.wikipedia.org") {
			if (options.wikipediaDown) return new Response("down", { status: 503 });
			const title = url.searchParams.get("titles") ?? "";
			const wikitext = options.wikipedia?.[title];
			const page = wikitext ? { title, revisions: [{ slots: { main: { content: wikitext } } }] } : { title, missing: true };
			return new Response(JSON.stringify({ query: { pages: [page] } }), { status: 200 });
		}
		if (options.tmdb === "down") return new Response("down", { status: 500 });
		const body = options.tmdb?.[url.pathname];
		return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response("nope", { status: 404 });
	});
	vi.stubGlobal("fetch", fetchFn);
	return { calls, hosts: () => [...new Set(calls.map((u) => u.hostname))] };
}

const post = (body: unknown) =>
	POST(new Request("http://localhost/api/context", { method: "POST", body: JSON.stringify(body) }));

const QUERY = { title: "Breaking Bad", season: 1, episode: 1 };

describe("POST /api/context", () => {
	beforeEach(() => {
		delete process.env.TMDB_API_KEY;
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.TMDB_API_KEY;
	});

	it("answers from Wikipedia alone without a TMDB key and never calls TMDB", async () => {
		const { hosts } = stubUpstreams({ wikipedia: { "Breaking Bad season 1": SEASON_PAGE } });
		const response = await post(QUERY);
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.sources).toEqual(["wikipedia"]);
		expect(body.match).toEqual({ title: "Breaking Bad", mediaType: "tv", year: 2008 });
		expect(body.context).toContain('Episode S1E1 "Pilot": Walter White learns he has cancer');
		expect(body.context).toContain("Characters: Walter White.");
		expect(hosts()).toEqual(["en.wikipedia.org"]);
	});

	it("merges TMDB genders and genres into the Wikipedia result when a key is set", async () => {
		process.env.TMDB_API_KEY = "key";
		const { hosts } = stubUpstreams({ wikipedia: { "Breaking Bad season 1": SEASON_PAGE }, tmdb: TMDB_ROUTES });
		const body = await (await post(QUERY)).json();
		expect(body.sources).toEqual(["wikipedia", "tmdb"]);
		expect(body.context).toContain("Genres: Drama.");
		expect(body.context).toContain("Characters: Walter White (man).");
		expect(body.context).toContain("Walter White learns he has cancer");
		expect(hosts().sort()).toEqual(["api.themoviedb.org", "en.wikipedia.org"]);
	});

	it("falls back to TMDB alone when Wikipedia has no page", async () => {
		process.env.TMDB_API_KEY = "key";
		stubUpstreams({ tmdb: TMDB_ROUTES });
		const body = await (await post(QUERY)).json();
		expect(body.sources).toEqual(["tmdb"]);
		expect(body.context).toContain("Synopsis: A chemistry teacher turns to crime.");
	});

	it("keeps going when one provider throws", async () => {
		process.env.TMDB_API_KEY = "key";
		stubUpstreams({ wikipedia: { "Breaking Bad season 1": SEASON_PAGE }, tmdb: "down" });
		const response = await post(QUERY);
		expect(response.status).toBe(200);
		expect((await response.json()).sources).toEqual(["wikipedia"]);
	});

	it("returns 404 when nothing matches and 502 when every provider fails", async () => {
		stubUpstreams({});
		expect((await post(QUERY)).status).toBe(404);
		stubUpstreams({ wikipediaDown: true });
		expect((await post(QUERY)).status).toBe(502);
	});

	it("gives up on a provider that hangs and answers from the other one", async () => {
		vi.useFakeTimers();
		try {
			process.env.TMDB_API_KEY = "key";
			stubUpstreams({ wikipediaHangs: true, tmdb: TMDB_ROUTES });
			const pending = post(QUERY);
			await vi.advanceTimersByTimeAsync(8_000);
			const response = await pending;
			expect(response.status).toBe(200);
			expect((await response.json()).sources).toEqual(["tmdb"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("reports a failed lookup, not a hang, when the only provider never answers", async () => {
		vi.useFakeTimers();
		try {
			stubUpstreams({ wikipediaHangs: true });
			const pending = post(QUERY);
			await vi.advanceTimersByTimeAsync(8_000);
			expect((await pending).status).toBe(502);
		} finally {
			vi.useRealTimers();
		}
	});

	it("stops asking the providers when the client gives up on the lookup", async () => {
		stubUpstreams({ wikipediaHangs: true });
		const client = new AbortController();
		const pending = POST(
			new Request("http://localhost/api/context", { method: "POST", body: JSON.stringify(QUERY), signal: client.signal }),
		);
		client.abort();
		expect((await pending).status).toBe(502);
	});

	it("rejects malformed and invalid bodies", async () => {
		stubUpstreams({});
		const malformed = await POST(new Request("http://localhost/api/context", { method: "POST", body: "{" }));
		expect(malformed.status).toBe(400);
		expect((await post({ title: "" })).status).toBe(400);
	});
});
