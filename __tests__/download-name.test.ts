import { describe, it, expect } from "vitest";
import { translatedFilename } from "@/lib/download-name";

describe("translatedFilename", () => {
	it("tags the file with the target language's code", () => {
		expect(translatedFilename("movie.srt", "French")).toBe("movie.fr.srt");
	});

	it("tags a regional variant with its region", () => {
		expect(translatedFilename("movie.srt", "Portuguese (Portugal)")).toBe("movie.pt-PT.srt");
	});

	it("names a translated WebVTT file as SRT", () => {
		expect(translatedFilename("movie.en.vtt", "French")).toBe("movie.fr.srt");
	});

	it("replaces a language tag the source already carries", () => {
		expect(translatedFilename("Movie.2024.en.srt", "Japanese")).toBe("Movie.2024.ja.srt");
		expect(translatedFilename("movie.EN.SRT", "German")).toBe("movie.de.srt");
		expect(translatedFilename("movie.zh-Hans.srt", "Korean")).toBe("movie.ko.srt");
	});

	it("keeps dotted parts of the name that are not language tags", () => {
		expect(translatedFilename("Show.S01E02.1080p.srt", "Spanish")).toBe("Show.S01E02.1080p.es.srt");
	});

	it("does not mistake a leading dot for a tag", () => {
		expect(translatedFilename(".en.srt", "French")).toBe(".en.fr.srt");
	});
});
