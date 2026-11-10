import wtf from "wtf_wikipedia";
import { SITE_URL } from "@/lib/site";
import type { CharacterInfo, EpisodeInfo, TitleInfo, TitleQuery } from "@/lib/title-context";

/**
 * Minimal Wikipedia client: guess the page names that would hold a title's
 * episode table or plot, fetch the first that exists, and hand the wikitext
 * to `wtf_wikipedia` for parsing. The HTTP call is our own (the library's
 * fetcher cannot be injected) so tests run against canned responses.
 */

export type WikiDocument = ReturnType<typeof wtf>;

export interface WikipediaOptions {
	fetch?: typeof fetch;
	/** Wikimedia asks every API client to identify itself. */
	userAgent?: string;
	/** Ends every request of the lookup: the caller's time limit, or the
	 * user giving up on it. An aborted request throws, which ends the
	 * lookup rather than moving on to the next candidate page. */
	signal?: AbortSignal;
}

const API_URL = "https://en.wikipedia.org/w/api.php";
// Names the deployment making the requests, so Wikimedia can tell one
// operator's traffic from another's.
const DEFAULT_USER_AGENT = `subtranslate/1.0 (${SITE_URL})`;

/**
 * Page names to try, most specific first. Episode summaries live on a season
 * page when the show is big enough to have one, else on a "List of …
 * episodes" page, else inline on the main article. Films are usually
 * disambiguated with "(film)" or "(<year> film)"; the bare title is last
 * because it is the most likely to land on something unrelated.
 */
export function candidatePages(query: TitleQuery): string[] {
	const title = query.title.trim();
	const pages: string[] = [];
	if (query.season !== undefined) {
		pages.push(`${title} season ${query.season}`, `List of ${title} episodes`, `${title} (TV series)`);
	} else {
		if (query.year !== undefined) pages.push(`${title} (${query.year} film)`);
		pages.push(`${title} (film)`, `${title} (TV series)`);
	}
	pages.push(title);
	return pages;
}

interface QueryResponse {
	query?: {
		pages?: {
			title: string;
			missing?: boolean;
			invalid?: boolean;
			revisions?: { slots?: { main?: { content?: string } } }[];
		}[];
	};
}

/** Fetch one page's wikitext; null when it does not exist. Redirects are followed server-side. */
export async function fetchPage(title: string, options: WikipediaOptions = {}): Promise<WikiDocument | null> {
	const doFetch = options.fetch ?? globalThis.fetch;
	const url = new URL(API_URL);
	url.searchParams.set("action", "query");
	url.searchParams.set("prop", "revisions");
	url.searchParams.set("rvprop", "content");
	url.searchParams.set("rvslots", "main");
	url.searchParams.set("redirects", "1");
	url.searchParams.set("format", "json");
	url.searchParams.set("formatversion", "2");
	url.searchParams.set("titles", title);

	const response = await doFetch(url.toString(), {
		headers: { "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT },
		signal: options.signal,
	});
	if (!response.ok) throw new Error(`Wikipedia query for "${title}" failed: ${response.status}`);
	const body = (await response.json()) as QueryResponse;
	const page = body.query?.pages?.[0];
	const wikitext = page?.revisions?.[0]?.slots?.main?.content;
	if (!page || page.missing || page.invalid || !wikitext) return null;
	return wtf(wikitext, { title: page.title });
}

/** First candidate that exists and is an article rather than a disambiguation page. */
export async function fetchFirstPage(candidates: string[], options: WikipediaOptions = {}): Promise<WikiDocument | null> {
	for (const title of candidates) {
		const doc = await fetchPage(title, options);
		if (doc && !doc.isDisambiguation()) return doc;
	}
	return null;
}

/* ---------- Reading a page ---------- */

/** The library's section API is loosely typed; these are the shapes we touch. */
interface WikiSection {
	title(): string;
	templates(): unknown;
	lists(): unknown;
	sentences(): unknown;
	text(): string;
}

/** One `{{Episode list}}` row as `template.json()` returns it (keys lowercased). */
interface EpisodeRow {
	template?: string;
	episodenumber?: string | number;
	episodenumber2?: string | number;
	title?: string;
	rtitle?: string;
	shortsummary?: string;
}

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : value ? [value as T] : []);

const sectionsOf = (doc: WikiDocument): WikiSection[] => asArray<WikiSection>(doc.sections());

function episodeRows(section: WikiSection): EpisodeRow[] {
	return asArray<{ json(): EpisodeRow }>(section.templates())
		.map((t) => t.json())
		.filter((row) => /^episode list/i.test(row.template ?? ""));
}

function listItems(section: WikiSection): string[] {
	return asArray<{ lines(): unknown }>(section.lists()).flatMap((list) =>
		asArray<{ text(): string }>(list.lines()).map((line) => line.text()),
	);
}

const numberOf = (value: string | number | undefined): number | undefined => {
	const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
	return Number.isFinite(n) ? n : undefined;
};

