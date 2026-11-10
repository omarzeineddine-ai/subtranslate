/**
 * Guess what a subtitle file is about from its filename.
 *
 * Subtitle and release names follow a handful of loose conventions:
 *   "Breaking Bad - 1x01 - Pilot.DVDRip.ORPHEUS.en.srt"
 *   "Breaking.Bad.S01E01.720p.BluRay.x264-DEMAND.srt"
 *   "The.Matrix.1999.1080p.BluRay.srt"
 *   "The Matrix (1999).srt"
 *
 * The title is whatever comes before the first strong marker: an episode
 * code, a year, or a release tag (resolution, source, codec). Everything
 * after the marker is release noise, never title. This is a heuristic — it
 * only prefills a field the user can edit — so it prefers a clean partial
 * title over a "complete" one full of junk.
 */

import { withoutSubtitleExtension } from "@/lib/subtitle-file";

export interface ParsedTitle {
	title: string;
	year?: number;
	season?: number;
	episode?: number;
}

const EPISODE_CODE = /\bS(\d{1,2})[ .]?E(\d{1,3})\b/i;
const EPISODE_CODE_ALT = /\b(\d{1,2})x(\d{2,3})\b/i;
const YEAR = /(?:^|[\s(\[])((?:19|20)\d{2})(?=$|[\s)\]])/g;
const RELEASE_TAG =
	/\b(480p|576p|720p|1080p|1080i|2160p|4k|uhd|hdr|bluray|blu-ray|bdrip|brrip|dvdrip|dvdscr|webrip|web-dl|webdl|hdtv|hdrip|hdcam|camrip|telesync|x264|x265|h264|h265|hevc|xvid|divx|aac|ac3|dts|atmos|proper|repack|remastered|unrated)\b/i;

/** Trailing two/three-letter language code, e.g. "movie.en.srt", "movie.eng.srt". */
const LANGUAGE_SUFFIX = /\.[a-z]{2,3}$/i;

function cleanup(raw: string): string {
	return raw
		.replace(/\s+-\s*$/, "") // dangling " - " separator left before a marker
		.replace(/\s+-\s+/g, " ") // " - " between segments becomes a plain space
		.replace(/\s+/g, " ")
		.trim();
}

export function parseTitleFromFilename(filename: string): ParsedTitle | null {
	let name = withoutSubtitleExtension(filename).replace(LANGUAGE_SUFFIX, "");
	// Release names use dots and underscores in place of spaces.
	name = name.replace(/[._]/g, " ");

	const result: ParsedTitle = { title: "" };
	let cut = name.length;

	const episode = EPISODE_CODE.exec(name) ?? EPISODE_CODE_ALT.exec(name);
	if (episode) {
		result.season = Number(episode[1]);
		result.episode = Number(episode[2]);
		cut = Math.min(cut, episode.index);
	}

	// A year at position 0 is the title itself ("1917", "2012"), so take the
	// first year that has something before it.
	YEAR.lastIndex = 0;
	for (let year = YEAR.exec(name); year; year = YEAR.exec(name)) {
		if (year.index === 0) continue;
		if (year.index < cut) result.year = Number(year[1]);
		cut = Math.min(cut, year.index);
		break;
	}

	const tag = RELEASE_TAG.exec(name);
	if (tag) cut = Math.min(cut, tag.index);

	// A leading bracket that opened the year/tag we cut at ("Title (1999)").
	result.title = cleanup(name.slice(0, cut).replace(/[(\[]\s*$/, ""));
	if (!result.title) return null;
	return result;
}
