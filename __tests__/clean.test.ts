import { describe, it, expect } from "vitest";
import {
	CLEAN_OPTION_META,
	cleanSrt,
	DEFAULT_CLEAN_OPTIONS,
	previewCleanedSrt,
	toggleCleanOption,
	type CleanOptions,
} from "@/lib/clean";
import { parseSrt } from "@/lib/srt-codec";

const OFF: CleanOptions = {
	removeFirstCue: false,
	removeWatermarks: false,
	removeFormatting: false,
	removeSquareBrackets: false,
	removeParens: false,
	removeAngleBrackets: false,
	removeBraces: false,
	removeSpeakerLabels: false,
	mergeDuplicates: false,
	collapseLineBreaks: false,
	removeBlankCues: false,
	lowercase: false,
	uppercase: false,
};

function srt(...texts: string[]): string {
	return texts
		.map((t, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i + 1},000\n${t}`)
		.join("\n\n");
}

describe("cleanSrt", () => {
	it("passes clean content through unchanged (all options off)", () => {
		const { cleaned, stats } = cleanSrt(srt("Hello", "World"), OFF);
		expect(parseSrt(cleaned).map((c) => c.text)).toEqual(["Hello", "World"]);
		expect(stats).toEqual({ inputCues: 2, outputCues: 2, removedCues: 0, modifiedCues: 0 });
	});

	it("removeFormatting strips HTML tags and SSA overrides", () => {
		const { cleaned, stats } = cleanSrt(
			srt("<i>Whispered</i> words", "{\\an8}Top text"),
			{ ...OFF, removeFormatting: true },
		);
		expect(parseSrt(cleaned).map((c) => c.text)).toEqual(["Whispered words", "Top text"]);
		expect(stats.modifiedCues).toBe(2);
	});

	it("removeSquareBrackets drops sound cues", () => {
		const { cleaned } = cleanSrt(srt("[music] Hello"), { ...OFF, removeSquareBrackets: true });
		expect(parseSrt(cleaned)[0].text).toBe("Hello");
	});

	it("removeWatermarks strips URLs", () => {
		const { cleaned } = cleanSrt(
			srt("Subs by www.example.com today"),
			{ ...OFF, removeWatermarks: true },
		);
		expect(parseSrt(cleaned)[0].text).toBe("Subs by today");
	});

	it("removeSpeakerLabels strips leading NAME: labels", () => {
		const { cleaned } = cleanSrt(srt("JOHN: Hello there"), { ...OFF, removeSpeakerLabels: true });
		expect(parseSrt(cleaned)[0].text).toBe("Hello there");
	});

	it("removeBlankCues drops cues emptied by cleaning and counts them", () => {
		const { cleaned, stats } = cleanSrt(
			srt("[music]", "Hello"),
			{ ...OFF, removeSquareBrackets: true, removeBlankCues: true },
		);
		expect(parseSrt(cleaned).map((c) => c.text)).toEqual(["Hello"]);
		expect(stats.inputCues).toBe(2);
		expect(stats.outputCues).toBe(1);
		expect(stats.removedCues).toBe(1);
	});

	it("removeSpeakerLabels strips the label a WebVTT voice became", () => {
		const vtt = "WEBVTT\n\n00:01.000 --> 00:04.000\n<v Bob>Hello there</v>";
		const { cleaned } = cleanSrt(vtt, { ...OFF, removeSpeakerLabels: true });
		expect(parseSrt(cleaned)[0].text).toBe("Hello there");
	});

	it("removeFirstCue drops the leading cue", () => {
		const { cleaned } = cleanSrt(srt("Credit card", "Real dialogue"), { ...OFF, removeFirstCue: true });
		expect(parseSrt(cleaned).map((c) => c.text)).toEqual(["Real dialogue"]);
	});

	it("mergeDuplicates merges consecutive identical cues and spans their timing", () => {
		const { cleaned } = cleanSrt(srt("Same line", "Same line", "Different"), {
			...OFF,
			mergeDuplicates: true,
		});
		const cues = parseSrt(cleaned);
		expect(cues).toHaveLength(2);
		expect(cues[0]).toEqual({ start: "00:00:00,000", end: "00:00:02,000", text: "Same line" });
		expect(cues[1].text).toBe("Different");
	});

	it("collapseLineBreaks joins multi-line cues with a space", () => {
		const { cleaned } = cleanSrt(srt("Line one\nLine two"), { ...OFF, collapseLineBreaks: true });
		expect(parseSrt(cleaned)[0].text).toBe("Line one Line two");
	});

	it("uppercase wins over lowercase and applies to all text", () => {
		const { cleaned } = cleanSrt(srt("Mixed Case"), { ...OFF, uppercase: true, lowercase: true });
		expect(parseSrt(cleaned)[0].text).toBe("MIXED CASE");
	});

	it("output is renumbered sequentially after removals", () => {
		const { cleaned } = cleanSrt(srt("[x]", "Keep me", "[y]", "And me"), {
			...OFF,
			removeSquareBrackets: true,
			removeBlankCues: true,
		});
		expect(cleaned.startsWith("1\n")).toBe(true);
		expect(cleaned).toContain("\n\n2\n");
		expect(parseSrt(cleaned)).toHaveLength(2);
	});

	it("default options clean a typical noisy file", () => {
		const noisy = srt("<i>Hello</i>", "[applause]", "Visit https://spam.example now");
		const { cleaned, stats } = cleanSrt(noisy, DEFAULT_CLEAN_OPTIONS);
		const texts = parseSrt(cleaned).map((c) => c.text);
		expect(texts).toEqual(["Hello", "Visit now"]);
		expect(stats.inputCues).toBe(3);
		expect(stats.removedCues).toBe(1);
	});

	it("writes period timestamps back with a comma", () => {
		const { cleaned } = cleanSrt("1\n00:00:01.000 --> 00:00:02.500\nHello", OFF);
		expect(cleaned).toBe("1\n00:00:01,000 --> 00:00:02,500\nHello\n");
	});

	it("empty input produces empty output and zero stats", () => {
		const { cleaned, stats } = cleanSrt("", OFF);
		expect(cleaned).toBe("");
		expect(stats).toEqual({ inputCues: 0, outputCues: 0, removedCues: 0, modifiedCues: 0 });
	});
});

describe("CLEAN_OPTION_META", () => {
	it("covers every CleanOptions key exactly once — a new option cannot ship without UI metadata", () => {
		const metaKeys = CLEAN_OPTION_META.map((o) => o.key);
		expect(new Set(metaKeys).size).toBe(metaKeys.length);
		expect([...metaKeys].sort()).toEqual(Object.keys(DEFAULT_CLEAN_OPTIONS).sort());
	});
});

describe("toggleCleanOption", () => {
	it("enabling uppercase turns lowercase off, and vice versa", () => {
		const withLower = toggleCleanOption(OFF, "lowercase", true);
		expect(withLower.lowercase).toBe(true);
		const flipped = toggleCleanOption(withLower, "uppercase", true);
		expect(flipped.uppercase).toBe(true);
		expect(flipped.lowercase).toBe(false);
		const back = toggleCleanOption(flipped, "lowercase", true);
		expect(back.lowercase).toBe(true);
		expect(back.uppercase).toBe(false);
	});

	it("toggling other options leaves the rest untouched and does not mutate", () => {
		const next = toggleCleanOption(OFF, "removeFormatting", true);
		expect(next.removeFormatting).toBe(true);
		expect(OFF.removeFormatting).toBe(false);
		expect({ ...next, removeFormatting: false }).toEqual(OFF);
	});
});

describe("previewCleanedSrt", () => {
	const srt = "1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond\n";

	it("returns a file that fits whole", () => {
		expect(previewCleanedSrt(srt, 1000)).toEqual({ text: srt, truncated: false });
	});

	it("ends on the last whole cue that fits instead of mid-cue", () => {
		const preview = previewCleanedSrt(srt, srt.length - 3);
		expect(preview.truncated).toBe(true);
		expect(preview.text).toBe("1\n00:00:01,000 --> 00:00:02,000\nFirst");
	});

	it("cuts at the limit when even the first cue is longer", () => {
		expect(previewCleanedSrt(srt, 10)).toEqual({ text: srt.slice(0, 10), truncated: true });
	});
});
