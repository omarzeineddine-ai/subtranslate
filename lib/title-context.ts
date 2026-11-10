import { MAX_CONTEXT_LENGTH } from "@/lib/translation-request";

/**
 * Normalized facts about a movie or TV show, independent of which metadata
 * provider produced them. Formatted into the free-text "context" field that
 * the translation prompt already accepts.
 */

/** What the form asks a metadata provider to look up, parsed from the filename. */
export interface TitleQuery {
	title: string;
	year?: number;
	season?: number;
	episode?: number;
}

export type Gender = "man" | "woman" | "non-binary";

export interface CharacterInfo {
	name: string;
	gender?: Gender;
}

export interface EpisodeInfo {
	season: number;
	episode: number;
	name?: string;
	overview?: string;
}

export interface TitleInfo {
	title: string;
	mediaType: "movie" | "tv";
	year?: number;
	genres: string[];
	overview: string;
	characters: CharacterInfo[];
	episode?: EpisodeInfo;
}

/** Characters beyond this add tokens to every batch without helping. */
export const MAX_CHARACTERS = 15;

/** Plot summaries past this length are mostly filler for translation. */
export const MAX_OVERVIEW_LENGTH = 500;

/** Cut at the last sentence end within the limit, else at a word boundary. */
export function truncateProse(text: string, max: number): string {
	const trimmed = text.replace(/\s+/g, " ").trim();
	if (trimmed.length <= max) return trimmed;
	const head = trimmed.slice(0, max);
	const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
	if (sentenceEnd > max / 2) return head.slice(0, sentenceEnd + 1);
	const wordEnd = head.lastIndexOf(" ");
	return (wordEnd > 0 ? head.slice(0, wordEnd) : head) + "…";
}

function describeCharacter({ name, gender }: CharacterInfo): string {
	return gender ? `${name} (${gender})` : name;
}

/**
 * Render title metadata as the context block for the translator. The model
 * mostly needs names with genders (for agreement), the setting, and the
 * tone, so those lead and the synopsis is trimmed. Output never exceeds
 * `maxLength`, matching the request validator's cap.
 */
export function formatTitleContext(info: TitleInfo, maxLength = MAX_CONTEXT_LENGTH): string {
	const kind = info.mediaType === "tv" ? "TV series" : "Film";
	const header = `"${info.title}" (${kind}${info.year ? `, ${info.year}` : ""}).`;
	const lines: string[] = [
		info.genres.length ? `${header} Genres: ${info.genres.join(", ")}.` : header,
	];

	if (info.episode) {
		const { season, episode, name, overview } = info.episode;
		const label = `Episode S${season}E${episode}${name ? ` "${name}"` : ""}`;
		lines.push(overview ? `${label}: ${truncateProse(overview, MAX_OVERVIEW_LENGTH)}` : `${label}.`);
	}

	if (info.overview) {
		lines.push(`Synopsis: ${truncateProse(info.overview, MAX_OVERVIEW_LENGTH)}`);
	}

	const characters = info.characters.slice(0, MAX_CHARACTERS).map(describeCharacter);
	if (characters.length) lines.push(`Characters: ${characters.join(", ")}.`);

	const text = lines.join("\n");
	return text.length <= maxLength ? text : truncateProse(text, maxLength);
}

/**
 * Combine what two providers know about the same title. The primary wins
 * wherever it has something; the secondary fills gaps and, for characters,
 * supplies the gender the primary lacks. Episode overviews take the longer
 * text because summaries differ mainly in how much they say.
 */
export function mergeTitleInfo(primary: TitleInfo, secondary: TitleInfo | null): TitleInfo {
	if (!secondary) return primary;

	const characters: CharacterInfo[] = [];
	const byName = new Map<string, CharacterInfo>();
	for (const character of [...primary.characters, ...secondary.characters]) {
		const key = character.name.toLowerCase();
		const known = byName.get(key);
		if (!known) {
			const copy = { ...character };
			byName.set(key, copy);
			characters.push(copy);
		} else if (!known.gender && character.gender) {
			known.gender = character.gender;
		}
	}

	const merged: TitleInfo = {
		title: primary.title || secondary.title,
		mediaType: primary.mediaType,
		year: primary.year ?? secondary.year,
		genres: primary.genres.length ? primary.genres : secondary.genres,
		overview: primary.overview || secondary.overview,
		characters,
	};

	const a = primary.episode;
	const b = secondary.episode;
	if (a || b) {
		const overviews = [a?.overview, b?.overview].filter((o): o is string => !!o);
		const longest = overviews.sort((x, y) => y.length - x.length)[0];
		merged.episode = {
			season: (a ?? b)!.season,
			episode: (a ?? b)!.episode,
			name: a?.name ?? b?.name,
			overview: longest,
		};
	}
	return merged;
}