/**
 * Find the episode's row. A page covering several seasons groups rows under
 * "Season N" / "Series N" headings, so those win when present; a season page
 * keeps everything under "Episodes". Rows normally carry the number within
 * the season; when a page only numbers episodes overall, the N-th whole-
 * numbered row is used. Fractional numbers are recap specials and are skipped.
 */
export function episodeFromDocument(doc: WikiDocument, season: number, episode: number): EpisodeInfo | undefined {
	const sections = sectionsOf(doc);
	const anySeasonHeading = /\b(season|series)\s+\d+\b/i;
	const seasonHeading = new RegExp(`\\b(season|series)\\s+${season}\\b`, "i");
	const scoped = sections.filter((s) => seasonHeading.test(s.title()));
	// Season headings exist but not this one: the page does not cover it.
	if (!scoped.length && sections.some((s) => anySeasonHeading.test(s.title()))) return undefined;
	const rows = (scoped.length ? scoped : sections)
		.flatMap(episodeRows)
		.filter((row) => Number.isInteger(numberOf(row.episodenumber2) ?? numberOf(row.episodenumber)));
	if (!rows.length) return undefined;

	const inSeason = rows.some((row) => row.episodenumber2 !== undefined);
	const row = inSeason ? rows.find((r) => numberOf(r.episodenumber2) === episode) : rows[episode - 1];
	if (!row) return undefined;

	const name = (row.title ?? row.rtitle)?.trim() || undefined;
	const overview = row.shortsummary?.trim() || undefined;
	return { season, episode, name, overview };
}

/**
 * Cast lists read "Actor as Character, description." Only the character is
 * useful; Wikipedia records no gender, so names come back on their own.
 */
export function charactersFromDocument(doc: WikiDocument): CharacterInfo[] {
	const seen = new Set<string>();
	const characters: CharacterInfo[] = [];
	for (const section of sectionsOf(doc)) {
		if (!/\b(cast|characters)\b/i.test(section.title())) continue;
		for (const item of listItems(section)) {
			const match = /^(.+?) as (.+?)(?:\s*[,:;(–—]|\.?\s*$)/.exec(item);
			const name = match?.[2]?.trim();
			if (!name || seen.has(name.toLowerCase())) continue;
			seen.add(name.toLowerCase());
			characters.push({ name });
		}
	}
	return characters;
}

const TITLE_SUFFIX = /\s+season\s+\d+$|\s+\((\d{4}\s+)?film\)$|\s+\((TV series|miniseries|TV programme)\)$/i;
const LIST_OF = /^List of (.+?) episodes$/i;

/** "The Sopranos season 1" and "List of Fleabag episodes" both name the show. */
export function showTitleFromPage(pageTitle: string): string {
	return (LIST_OF.exec(pageTitle)?.[1] ?? pageTitle.replace(TITLE_SUFFIX, "")).trim();
}

const yearIn = (text: string | undefined): number | undefined => {
	const match = /\b(1[89]\d{2}|20\d{2})\b/.exec(text ?? "");
	return match ? Number(match[1]) : undefined;
};

function infoboxText(doc: WikiDocument, key: string): string | undefined {
	const value = doc.infobox()?.get(key) as { text?: () => string } | undefined;
	return value?.text?.() || undefined;
}

function sectionSentences(section: WikiSection | undefined): string[] {
	return asArray<{ text(): string }>(section?.sentences()).map((s) => s.text());
}

/** Map a parsed page onto the provider-neutral shape the context formatter takes. */
export function titleInfoFromDocument(doc: WikiDocument, query: TitleQuery): TitleInfo {
	const sections = sectionsOf(doc);
	const infoboxType = doc.infobox()?.type() ?? "";
	const episode =
		query.season !== undefined && query.episode !== undefined
			? episodeFromDocument(doc, query.season, query.episode)
			: undefined;
	const mediaType: TitleInfo["mediaType"] =
		/film/i.test(infoboxType) ? "movie"
		: /television/i.test(infoboxType) || episode || query.season !== undefined ? "tv"
		: "movie";

	const plot = sections.find((s) => /^plot$/i.test(s.title()));
	const overview =
		mediaType === "movie" && plot
			? plot.text()
			: sectionSentences(sections[0]).slice(0, 2).join(" ");

	const info: TitleInfo = {
		title: showTitleFromPage(doc.title() ?? query.title),
		mediaType,
		year: yearIn(infoboxText(doc, "first_aired") ?? infoboxText(doc, "released")) ?? yearIn(sectionSentences(sections[0])[0]),
		genres: (infoboxText(doc, "genre") ?? "").split(/\n+/).map((g) => g.trim()).filter(Boolean),
		overview,
		characters: charactersFromDocument(doc),
	};
	if (episode) info.episode = episode;
	return info;
}

export async function lookupTitle(query: TitleQuery, options: WikipediaOptions = {}): Promise<TitleInfo | null> {
	const doc = await fetchFirstPage(candidatePages(query), options);
	return doc ? titleInfoFromDocument(doc, query) : null;
}
