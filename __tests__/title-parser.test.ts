import { describe, it, expect } from "vitest";
import { parseTitleFromFilename } from "@/lib/title-parser";

describe("parseTitleFromFilename", () => {
	it("reads a spaced TV filename with an NxNN episode code", () => {
		expect(parseTitleFromFilename("Breaking Bad - 1x01 - Pilot.DVDRip.ORPHEUS.en.srt")).toEqual({
			title: "Breaking Bad",
			season: 1,
			episode: 1,
		});
	});

	it("reads a dotted scene-release TV filename with an SxxEyy code", () => {
		expect(parseTitleFromFilename("Breaking.Bad.S01E01.720p.BluRay.x264-DEMAND.srt")).toEqual({
			title: "Breaking Bad",
			season: 1,
			episode: 1,
		});
	});

	it("reads a dotted movie filename with a year", () => {
		expect(parseTitleFromFilename("The.Matrix.1999.1080p.BluRay.srt")).toEqual({
			title: "The Matrix",
			year: 1999,
		});
	});

	it("reads a WebVTT filename the same way", () => {
		expect(parseTitleFromFilename("The.Matrix.1999.1080p.BluRay.en.vtt")).toEqual({
			title: "The Matrix",
			year: 1999,
		});
	});

	it("reads a movie filename with a bracketed year", () => {
		expect(parseTitleFromFilename("The Matrix (1999).srt")).toEqual({
			title: "The Matrix",
			year: 1999,
		});
		expect(parseTitleFromFilename("The Matrix [1999].en.srt")).toEqual({
			title: "The Matrix",
			year: 1999,
		});
	});

	it("keeps a leading year as the title, not a marker", () => {
		expect(parseTitleFromFilename("1917.2019.1080p.WEB-DL.srt")).toEqual({
			title: "1917",
			year: 2019,
		});
		expect(parseTitleFromFilename("2012.srt")).toEqual({ title: "2012" });
	});

	it("cuts at the first release tag when there is no year or episode", () => {
		expect(parseTitleFromFilename("Some_Movie_1080p_x264.srt")).toEqual({ title: "Some Movie" });
	});

	it("keeps hyphenated names and underscores-as-spaces", () => {
		expect(parseTitleFromFilename("Spider-Man_Far_From_Home.2019.srt")).toEqual({
			title: "Spider-Man Far From Home",
			year: 2019,
		});
	});

	it("does not treat a title word like 'Web' as a release tag", () => {
		expect(parseTitleFromFilename("Charlotte's Web (2006).srt")).toEqual({
			title: "Charlotte's Web",
			year: 2006,
		});
	});

	it("returns the whole name when nothing looks like a marker", () => {
		expect(parseTitleFromFilename("ex48.srt")).toEqual({ title: "ex48" });
		expect(parseTitleFromFilename("kb-french.srt")).toEqual({ title: "kb-french" });
	});

	it("strips the trailing language code only once the extension is gone", () => {
		expect(parseTitleFromFilename("Amelie.fr.srt")).toEqual({ title: "Amelie" });
		expect(parseTitleFromFilename("Amelie.eng.srt")).toEqual({ title: "Amelie" });
	});

	it("returns null when the name is nothing but markers", () => {
		expect(parseTitleFromFilename("S01E01.srt")).toBeNull();
		expect(parseTitleFromFilename(".srt")).toBeNull();
	});
});
