import { describe, it, expect } from "vitest";
import { formatTimestamp, parseSrt, serializeCue, serializeSrt } from "@/lib/srt-codec";
import type { Cue } from "@/types";

const SRT =
	"1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n2\n00:00:05,000 --> 00:00:08,000\nLine one\nLine two\n";

describe("parseSrt", () => {
	it("parses a standard file into cues with split start/end", () => {
		const cues = parseSrt(SRT);
		expect(cues).toEqual([
			{ start: "00:00:01,000", end: "00:00:04,000", text: "Hello world" },
			{ start: "00:00:05,000", end: "00:00:08,000", text: "Line one\nLine two" },
		]);
	});

	it("handles CRLF line endings", () => {
		const srt =
			"1\r\n00:00:01,000 --> 00:00:04,000\r\nHello\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nWorld";
		expect(parseSrt(srt).map((c) => c.text)).toEqual(["Hello", "World"]);
	});

	it("handles the bare CR line endings of old Mac files", () => {
		const srt = "1\r00:00:01,000 --> 00:00:04,000\rHello\r\r2\r00:00:05,000 --> 00:00:08,000\rLine one\rLine two\r";
		expect(parseSrt(srt)).toEqual([
			{ start: "00:00:01,000", end: "00:00:04,000", text: "Hello" },
			{ start: "00:00:05,000", end: "00:00:08,000", text: "Line one\nLine two" },
		]);
	});

	it("treats a line of only spaces or tabs as a cue separator", () => {
		const srt =
			"1\n00:00:01,000 --> 00:00:04,000\nHello\n \n2\n00:00:05,000 --> 00:00:08,000\nWorld\n\t\r\n3\n00:00:09,000 --> 00:00:10,000\nAgain";
		expect(parseSrt(srt).map((c) => c.text)).toEqual(["Hello", "World", "Again"]);
	});

	it("tolerates several blank lines between cues", () => {
		const srt = "1\n00:00:01,000 --> 00:00:04,000\nHello\n\n \n\n2\n00:00:05,000 --> 00:00:08,000\nWorld";
		expect(parseSrt(srt).map((c) => c.text)).toEqual(["Hello", "World"]);
	});

	it("reads a timestamp line written without spaces around the arrow", () => {
		const srt = "1\n00:00:01,000-->00:00:04,000\nHello\n\n2\n00:00:05,000 -->00:00:08,000\nWorld";
		expect(parseSrt(srt)).toEqual([
			{ start: "00:00:01,000", end: "00:00:04,000", text: "Hello" },
			{ start: "00:00:05,000", end: "00:00:08,000", text: "World" },
		]);
	});

	it("writes timestamps with a comma and zero padding", () => {
		const srt = "1\n00:00:01.000 --> 0:00:04.5\nHello";
		expect(parseSrt(srt)).toEqual([{ start: "00:00:01,000", end: "00:00:04,500", text: "Hello" }]);
		expect(serializeSrt(parseSrt(srt))).toBe("1\n00:00:01,000 --> 00:00:04,500\nHello\n");
	});

	it("keeps a timestamp it cannot read as written", () => {
		expect(parseSrt("1\nstart --> end\nHello")).toEqual([{ start: "start", end: "end", text: "Hello" }]);
	});

	it("reads positioning after the end time apart from the end time and writes it back", () => {
		const srt = "1\n00:00:01,000 --> 00:00:04,000  X1:40 X2:600 Y1:20 Y2:50\nHello";
		const cues = parseSrt(srt);
		expect(cues).toEqual([
			{ start: "00:00:01,000", end: "00:00:04,000", settings: "X1:40 X2:600 Y1:20 Y2:50", text: "Hello" },
		]);
		expect(serializeSrt(cues)).toBe("1\n00:00:01,000 --> 00:00:04,000 X1:40 X2:600 Y1:20 Y2:50\nHello\n");
	});

	it("reads a WebVTT file as SRT cues", () => {
		const vtt =
			"WEBVTT - Episode 1\n\nNOTE written by hand\n\nSTYLE\n::cue { color: yellow }\n\n" +
			"intro\n00:01.000 --> 00:04.500 align:start position:10%\nHello\n\n" +
			"01:00:05.000 --> 01:00:08.000\nWorld\n";
		const cues = parseSrt(vtt);
		expect(cues).toEqual([
			{ start: "00:00:01,000", end: "00:00:04,500", text: "Hello" },
			{ start: "01:00:05,000", end: "01:00:08,000", text: "World" },
		]);
		expect(serializeSrt(cues)).toBe(
			"1\n00:00:01,000 --> 00:00:04,500\nHello\n\n2\n01:00:05,000 --> 01:00:08,000\nWorld\n",
		);
	});

	it("drops WebVTT-only tags from cue text and keeps the ones SRT understands", () => {
		const vtt =
			"WEBVTT\n\n00:01.000 --> 00:04.000\n<c.yellow>Look</c> <i>out</i>!\n<00:02.000>Now <b>run</b>\n\n" +
			"00:05.000 --> 00:08.000\n<lang fr>Bonjour</lang>, <ruby>漢<rt>かん</rt></ruby>\n";
		expect(parseSrt(vtt).map((c) => c.text)).toEqual(["Look <i>out</i>!\nNow <b>run</b>", "Bonjour, 漢"]);
	});

	it("turns a WebVTT voice into a speaker label", () => {
		const vtt = "WEBVTT\n\n00:01.000 --> 00:04.000\n<v Bob>Hi there</v>\n<v.loud Mary Ann>Hello!\n<v>No name\n";
		expect(parseSrt(vtt)[0].text).toBe("BOB: Hi there\nMARY ANN: Hello!\nNo name");
	});

	it("unescapes WebVTT character references", () => {
		const vtt = "WEBVTT\n\n00:01.000 --> 00:04.000\nTom &amp; Jerry &lt;c&gt;\n";
		expect(parseSrt(vtt)[0].text).toBe("Tom & Jerry <c>");
	});

	it("keeps WebVTT-looking tags in an SRT file as written", () => {
		expect(parseSrt("1\n00:00:01,000 --> 00:00:04,000\n<c.yellow>Hi</c>")[0].text).toBe("<c.yellow>Hi</c>");
	});

	it("strips a leading BOM", () => {
		const srt = "﻿1\n00:00:01,000 --> 00:00:04,000\nHello";
		expect(parseSrt(srt)).toHaveLength(1);
	});

	it("tolerates missing cue-number lines", () => {
		const srt =
			"00:00:01,000 --> 00:00:04,000\nHello\n\n00:00:05,000 --> 00:00:08,000\nWorld";
		expect(parseSrt(srt)).toHaveLength(2);
	});

	it("tolerates non-numeric cue-number lines (the old client filter rejected these)", () => {
		const srt =
			"1.\n00:00:01,000 --> 00:00:04,000\nHello\n\n#2\n00:00:05,000 --> 00:00:08,000\nWorld";
		expect(parseSrt(srt)).toHaveLength(2);
	});

	it("skips blocks without a timestamp line, such as stream status frames", () => {
		const content =
			'1\n00:00:01,000 --> 00:00:04,000\nHola\n\n__STATUS__:{"event":"retrying","attempt":1}\n\n2\n00:00:05,000 --> 00:00:08,000\nMundo\n\n';
		expect(parseSrt(content).map((c) => c.text)).toEqual(["Hola", "Mundo"]);
	});

	it("preserves cues with empty text (filtering is caller policy)", () => {
		const srt =
			"1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n00:00:05,000 --> 00:00:08,000\n";
		const cues = parseSrt(srt);
		expect(cues).toHaveLength(2);
		expect(cues[1].text).toBe("");
	});

	it("does not treat ' --> ' inside cue text as a timestamp line", () => {
		const srt = "1\n00:00:01,000 --> 00:00:04,000\nGo left --> then right";
		const cues = parseSrt(srt);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe("Go left --> then right");
	});

	it("skips malformed timestamp lines missing a side", () => {
		const srt = "1\n00:00:01,000 --> \nHello";
		expect(parseSrt(srt)).toHaveLength(0);
	});

	it("returns [] for empty or non-SRT content", () => {
		expect(parseSrt("")).toEqual([]);
		expect(parseSrt("just some prose\n\nwith paragraphs")).toEqual([]);
	});
});

