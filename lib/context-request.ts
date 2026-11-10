import type { TitleQuery } from "@/lib/title-context";

/**
 * The title-lookup request the form sends to `/api/context`, and its
 * validator. Numbers are bounded to what a real season, episode, or
 * release year could be so a typo does not turn into an upstream 4xx.
 */

export const MAX_TITLE_LENGTH = 200;

export type ContextRequestValidation =
	| { ok: true; query: TitleQuery }
	| { ok: false; error: string };

function optionalInt(value: unknown, min: number, max: number): number | undefined | false {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return false;
	return value;
}

export function validateContextRequest(body: unknown): ContextRequestValidation {
	if (typeof body !== "object" || body === null) {
		return { ok: false, error: "Invalid request body" };
	}
	const { title, year, season, episode } = body as Record<string, unknown>;

	const trimmed = typeof title === "string" ? title.trim() : "";
	if (!trimmed || trimmed.length > MAX_TITLE_LENGTH) {
		return { ok: false, error: "Title missing or too long" };
	}

	const parsedYear = optionalInt(year, 1888, 2100);
	const parsedSeason = optionalInt(season, 0, 200);
	const parsedEpisode = optionalInt(episode, 0, 10_000);
	if (parsedYear === false || parsedSeason === false || parsedEpisode === false) {
		return { ok: false, error: "Year, season, and episode must be whole numbers in range" };
	}

	const query: TitleQuery = { title: trimmed };
	if (parsedYear !== undefined) query.year = parsedYear;
	if (parsedSeason !== undefined) query.season = parsedSeason;
	if (parsedEpisode !== undefined) query.episode = parsedEpisode;
	return { ok: true, query };
}
