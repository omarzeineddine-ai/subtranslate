import { describe, it, expect } from "vitest";
import { decodeSubtitleBytes, describeEncoding, hasSubtitleCues, isSubtitleFilename, withoutSubtitleExtension } from "@/lib/subtitle-file";

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("decodeSubtitleBytes", () => {
	it("decodes valid UTF-8 as UTF-8", () => {
		const result = decodeSubtitleBytes(utf8("1\n00:00:01,000 --> 00:00:02,000\nCafé ¿qué? 日本語\n"));
		expect(result.encoding).toBe("utf-8");
		expect(result.fallback).toBe(false);
		expect(result.text).toContain("Café ¿qué? 日本語");
	});

	it("treats pure ASCII as UTF-8, not as a fallback", () => {
		const result = decodeSubtitleBytes(utf8("Hello"));
		expect(result).toEqual({ text: "Hello", encoding: "utf-8", fallback: false });
	});

	it("falls back to Windows-1252 when the bytes are not valid UTF-8", () => {
		// "Café" in Windows-1252: é is a lone 0xE9, invalid as UTF-8.
		const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("windows-1252");
		expect(result.fallback).toBe(true);
		expect(result.text).toBe("Café");
		expect(result.text).not.toContain("�");
	});

	it("maps the Windows-1252 0x80-0x9F range to its printable characters", () => {
		// 0x80 is € and 0x93/0x94 are curly quotes in Windows-1252 (control
		// characters in ISO-8859-1), and 0xE9 keeps the block out of UTF-8.
		const bytes = new Uint8Array([0x80, 0x93, 0xe9, 0x94]);
		expect(decodeSubtitleBytes(bytes).text).toBe("€“é”");
	});

	it("reads a file whose letters are mostly high bytes as Windows-1251", () => {
		// "Привет, мир" in Windows-1251, with an SRT header in ASCII around it.
		const cyrillic = [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x2c, 0x20, 0xec, 0xe8, 0xf0];
		const bytes = new Uint8Array([...utf8("1\n00:00:01,000 --> 00:00:02,000\n"), ...cyrillic, 0x0a]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("windows-1251");
		expect(result.fallback).toBe(true);
		expect(result.text).toContain("Привет, мир");
	});

	it("keeps Windows-1252 for Western text even when a line is mostly accented", () => {
		// "Été à Paris, déjà vu" — accents are the minority among the letters.
		const bytes = new Uint8Array([
			0xc9, 0x74, 0xe9, 0x20, 0xe0, 0x20, ...utf8("Paris, d"), 0xe9, 0x6a, 0xe0, ...utf8(" vu"),
		]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("windows-1252");
		expect(result.text).toBe("Été à Paris, déjà vu");
	});

	it("reads a symbol byte between two letters as a Windows-1250 letter", () => {
		// "było" and "może" in Windows-1250: ł is 0xB3 (³ in 1252), ż is 0xBF (¿).
		const bytes = new Uint8Array([...utf8("by"), 0xb3, ...utf8("o mo"), 0xbf, ...utf8("e")]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("windows-1250");
		expect(result.fallback).toBe(true);
		expect(result.text).toBe("było może");
	});

	it("reads a byte Windows-1252 leaves undefined as a Windows-1250 letter", () => {
		// "ať" in Windows-1250: ť is 0x9D.
		const result = decodeSubtitleBytes(new Uint8Array([0x61, 0x9d]));
		expect(result.encoding).toBe("windows-1250");
		expect(result.text).toBe("ať");
	});

	it("keeps Windows-1252 when its symbols sit at the edge of a word", () => {
		// "¿Qué? 5 m³" — an opening question mark and a trailing superscript.
		const bytes = new Uint8Array([0xbf, ...utf8("Qu"), 0xe9, ...utf8("? 5 m"), 0xb3]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("windows-1252");
		expect(result.text).toBe("¿Qué? 5 m³");
	});

	it("honours a UTF-8 BOM and strips it from the text", () => {
		const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("utf-8");
		expect(result.text).toBe("Hi");
	});

	it("decodes UTF-16 LE with a BOM (Windows Notepad's default for years)", () => {
		const bytes = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00, 0xe9, 0x00]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("utf-16le");
		expect(result.fallback).toBe(false);
		expect(result.text).toBe("Hié");
	});

	it("decodes UTF-16 BE with a BOM", () => {
		const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]);
		const result = decodeSubtitleBytes(bytes);
		expect(result.encoding).toBe("utf-16be");
		expect(result.text).toBe("Hi");
	});

	it("accepts an ArrayBuffer as well as a Uint8Array", () => {
		const buffer = utf8("Hi").buffer as ArrayBuffer;
		expect(decodeSubtitleBytes(buffer).text).toBe("Hi");
	});

	it("returns empty text for an empty file", () => {
		expect(decodeSubtitleBytes(new Uint8Array())).toEqual({ text: "", encoding: "utf-8", fallback: false });
	});
});

describe("describeEncoding", () => {
	it("is silent for files that decoded cleanly", () => {
		expect(describeEncoding(decodeSubtitleBytes(utf8("Hi")))).toBeUndefined();
	});

	it("explains the fallback and how to fix a wrong guess", () => {
		const note = describeEncoding(decodeSubtitleBytes(new Uint8Array([0xe9])));
		expect(note).toMatch(/Windows-1252/);
		expect(note).toMatch(/UTF-8/);
	});

	it("names the Cyrillic code page when that was the guess", () => {
		const note = describeEncoding(decodeSubtitleBytes(new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])));
		expect(note).toMatch(/Windows-1251/);
	});
});

describe("subtitle filenames", () => {
	it("accepts SRT and WebVTT files in any case and nothing else", () => {
		expect(isSubtitleFilename("movie.srt")).toBe(true);
		expect(isSubtitleFilename("movie.VTT")).toBe(true);
		expect(isSubtitleFilename("movie.ass")).toBe(false);
		expect(isSubtitleFilename("srt")).toBe(false);
	});

	it("drops only the subtitle extension", () => {
		expect(withoutSubtitleExtension("movie.en.vtt")).toBe("movie.en");
		expect(withoutSubtitleExtension("movie.en.SRT")).toBe("movie.en");
	});
});

describe("hasSubtitleCues", () => {
	it("accepts SRT and WebVTT text with a cue", () => {
		expect(hasSubtitleCues("1\n00:00:01,000 --> 00:00:02,000\nHello\n")).toBe(true);
		expect(hasSubtitleCues("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n")).toBe(true);
	});

	it("rejects text with no cues, or only cues without text", () => {
		expect(hasSubtitleCues("")).toBe(false);
		expect(hasSubtitleCues("just some notes")).toBe(false);
		expect(hasSubtitleCues("1\n00:00:01,000 --> 00:00:02,000\n\n")).toBe(false);
	});
});
