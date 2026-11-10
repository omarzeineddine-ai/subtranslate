import { LANGUAGE_CODES } from "@/lib/languages";
import { withoutSubtitleExtension } from "@/lib/subtitle-file";

/**
 * Download name for a translated file. Media players (Plex, Jellyfin, VLC,
 * Kodi) read a subtitle's language from the tag before the extension, so
 * "movie.srt" translated to French becomes "movie.fr.srt" and sits beside the
 * video as a French track. A source that already carries a known tag
 * ("movie.en.srt") has it replaced rather than stacked ("movie.en.fr.srt").
 */

const KNOWN_TAGS = new Set(Object.values(LANGUAGE_CODES).map((code) => code.toLowerCase()));

export function translatedFilename(filename: string, language: string): string {
	let base = withoutSubtitleExtension(filename);
	const dot = base.lastIndexOf(".");
	if (dot > 0 && KNOWN_TAGS.has(base.slice(dot + 1).toLowerCase())) base = base.slice(0, dot);
	const code = LANGUAGE_CODES[language];
	return code ? `${base}.${code}.srt` : `${base}.srt`;
}