describe("serializeCue / serializeSrt", () => {
	const cues: Cue[] = [
		{ start: "00:00:01,000", end: "00:00:04,000", text: "Hello" },
		{ start: "00:00:05,000", end: "00:00:08,000", text: "Two\nlines" },
	];

	it("serializes one cue as a numbered block", () => {
		expect(serializeCue(cues[0], 1)).toBe("1\n00:00:01,000 --> 00:00:04,000\nHello");
	});

	it("numbers cues positionally and ends the file with a newline", () => {
		expect(serializeSrt(cues)).toBe(
			"1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n00:00:05,000 --> 00:00:08,000\nTwo\nlines\n",
		);
	});

	it("drops blank lines from cue text so the block stays one block", () => {
		const cue: Cue = { start: "00:00:01,000", end: "00:00:04,000", text: "\nOne\n\n \r\nTwo\n" };
		expect(serializeCue(cue, 1)).toBe("1\n00:00:01,000 --> 00:00:04,000\nOne\nTwo");
	});

	it("keeps a cue whose text held a blank line whole through a round trip", () => {
		const withGap: Cue[] = [
			{ start: "00:00:01,000", end: "00:00:04,000", text: "One\n\nTwo" },
			{ start: "00:00:05,000", end: "00:00:08,000", text: "Three" },
		];
		expect(parseSrt(serializeSrt(withGap)).map((c) => c.text)).toEqual(["One\nTwo", "Three"]);
	});

	it("serializes an empty list to an empty string", () => {
		expect(serializeSrt([])).toBe("");
	});

	it("round-trips: parse(serialize(cues)) === cues", () => {
		expect(parseSrt(serializeSrt(cues))).toEqual(cues);
	});

	it("round-trips a parsed file back to identical cues after renumbering", () => {
		const shuffledNumbers =
			"7\n00:00:01,000 --> 00:00:04,000\nHello\n\n99\n00:00:05,000 --> 00:00:08,000\nWorld";
		const cuesIn = parseSrt(shuffledNumbers);
		expect(parseSrt(serializeSrt(cuesIn))).toEqual(cuesIn);
	});
});

describe("formatTimestamp", () => {
	it("renders mm:ss by default", () => {
		expect(formatTimestamp("00:01:02,345")).toBe("01:02");
	});

	it("leads with the hour once past it instead of dropping it", () => {
		expect(formatTimestamp("01:23:45,678")).toBe("1:23:45");
		expect(formatTimestamp("02:00:09,000", "deciseconds")).toBe("2:00:09.0");
	});

	it("renders mm:ss.d with decisecond precision", () => {
		expect(formatTimestamp("00:01:02,345", "deciseconds")).toBe("01:02.3");
		expect(formatTimestamp("00:00:09,000", "deciseconds")).toBe("00:09.0");
	});

	it("falls back to the raw string on malformed input instead of throwing", () => {
		// The parser tolerates timestamps the strict grammar rejects — display
		// must survive them (this used to crash the busy-phase render).
		expect(formatTimestamp("1:02")).toBe("1:02");
		expect(formatTimestamp("1:02", "deciseconds")).toBe("1:02");
		expect(formatTimestamp("garbage")).toBe("garbage");
		expect(formatTimestamp("")).toBe("");
	});
});
