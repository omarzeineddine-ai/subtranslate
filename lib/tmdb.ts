import type { CharacterInfo, Gender, TitleInfo, TitleQuery } from "@/lib/title-context";

/**
 * Minimal TMDB (themoviedb.org) client: search for a title, then pull the
 * details and cast needed to build a translation context. `fetch` is
 * injectable so the mapping can be tested against canned responses.
 */

export interface TmdbOptions {
	apiKey: string;
	fetch?: typeof fetch;
	/** Ends every request of the lookup: the caller's time limit, or the
	 * user giving up on it. An aborted request throws. */
	signal?: AbortSignal;
}

const BASE_URL = "https://api.themoviedb.org/3";

/** TMDB gender codes: 0 unknown, 1 female, 2 male, 3 non-binary. */
const GENDERS: Record<number, Gender> = { 1: "woman", 2: "man", 3: "non-binary" };

type SearchResult =
	| { media_type: "movie"; id: number; title: string; release_date?: string; popularity?: number }
	| { media_type: "tv"; id: number; name: string; first_air_date?: string; popularity?: number }
	| { media_type: "person" };

interface CastMember {
	name: string;
	gender?: number;
	character?: string;
	/** aggregate_credits shape: one entry per role played across the series. */
	roles?: { character: string; episode_count?: number }[];
}

interface MovieDetails {
	title: string;
	release_date?: string;
	overview?: string;
	genres?: { name: string }[];
	credits?: { cast?: CastMember[] };
}

interface TvDetails {
	name: string;
	first_air_date?: string;
	overview?: string;
	genres?: { name: string }[];
	aggregate_credits?: { cast?: CastMember[] };
}

interface EpisodeDetails {
	name?: string;
	overview?: string;
	guest_stars?: CastMember[];
}

/**
 * TMDB's gender is the performer's, which matches the character in live
 * action but not in animation, where boys are routinely voiced by women
 * (Naruto, Bart Simpson, Armin in Attack on Titan). A wrong gender is worse
 * than none, so animated titles keep names only.
 */
export function withoutGenderIfAnimated(genres: string[], characters: CharacterInfo[]): CharacterInfo[] {
	if (!genres.some((g) => /animation/i.test(g))) return characters;
	return characters.map(({ name }) => ({ name }));
}

function yearOf(date: string | undefined): number | undefined {
	const year = Number(date?.slice(0, 4));
	return Number.isFinite(year) && year > 0 ? year : undefined;
}

/** "Walter White (voice)" -> "Walter White"; "Self" credits are not characters. */
function cleanCharacterName(raw: string | undefined): string | undefined {
	const name = raw?.replace(/\s*\([^)]*\)/g, "").split(" / ")[0]?.trim();
	if (!name || /^(self|himself|herself|themselves|narrator)$/i.test(name)) return undefined;
	return name;
}

export function toCharacters(cast: CastMember[] | undefined): CharacterInfo[] {
	const seen = new Set<string>();
	const characters: CharacterInfo[] = [];
	for (const member of cast ?? []) {
		const role = member.roles?.length
			? [...member.roles].sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0))[0].character
			: member.character;
		const name = cleanCharacterName(role);
		if (!name || seen.has(name.toLowerCase())) continue;
		seen.add(name.toLowerCase());
		const gender = GENDERS[member.gender ?? 0];
		characters.push(gender ? { name, gender } : { name });
	}
	return characters;
}

/**
 * Pick the best search hit. An episode code means it must be a show; a year
 * prefers a matching release (within a year, dates are fuzzy); otherwise the
 * first result, which TMDB already ranks by relevance and popularity.
 */
export function pickResult(results: SearchResult[], query: TitleQuery): Exclude<SearchResult, { media_type: "person" }> | null {
	const wantsTv = query.season !== undefined || query.episode !== undefined;
	const candidates = results.filter(
		(r): r is Exclude<SearchResult, { media_type: "person" }> =>
			r.media_type === "movie" || r.media_type === "tv",
	);
	const typed = wantsTv ? candidates.filter((r) => r.media_type === "tv") : candidates;
	if (query.year !== undefined) {
		const year = query.year;
		const dated = typed.find((r) => {
			const released = yearOf(r.media_type === "movie" ? r.release_date : r.first_air_date);
			return released !== undefined && Math.abs(released - year) <= 1;
		});
		if (dated) return dated;
	}
	return typed[0] ?? null;
}

export async function lookupTitle(query: TitleQuery, options: TmdbOptions): Promise<TitleInfo | null> {
	const doFetch = options.fetch ?? globalThis.fetch;
	// v4 read-access tokens are JWTs and go in the header; v3 keys are a query param.
	const bearer = options.apiKey.includes(".");

	const get = async <T>(path: string, params: Record<string, string> = {}): Promise<T | null> => {
		const url = new URL(BASE_URL + path);
		for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
		if (!bearer) url.searchParams.set("api_key", options.apiKey);
		const response = await doFetch(url.toString(), {
			headers: bearer ? { Authorization: `Bearer ${options.apiKey}` } : {},
			signal: options.signal,
		});
		if (response.status === 404) return null;
		if (!response.ok) throw new Error(`TMDB ${path} failed: ${response.status}`);
		return (await response.json()) as T;
	};

	const search = await get<{ results?: SearchResult[] }>("/search/multi", {
		query: query.title,
		include_adult: "false",
	});
	const hit = pickResult(search?.results ?? [], query);
	if (!hit) return null;

	if (hit.media_type === "movie") {
		const movie = await get<MovieDetails>(`/movie/${hit.id}`, { append_to_response: "credits" });
		if (!movie) return null;
		const genres = movie.genres?.map((g) => g.name) ?? [];
		return {
			title: movie.title,
			mediaType: "movie",
			year: yearOf(movie.release_date),
			genres,
			overview: movie.overview ?? "",
			characters: withoutGenderIfAnimated(genres, toCharacters(movie.credits?.cast)),
		};
	}

	const show = await get<TvDetails>(`/tv/${hit.id}`, { append_to_response: "aggregate_credits" });
	if (!show) return null;
	const genres = show.genres?.map((g) => g.name) ?? [];
	const info: TitleInfo = {
		title: show.name,
		mediaType: "tv",
		year: yearOf(show.first_air_date),
		genres,
		overview: show.overview ?? "",
		characters: withoutGenderIfAnimated(genres, toCharacters(show.aggregate_credits?.cast)),
	};

	if (query.season !== undefined && query.episode !== undefined) {
		// A missing episode is not fatal: series-level context is still useful.
		const ep = await get<EpisodeDetails>(`/tv/${hit.id}/season/${query.season}/episode/${query.episode}`);
		info.episode = { season: query.season, episode: query.episode, name: ep?.name, overview: ep?.overview };
		if (ep?.guest_stars?.length) {
			const known = new Set(info.characters.map((c) => c.name.toLowerCase()));
			const guests = toCharacters(ep.guest_stars).filter((c) => !known.has(c.name.toLowerCase()));
			info.characters.push(...withoutGenderIfAnimated(genres, guests));
		}
	}
	return info;
}
