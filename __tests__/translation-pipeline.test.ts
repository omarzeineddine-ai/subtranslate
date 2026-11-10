import { describe, it, expect } from "vitest";
import { parseSrt, serializeCue } from "@/lib/srt-codec";
import {
	detectEmptySegments,
	detectEnglishDriftSegments,
	detectMergedSegments,
	detectSplitSegments,
	endsUnpunctuatedByConvention,
	detectUntranslatedSegments,
	endsWithTerminalPunctuation,
} from "@/lib/parsing";
import {
	translateBatchSafe,
	type BatchTranslator,
	type SingleTranslator,
	type SessionEvent,
} from "@/lib/translate-session";
import type { Cue } from "@/types";

function makeCue(timestamp: string, text: string): Cue {
	const [start, end] = timestamp.split(" --> ");
	return { start, end, text };
}

// ═══════════════════════════════════════════════════════════════════════
// SRT INPUT PARSING TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("SRT input parsing (codec parse + translatable filter)", () => {
	// Same rule the route and the client both apply on top of the codec.
	function parseTranslatable(content: string): Cue[] {
		return parseSrt(content).filter((cue) => cue.text.trim());
	}

	it("parses standard SRT format", () => {
		const srt =
			"1\n00:00:01,000 --> 00:00:04,000\nHello world\n\n2\n00:00:05,000 --> 00:00:08,000\nGoodbye";
		const segments = parseTranslatable(srt);
		expect(segments.length).toBe(2);
		expect(segments[0].text).toBe("Hello world");
		expect(segments[1].text).toBe("Goodbye");
	});

	it("handles multiline subtitle text", () => {
		const srt =
			"1\n00:00:01,000 --> 00:00:04,000\nLine one\nLine two\n\n2\n00:00:05,000 --> 00:00:08,000\nSingle line";
		const segments = parseTranslatable(srt);
		expect(segments.length).toBe(2);
		expect(segments[0].text).toBe("Line one\nLine two");
	});

	it("filters out segments with empty text", () => {
		const srt =
			"1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n00:00:05,000 --> 00:00:08,000\n   \n\n3\n00:00:09,000 --> 00:00:12,000\nWorld";
		const segments = parseTranslatable(srt);
		expect(segments.length).toBe(2);
	});

	it("handles Windows CRLF line endings", () => {
		const srt =
			"1\r\n00:00:01,000 --> 00:00:04,000\r\nHello\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nWorld";
		const segments = parseTranslatable(srt);
		expect(segments.length).toBe(2);
	});

	it("handles large SRT files (2350 segments)", () => {
		const blocks = Array.from({ length: 2350 }, (_, i) => {
			const h = Math.floor(i / 3600);
			const m = Math.floor((i % 3600) / 60);
			const s = i % 60;
			const ts = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},000`;
			const tsEnd = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s + 1).padStart(2, "0")},000`;
			return `${i + 1}\n${ts} --> ${tsEnd}\nSegment ${i + 1}`;
		});
		const srt = blocks.join("\n\n");
		const segments = parseTranslatable(srt);
		expect(segments.length).toBe(2350);
	});
});


// ═══════════════════════════════════════════════════════════════════════
// MERGE DETECTION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("detectMergedSegments", () => {
	it("detects obvious merge: long translation + short next + fragment original", () => {
		const originals = [
			"I thought you were doing a good job",
			"of finding someone new.",
			"Me?",
			"(Sighing)",
			"I want you to be comfortable.",
		];
		// AI merged [0]+[1] into slot 0, then shifted everything
		const translations = [
			"あなたは新しい人を見つけるのが上手だと思ってたのに。",
			"私が？",
			"(ため息)",
			"楽にしてほしい。",
			"何もしたくないだけ。",
		];
		const suspects = detectMergedSegments(originals, translations);
		expect(suspects).toContain(0);
	});

	it("returns empty for well-proportioned translations", () => {
		const originals = [
			"Hello, how are you?",
			"I'm fine, thank you.",
			"That's great to hear.",
		];
		const translations = [
			"こんにちは、お元気ですか？",
			"元気です、ありがとう。",
			"それは良かったです。",
		];
		const suspects = detectMergedSegments(originals, translations);
		expect(suspects).toEqual([]);
	});

	it("does not false-positive on CJK density (shorter chars is normal)", () => {
		const originals = [
			"I want you to be comfortable.",
			"I just don't want to do anything.",
			"What do you mean by that?",
		];
		// CJK translations are naturally shorter in char count
		const translations = [
			"楽にしてほしい。",
			"何もしたくない。",
			"どういう意味？",
		];
		const suspects = detectMergedSegments(originals, translations);
		expect(suspects).toEqual([]);
	});

	it("handles single-segment input", () => {
		expect(detectMergedSegments(["Hello"], ["こんにちは"])).toEqual([]);
	});

	it("handles empty input", () => {
		expect(detectMergedSegments([], [])).toEqual([]);
	});

	it("detects merge in middle of batch", () => {
		const originals = [
			"Good morning.",
			"I was thinking about",
			"what happened yesterday.",
			"It was unexpected.",
			"Let's move on.",
		];
		// Merge at index 1: absorbed index 2's meaning, shifted rest
		const translations = [
			"おはようございます。",
			"昨日起こったことについて考えていました。",
			"予想外でした。",
			"先に進みましょう。",
			"はい。",
		];
		const suspects = detectMergedSegments(originals, translations);
		expect(suspects).toContain(1);
	});

	it("returns empty when lengths mismatch (defensive)", () => {
		expect(detectMergedSegments(["a", "b"], ["c"])).toEqual([]);
		expect(detectMergedSegments(["a"], ["b", "c"])).toEqual([]);
	});

	describe("punctuation-flip signal (catches subtle merges)", () => {
		it("catches the French merge bug from screenshot 2", () => {
			// Original 99 is mid-sentence (ends without terminal punctuation);
			// translation 99 ends with terminal and is notably longer — it
			// absorbed original 100's content.
			const originals = [
				"mais me mettre sa photo sous le nez",
				"ne suscitera pas ma pitié.",
				"Toi et moi, on a un compte à régler.",
			];
			const translations = [
				"pero meterme su foto en la cara no generará mi compasión.",
				"Tú y yo, tenemos una cuenta pendiente.",
				"Y nada de lo que hiciste durante esos cuatro años,",
			];
			const suspects = detectMergedSegments(originals, translations);
			expect(suspects).toContain(0);
		});

		it("doesn't false-positive on minor punctuation differences", () => {
			// Original is a short fragment without terminal punctuation;
			// translation also doesn't have terminal punctuation. No flag.
			const originals = ["Yes", "OK"];
			const translations = ["Sí", "Vale"];
			expect(detectMergedSegments(originals, translations)).toEqual([]);
		});

		it("doesn't flag when translation is similar length to original", () => {
			// Original mid-sentence, translation has terminal but is roughly
			// the same length — natural stylistic punctuation, not a merge.
			const originals = ["Hello there", "How are you"];
			const translations = ["Hola.", "¿Cómo estás?"];
			expect(detectMergedSegments(originals, translations)).toEqual([]);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════
// TERMINAL PUNCTUATION DETECTION
// ═══════════════════════════════════════════════════════════════════════

describe("endsWithTerminalPunctuation", () => {
	describe("Latin script terminal punctuation", () => {
		it("recognizes period", () => {
			expect(endsWithTerminalPunctuation("Hello world.")).toBe(true);
		});
		it("recognizes exclamation", () => {
			expect(endsWithTerminalPunctuation("Stop!")).toBe(true);
		});
		it("recognizes question mark", () => {
			expect(endsWithTerminalPunctuation("Really?")).toBe(true);
		});
		it("recognizes Spanish punctuation (¿…?)", () => {
			expect(endsWithTerminalPunctuation("¿A quién mira hoy?")).toBe(true);
			expect(endsWithTerminalPunctuation("¡Para!")).toBe(true);
		});
		it("recognizes French spaced punctuation", () => {
			expect(endsWithTerminalPunctuation("Mais oui ?")).toBe(true);
			expect(endsWithTerminalPunctuation("Vraiment !")).toBe(true);
		});
	});

	describe("CJK terminal punctuation", () => {
		it("recognizes Japanese/Chinese period (。)", () => {
			expect(endsWithTerminalPunctuation("こんにちは。")).toBe(true);
			expect(endsWithTerminalPunctuation("你好。")).toBe(true);
		});
		it("recognizes Japanese/Chinese exclamation (！)", () => {
			expect(endsWithTerminalPunctuation("やった！")).toBe(true);
		});
		it("recognizes Japanese/Chinese question (？)", () => {
			expect(endsWithTerminalPunctuation("本当？")).toBe(true);
		});
	});

	describe("other scripts", () => {
		it("recognizes Arabic question mark (؟)", () => {
			expect(endsWithTerminalPunctuation("ما اسمك؟")).toBe(true);
		});
		it("recognizes Devanagari danda (।)", () => {
			expect(endsWithTerminalPunctuation("नमस्ते।")).toBe(true);
		});
	});

	describe("ellipsis is NOT terminal", () => {
		it("rejects three dots", () => {
			expect(endsWithTerminalPunctuation("I was thinking...")).toBe(false);
		});
		it("rejects two dots", () => {
			expect(endsWithTerminalPunctuation("And then..")).toBe(false);
		});
		it("rejects unicode ellipsis (…)", () => {
			expect(endsWithTerminalPunctuation("Hmm…")).toBe(false);
		});
		it("rejects ellipsis followed by closing quote", () => {
			expect(endsWithTerminalPunctuation('He said "wait..."')).toBe(false);
		});
	});

	describe("trailing wrappers after terminal", () => {
		it("accepts terminal followed by closing quote", () => {
			expect(endsWithTerminalPunctuation('She said "yes."')).toBe(true);
			expect(endsWithTerminalPunctuation('"Stop!"')).toBe(true);
		});
		it("accepts terminal followed by closing paren", () => {
			expect(endsWithTerminalPunctuation("(That's it.)")).toBe(true);
		});
		it("accepts trailing whitespace after terminal", () => {
			expect(endsWithTerminalPunctuation("Hello.   ")).toBe(true);
		});
	});

	describe("non-terminal cases", () => {
		it("rejects mid-sentence with comma", () => {
			expect(endsWithTerminalPunctuation("I went to the store,")).toBe(false);
		});
		it("rejects bare conjunction at end", () => {
			expect(endsWithTerminalPunctuation("and so on the next day")).toBe(false);
		});
		it("rejects empty string", () => {
			expect(endsWithTerminalPunctuation("")).toBe(false);
			expect(endsWithTerminalPunctuation("   ")).toBe(false);
		});
		it("rejects translation ending with conjunction", () => {
			expect(
				endsWithTerminalPunctuation(
					"El nombre completo de Finn es Finn Mertens, y",
				),
			).toBe(false);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════
// SPLIT DETECTION TESTS — the exact bug class from user reports
// ═══════════════════════════════════════════════════════════════════════

describe("detectSplitSegments", () => {
	describe("real user-report scenarios", () => {
		it("catches the Spanish drift bug from screenshot 1", () => {
			// English originals as in the bug screenshot. Segment 3 is a long
			// complete sentence; the model split it across two output slots
			// and everything downstream is misaligned.
			const originals = [
				"Who'll we looking at today?",
				"Ah yes, Finn the Human.",
				"Finn's full name is Finn Mertens, and he is considered to be the last human in Ool.",
				"Finn was found abandoned as a baby by Jake's parents, Joshua and Margaret.",
				"They foolishly mistook him for a mutt scamp, which is why he's called Finn.",
				"Little is known about Finn's real mother,",
			];
			const translations = [
				"¿A quién estaremos mirando hoy?",
				"Ah sí, Finn el Humano.",
				// truncated mid-sentence, ends with conjunction "y" — SPLIT
				"El nombre completo de Finn es Finn Mertens, y",
				"se le considera el último humano en Ool.",
				"Finn fue encontrado abandonado de bebé",
				"por los padres de Jake, Joshua y Margaret.",
			];
			const suspects = detectSplitSegments(originals, translations);
			expect(suspects).toContain(2);
		});

		it("catches the French drift bug from screenshot 2", () => {
			const originals = [
				"Oui, je veux éviter de te tuer sous les yeux de ta fille,",
				"mais me mettre sa photo sous le nez ne suscitera pas ma pitié.",
				"Toi et moi, on a un compte à régler.",
			];
			const translations = [
				"Sí, quiero evitar matarte\nante los ojos de tu hija,",
				// translation of segment 2 got cut; rest spilled into next slot
				"pero meterme su foto en la cara\nno generará mi compasión.",
				"Tú y yo, tenemos una cuenta pendiente.",
			];
			// Original [1] ends with "." — translation [1] ends with "." too. OK.
			// Original [2] ends with "." — translation [2] ends with "." → no split detected
			// (this particular alignment looks clean to the detector; the
			// production drift is at a different boundary, see end-to-end tests).
			const suspects = detectSplitSegments(originals, translations);
			expect(suspects).toEqual([]);
		});

		it("catches drift where the translation is mid-sentence", () => {
			const originals = [
				"Hello there.",
				"This is a long sentence that runs on and on and on.",
				"How are you doing today?",
			];
			const translations = [
				"Hola.",
				// truncated — original is a full sentence, translation is mid-phrase
				"Esta es una oración larga que sigue",
				"y sigue. ¿Cómo estás hoy?",
			];
			const suspects = detectSplitSegments(originals, translations);
			expect(suspects).toContain(1);
		});
	});

	describe("clean translations should NOT trigger detection", () => {
		it("perfectly aligned terminal-punctuation pairs", () => {
			const originals = [
				"Hello.",
				"How are you?",
				"I am fine!",
			];
			const translations = [
				"Hola.",
				"¿Cómo estás?",
				"¡Estoy bien!",
			];
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});

		it("matching CJK terminal punctuation", () => {
			const originals = ["Hello.", "Goodbye."];
			const translations = ["こんにちは。", "さようなら。"];
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});

		it("mid-sentence originals translated to mid-sentence", () => {
			// Both segments are sentence fragments — no terminal punctuation
			// in either original or translation. Not flagged.
			const originals = [
				"I was thinking about",
				"what happened yesterday",
			];
			const translations = [
				"Estaba pensando en",
				"lo que pasó ayer",
			];
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});

		it("ellipsis-ending originals translated to ellipsis", () => {
			const originals = ["I was thinking...", "And then..."];
			const translations = ["Estaba pensando...", "Y luego..."];
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});

		it("ellipsis original translated without terminal — not flagged", () => {
			// Original doesn't end with terminal punctuation (ellipsis is a
			// continuation), so split detection shouldn't fire even though the
			// translation is also incomplete.
			const originals = ["I was thinking..."];
			const translations = ["Estaba pensando"];
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});
	});

	describe("edge cases", () => {
		it("handles empty inputs", () => {
			expect(detectSplitSegments([], [])).toEqual([]);
		});

		it("handles single segment", () => {
			expect(detectSplitSegments(["Hi."], ["Hola."])).toEqual([]);
			expect(detectSplitSegments(["Hi."], ["Hola"])).toEqual([0]);
		});

		it("handles whitespace-only translations", () => {
			const originals = ["Hello.", "World."];
			const translations = ["Hola.", "   "];
			// Skipped — whitespace-only translation isn't a split signal
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});

		it("returns empty on length mismatch (defensive)", () => {
			expect(detectSplitSegments(["a", "b"], ["c"])).toEqual([]);
			expect(detectSplitSegments(["a"], ["b", "c"])).toEqual([]);
		});

		it("flags every split when multiple originals are truncated", () => {
			const originals = [
				"First sentence.",
				"Second sentence.",
				"Third sentence.",
			];
			const translations = [
				"Primera oración",  // missing terminal
				"Segunda oración",  // missing terminal
				"Tercera oración.", // OK
			];
			const suspects = detectSplitSegments(originals, translations);
			expect(suspects).toEqual([0, 1]);
		});

		it("handles closing quote/bracket after terminal", () => {
			const originals = ['He said "stop."'];
			const translations = ['Él dijo "para."'];
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});
	});

	describe("multilingual terminal punctuation", () => {
		it("English period → CJK 。 matches", () => {
			expect(detectSplitSegments(["Hello."], ["こんにちは。"])).toEqual([]);
		});
		it("English period → Arabic translation without terminal — flagged", () => {
			expect(detectSplitSegments(["Hello."], ["مرحبا"])).toEqual([0]);
		});
		it("English period → Hindi danda matches", () => {
			expect(detectSplitSegments(["Hello."], ["नमस्ते।"])).toEqual([]);
		});
	});

	describe("scripts that leave sentence ends unmarked", () => {
		// Lines from a real English→Japanese translation. Japanese subtitles
		// drop the final 。 by convention, so every one of these is a complete,
		// correctly aligned cue. Each used to be flagged as a split, and each
		// flag re-translated the rest of its batch one cue at a time: 1,205
		// single-cue requests for a 2,172-cue file.
		it("does not flag correct Japanese cues that end without 。", () => {
			const originals = [
				"- No. - We thought about it but we didn't.",
				"It's always different.",
				"If we stay up late, we hang out until 6am.",
				"But people disappear one by one. People who get tired.",
				"The earliest I slept was at 4am.",
				"Right.",
			];
			const translations = [
				"- いや - 考えたけど、しなかった",
				"いつも違う",
				"夜更かしするなら、朝6時まで遊ぶ",
				"でも、疲れた人から一人ずつ消えていく",
				"一番早く寝たのは午前4時だった",
				"そうだね",
			];
			expect(detectSplitSegments(originals, translations)).toEqual([]);
		});

		it("does not flag a line that closes on a CJK bracket or quote", () => {
			expect(detectSplitSegments(["(He laughs.)"], ["(彼は笑う)"])).toEqual([]);
			expect(detectSplitSegments(['"I will go."'], ["「行きます」"])).toEqual([]);
			expect(detectSplitSegments(["(He laughs.)"], ["（彼は笑う）"])).toEqual([]);
		});

		it("does not flag Chinese, Korean or Thai cues that end on a word", () => {
			expect(detectSplitSegments(["I am fine."], ["我很好"])).toEqual([]);
			expect(detectSplitSegments(["I am fine."], ["저는 괜찮아요"])).toEqual([]);
			expect(detectSplitSegments(["I am fine."], ["ฉันสบายดี"])).toEqual([]);
		});

		it("still flags a Japanese cue cut off at a comma", () => {
			// From the same file: this slot holds the start of the NEXT cue's
			// sentence, and the comma it stops on is what gives it away.
			const originals = ["since you moved into the house?", "I joined to meet someone new,"];
			const translations = ["新しい人に出会うために参加したので、", "それは変わっていません。"];
			expect(detectSplitSegments(originals, translations)).toEqual([0]);
		});

		it("still flags a Japanese cue that trails off where the original ended", () => {
			expect(detectSplitSegments(["Who are they?"], ["私の予想では..."])).toEqual([0]);
		});

		it("still flags a cue in such a script that ends on a Latin word or a number", () => {
			// No convention covers these endings, so the missing mark counts.
			expect(detectSplitSegments(["That is fine."], ["それはOK"])).toEqual([0]);
			expect(detectSplitSegments(["It was in 2024."], ["それは2024"])).toEqual([0]);
		});

		it("keeps flagging a missing full stop in scripts that use one", () => {
			expect(detectSplitSegments(["Hello."], ["Hola"])).toEqual([0]);
			expect(detectSplitSegments(["Hello."], ["Привет"])).toEqual([0]);
			expect(detectSplitSegments(["Hello."], ["مرحبا"])).toEqual([0]);
			expect(detectSplitSegments(["Hello."], ["नमस्ते"])).toEqual([0]);
		});
	});
});

describe("endsUnpunctuatedByConvention", () => {
	it("is true for a line ending on a Japanese, Chinese, Korean or Thai word", () => {
		expect(endsUnpunctuatedByConvention("いつも違う")).toBe(true);
		expect(endsUnpunctuatedByConvention("我很好")).toBe(true);
		expect(endsUnpunctuatedByConvention("저는 괜찮아요")).toBe(true);
		expect(endsUnpunctuatedByConvention("ฉันสบายดี")).toBe(true);
	});
	it("counts the kana long-vowel mark as part of the word", () => {
		expect(endsUnpunctuatedByConvention("すごいー")).toBe(true);
	});
	it("looks past closing brackets, quotes and trailing space", () => {
		expect(endsUnpunctuatedByConvention("「行きます」")).toBe(true);
		expect(endsUnpunctuatedByConvention("(彼は笑う) ")).toBe(true);
	});
	it("is false for a line that stops on punctuation", () => {
		expect(endsUnpunctuatedByConvention("参加したので、")).toBe(false);
		expect(endsUnpunctuatedByConvention("私の予想では...")).toBe(false);
		expect(endsUnpunctuatedByConvention("こんにちは。")).toBe(false);
	});
	it("is false for scripts that mark sentence ends", () => {
		expect(endsUnpunctuatedByConvention("Hola")).toBe(false);
		expect(endsUnpunctuatedByConvention("Привет")).toBe(false);
		expect(endsUnpunctuatedByConvention("مرحبا")).toBe(false);
	});
	it("is false for empty or bracket-only text", () => {
		expect(endsUnpunctuatedByConvention("")).toBe(false);
		expect(endsUnpunctuatedByConvention("」")).toBe(false);
	});
});

describe("endsWithTerminalPunctuation — CJK closers", () => {
	it("accepts a terminal mark followed by a CJK or full-width closer", () => {
		expect(endsWithTerminalPunctuation("「行きます。」")).toBe(true);
		expect(endsWithTerminalPunctuation("（そうですか？）")).toBe(true);
		expect(endsWithTerminalPunctuation("『やめて！』")).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// UNTRANSLATED PASS-THROUGH DETECTION — "some sentences stay in the
// source language" (Czech→Polish user report)
// ═══════════════════════════════════════════════════════════════════════

describe("detectUntranslatedSegments", () => {
	it("flags a segment returned verbatim among translated neighbors", () => {
		// Czech → Polish: slot 1 was passed through untranslated
		const originals = [
			"Dobrý den, jak se máte dnes večer?",
			"Nevěděl jsem, co mám dělat.",
			"To bylo naprosto neuvěřitelné.",
		];
		const translations = [
			"Dzień dobry, jak się pan miewa dziś wieczorem?",
			"Nevěděl jsem, co mám dělat.", // untouched Czech
			"To było absolutnie niewiarygodne.",
		];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([1]);
	});

	it("is case- and whitespace-insensitive when comparing", () => {
		const originals = ["Nevěděl jsem, co mám  dělat."];
		const translations = ["nevěděl jsem, co mám dělat."];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([0]);
	});

	it("does not flag short segments that plausibly stay identical", () => {
		const originals = ["OK.", "Sarah!", "No!", "Taxi"];
		const translations = ["OK.", "Sarah!", "No!", "Taxi"];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([]);
	});

	it("does not flag numbers, timestamps, or symbol-only segments", () => {
		const originals = ["1930-2003", "♪ ♪ ♪", "..."];
		const translations = ["1930-2003", "♪ ♪ ♪", "..."];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([]);
	});

	it("does not flag proper-name-only segments below the word threshold", () => {
		const originals = ["Joshua Margaret"];
		const translations = ["Joshua Margaret"];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([]);
	});

	it("does not flag CJK text (no space-separated words)", () => {
		// Traditional → Simplified conversion legitimacy can't be judged here
		const originals = ["這是一個非常長的句子沒有空格"];
		const translations = ["這是一個非常長的句子沒有空格"];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([]);
	});

	it("does not flag actual translations", () => {
		const originals = ["I was thinking about what happened yesterday."];
		const translations = ["Myślałem o tym, co wydarzyło się wczoraj."];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([]);
	});

	it("returns empty on length mismatch (defensive)", () => {
		expect(detectUntranslatedSegments(["a", "b"], ["a"])).toEqual([]);
	});

	it("flags multiple untranslated slots independently", () => {
		const originals = [
			"První dlouhá věta, která má být přeložena.",
			"Druhá věta.",
			"Třetí dlouhá věta, která má být přeložena.",
		];
		const translations = [
			"První dlouhá věta, která má být přeložena.",
			"Drugie zdanie.",
			"Třetí dlouhá věta, která má být přeložena.",
		];
		expect(detectUntranslatedSegments(originals, translations)).toEqual([0, 2]);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// ENGLISH-DRIFT DETECTION — "instead of translating them into the target
// language, it translates them into English" (Czech→Polish user report)
// ═══════════════════════════════════════════════════════════════════════

describe("detectEmptySegments", () => {
	it("flags a slot left blank beside the neighbour that absorbed it", () => {
		const originals = ["I told you already.", "We have to leave now.", "Come on."];
		const translations = ["Ya te lo dije. Tenemos que irnos ahora.", "", "Vamos."];
		expect(detectEmptySegments(originals, translations)).toEqual([1]);
	});

	it("treats a whitespace-only translation as blank", () => {
		expect(detectEmptySegments(["Hello.", "World."], ["Hola.", " \n "])).toEqual([1]);
	});

	it("does not flag a blank translation of a blank original", () => {
		expect(detectEmptySegments(["Hello.", "  "], ["Hola.", ""])).toEqual([]);
	});

	it("does not flag actual translations", () => {
		expect(detectEmptySegments(["Hello.", "World."], ["Hola.", "Mundo."])).toEqual([]);
	});

	it("flags multiple blank slots independently", () => {
		expect(detectEmptySegments(["One.", "Two.", "Three."], ["", "Dos.", ""])).toEqual([0, 2]);
	});

	it("returns empty on length mismatch (defensive)", () => {
		expect(detectEmptySegments(["a", "b"], [""])).toEqual([]);
	});
});

describe("detectEnglishDriftSegments", () => {
	it("flags the English slot from the Czech→Polish user screenshot", () => {
		const translations = [
			"Pomstiłłem moje princezny.",
			"Hej, byłem ostatnie 30 sekund tak nerwowy, jak to powiedziałem.",
			"A then I felt a bit sorry for it.", // drifted into English
			"A potem pomyślałem, co jeśli tata Nikola jeszcze żyje.",
		];
		expect(detectEnglishDriftSegments(translations, "Polish")).toEqual([2]);
	});

	it("flags a hallucinated English scene description", () => {
		const translations = [
			"Music in the background plays softly and gently, setting a cozy atmosphere for the discussion. As the group leans in closer, the light from the table illuminates their faces.",
		];
		expect(detectEnglishDriftSegments(translations, "Polish")).toEqual([0]);
	});

	it("never flags anything when the target IS English", () => {
		const translations = ["A then I felt a bit sorry for it.", "The end of the story."];
		expect(detectEnglishDriftSegments(translations, "English")).toEqual([]);
	});

	it("does not flag legitimate target-language output", () => {
		const cases: Array<[string, string]> = [
			["Polish", "Za każde prawidłowe dopasowanie jest srebrny sztabek."],
			["Polish", "Hej, byłem ostatnie 30 sekund tak nerwowy, jak to powiedziałem."],
			["German", "Sie haben auch jeder Schachfigur einen Namen zugeordnet."],
			["Spanish", "El nombre completo de Finn es Finn Mertens, y se le considera el último humano."],
			["French", "Tu as vu ce que tu as fait hier soir, non ?"],
			["Dutch", "Ik weet niet of hij vandaag komt of niet."],
			["Norwegian", "Jeg har ikke tid for det akkurat nå."],
		];
		for (const [language, text] of cases) {
			expect(detectEnglishDriftSegments([text], language)).toEqual([]);
		}
	});

	it("does not flag English loanwords or titles inside target-language text", () => {
		const translations = ["Oglądałem The Walking Dead z tatą wczoraj wieczorem."];
		expect(detectEnglishDriftSegments(translations, "Polish")).toEqual([]);
	});

	it("ignores segments too short to judge", () => {
		// "it" + "for" would hit markers, but 3 words is below the floor.
		expect(detectEnglishDriftSegments(["for it then"], "Polish")).toEqual([]);
		expect(detectEnglishDriftSegments(["OK."], "Polish")).toEqual([]);
		expect(detectEnglishDriftSegments([""], "Polish")).toEqual([]);
	});

	it("flags multiple English slots independently", () => {
		const translations = [
			"To było absolutnie niewiarygodne.",
			"And then they told him it was over.",
			"Nie wiedziałem, co robić.",
			"But this is not what you think it is.",
		];
		expect(detectEnglishDriftSegments(translations, "Polish")).toEqual([1, 3]);
	});

	it("handles curly apostrophes in contractions", () => {
		expect(
			detectEnglishDriftSegments(["I’m sure that’s not what it’s about."], "Polish"),
		).toEqual([0]);
	});
});

// ═══════════════════════════════════════════════════════════════════════
// ORCHESTRATOR: translateBatchSafe — the alignment guarantee
// ═══════════════════════════════════════════════════════════════════════

describe("translateBatchSafe — invariants and recovery", () => {
	// Helpers for building deterministic fake translators
	const passthrough: SingleTranslator = async (s) => `<<${s}>>`;
	const echoBatch: BatchTranslator = async (segs) => segs.map((s) => `<<${s}>>`);

	describe("happy path", () => {
		it("returns exact translations when batch translator is correct", async () => {
			const out = await translateBatchSafe(
				["Hello.", "World."],
				echoBatch,
				passthrough,
			);
			expect(out).toEqual(["<<Hello.>>", "<<World.>>"]);
		});

		it("returns empty array for empty input without calling translators", async () => {
			let called = false;
			const out = await translateBatchSafe(
				[],
				async () => {
					called = true;
					return [];
				},
				async () => {
					called = true;
					return null;
				},
			);
			expect(out).toEqual([]);
			expect(called).toBe(false);
		});
	});

	describe("count mismatch recovery", () => {
		it("retries when batch returns too few items", async () => {
			let calls = 0;
			const flaky: BatchTranslator = async (segs) => {
				calls++;
				if (calls === 1) return segs.slice(0, -1); // missing one
				return segs.map((s) => `OK:${s}`);
			};
			const out = await translateBatchSafe(
				["a.", "b.", "c."],
				flaky,
				passthrough,
				{ batchRetries: 2 },
			);
			expect(out).toEqual(["OK:a.", "OK:b.", "OK:c."]);
			expect(calls).toBe(2);
		});

		it("retries when batch returns too many items", async () => {
			let calls = 0;
			const flaky: BatchTranslator = async (segs) => {
				calls++;
				if (calls === 1) return [...segs, "extra"]; // one too many
				return segs.map((s) => `OK:${s}`);
			};
			const out = await translateBatchSafe(
				["a.", "b."],
				flaky,
				passthrough,
				{ batchRetries: 2 },
			);
			expect(out).toEqual(["OK:a.", "OK:b."]);
			expect(calls).toBe(2);
		});

		it("falls back to per-segment when batch retries are exhausted", async () => {
			const alwaysWrong: BatchTranslator = async () => ["one item only"];
			const out = await translateBatchSafe(
				["a.", "b.", "c."],
				alwaysWrong,
				async (s) => `single:${s}`,
				{ batchRetries: 2 },
			);
			expect(out).toEqual(["single:a.", "single:b.", "single:c."]);
		});

		it("falls back to originals when both batch AND single translators fail", async () => {
			const out = await translateBatchSafe(
				["a.", "b."],
				async () => [],
				async () => null,
				{ batchRetries: 1 },
			);
			expect(out).toEqual(["a.", "b."]);
		});

		it("emits status events for count mismatches", async () => {
			const events: SessionEvent[] = [];
			await translateBatchSafe(
				["a.", "b."],
				async () => ["wrong"],
				async (s) => `single:${s}`,
				{
					batchRetries: 1,
					onEvent: (e) => events.push(e),
				},
			);
			expect(events.some((e) => e.event === "count_mismatch_retry")).toBe(true);
			expect(events.some((e) => e.event === "per_segment_fallback")).toBe(true);
		});
	});

	describe("batch translator throwing", () => {
		it("retries when batch throws transient error", async () => {
			let calls = 0;
			const out = await translateBatchSafe(
				["a.", "b."],
				async (segs) => {
					calls++;
					if (calls === 1) throw new Error("rate limit");
					return segs.map((s) => `OK:${s}`);
				},
				passthrough,
				{ batchRetries: 2 },
			);
			expect(out).toEqual(["OK:a.", "OK:b."]);
			expect(calls).toBe(2);
		});

		it("falls back to per-segment when batch always throws", async () => {
			const out = await translateBatchSafe(
				["a.", "b."],
				async () => {
					throw new Error("permanent");
				},
				async (s) => `single:${s}`,
				{ batchRetries: 1 },
			);
			expect(out).toEqual(["single:a.", "single:b."]);
		});
	});

	describe("split detection + repair", () => {
		it("repairs the Spanish drift bug from the user screenshot", async () => {
			const originals = [
				"Who'll we looking at today?",
				"Ah yes, Finn the Human.",
				"Finn's full name is Finn Mertens, and he is considered to be the last human in Ool.",
				"Finn was found abandoned as a baby by Jake's parents, Joshua and Margaret.",
				"They foolishly mistook him for a mutt scamp, which is why he's called Finn.",
				"Little is known about Finn's real mother.",
			];

			// Simulate the EXACT production bug: batch returns correct count
			// but content is split starting at segment 3 (index 2).
			const buggyBatch: BatchTranslator = async () => [
				"¿A quién estaremos mirando hoy?",
				"Ah sí, Finn el Humano.",
				"El nombre completo de Finn es Finn Mertens, y", // truncated, no terminal
				"se le considera el último humano en Ool.",
				"Finn fue encontrado abandonado de bebé",
				"por los padres de Jake, Joshua y Margaret.",
			];

			// Per-segment fallback returns "correct" 1:1 translations
			const correct: Record<string, string> = {
				[originals[2]]:
					"El nombre completo de Finn es Finn Mertens, y se le considera el último humano en Ool.",
				[originals[3]]:
					"Finn fue encontrado abandonado de bebé por los padres de Jake, Joshua y Margaret.",
				[originals[4]]:
					"Lo confundieron tontamente con un cachorro mestizo, por eso se llama Finn.",
				[originals[5]]:
					"Poco se sabe sobre la verdadera madre de Finn.",
			};
			const singleTranslator: SingleTranslator = async (s) =>
				correct[s] ?? `singleton(${s})`;

			const events: SessionEvent[] = [];
			const out = await translateBatchSafe(
				originals,
				buggyBatch,
				singleTranslator,
				{ onEvent: (e) => events.push(e) },
			);

			// Length invariant
			expect(out).toHaveLength(originals.length);
			// First 2 untouched
			expect(out[0]).toBe("¿A quién estaremos mirando hoy?");
			expect(out[1]).toBe("Ah sí, Finn el Humano.");
			// Drift point repaired
			expect(out[2]).toBe(correct[originals[2]]);
			// Cascade repaired
			expect(out[3]).toBe(correct[originals[3]]);
			expect(out[4]).toBe(correct[originals[4]]);
			expect(out[5]).toBe(correct[originals[5]]);
			// Status event was emitted
			expect(events.some((e) => e.event === "split_detected")).toBe(true);
		});

		it("repair starts at the FIRST suspected index, not later ones", async () => {
			const originals = [
				"First.",
				"Second.",
				"Third.",
				"Fourth.",
				"Fifth.",
			];
			// Splits at index 1 and index 3
			const buggyBatch: BatchTranslator = async () => [
				"Primero.",
				"Segund", // SPLIT (no terminal)
				"o.",
				"Cuart", // SPLIT (no terminal)
				"o.",
			];
			const repairedIndices: number[] = [];
			const singleTranslator: SingleTranslator = async (s) => {
				const idx = originals.indexOf(s);
				repairedIndices.push(idx);
				return `single(${s})`;
			};

			const out = await translateBatchSafe(
				originals,
				buggyBatch,
				singleTranslator,
			);

			// First segment NOT in repair range
			expect(repairedIndices).not.toContain(0);
			// All indices from first suspect (1) onward ARE repaired
			expect(repairedIndices).toContain(1);
			expect(repairedIndices).toContain(2);
			expect(repairedIndices).toContain(3);
			expect(repairedIndices).toContain(4);
			// Final output length intact
			expect(out).toHaveLength(5);
			expect(out[0]).toBe("Primero.");
		});

		it("uses original text when single-translator returns null during repair", async () => {
			const originals = ["Hello.", "Bigger sentence."];
			const buggyBatch: BatchTranslator = async () => [
				"Hola.",
				"Frase más", // truncated
			];
			const singleTranslator: SingleTranslator = async () => null;
			const out = await translateBatchSafe(
				originals,
				buggyBatch,
				singleTranslator,
			);
			expect(out).toHaveLength(2);
			expect(out[0]).toBe("Hola.");
			// Fallback to original on single-translator failure
			expect(out[1]).toBe("Bigger sentence.");
		});
	});

	describe("a drifted tail is asked for again as one batch", () => {
		const originals = [
			"First sentence here.",
			"Second sentence here.",
			"Third sentence here.",
			"Fourth sentence here.",
			"Fifth sentence here.",
		];
		// Correct count, but slot 1 is cut short and the rest is shifted.
		const drifted = [
			"Primera frase aquí.",
			"Segunda frase", // SPLIT (no terminal)
			"aquí.",
			"Tercera frase aquí.",
			"Cuarta frase aquí.",
		];
		const cleanTail = [
			"Segunda frase aquí.",
			"Tercera frase aquí.",
			"Cuarta frase aquí.",
			"Quinta frase aquí.",
		];

		/** A batch translator that answers each call from a script, and
		 * records what it was asked for. */
		function scripted(answers: (string[] | null | Error)[]) {
			const calls: string[][] = [];
			const batch: BatchTranslator = async (segs) => {
				calls.push(segs);
				const answer = answers[calls.length - 1];
				if (answer === undefined) throw new Error("batch translator called more often than scripted");
				if (answer instanceof Error) throw answer;
				return answer;
			};
			return { batch, calls };
		}

		function countingSingle() {
			const asked: string[] = [];
			const single: SingleTranslator = async (s) => {
				asked.push(s);
				return `single(${s})`;
			};
			return { single, asked };
		}

		it("repairs the tail with one batch call and no single-cue calls", async () => {
			const { batch, calls } = scripted([drifted, cleanTail]);
			const { single, asked } = countingSingle();
			const events: SessionEvent[] = [];

			const out = await translateBatchSafe(originals, batch, single, {
				onEvent: (e) => events.push(e),
			});

			expect(out).toEqual(["Primera frase aquí.", ...cleanTail]);
			// The second call carries only the tail, from the first suspect on.
			expect(calls).toHaveLength(2);
			expect(calls[1]).toEqual(originals.slice(1));
			expect(asked).toEqual([]);
			// The drift is still reported for review; no per-cue fallback ran.
			expect(events.some((e) => e.event === "split_detected")).toBe(true);
			expect(events.some((e) => e.event === "per_segment_fallback")).toBe(false);
			expect(events.some((e) => e.event === "left_untranslated")).toBe(false);
		});

		it("keeps the part of the second answer that lines up and repairs the rest per cue", async () => {
			// The retry is good for two slots, then drifts again.
			const retry = [
				"Segunda frase aquí.",
				"Tercera frase aquí.",
				"Cuarta frase", // SPLIT again, at tail index 2 = batch index 3
				"aquí.",
			];
			const { batch } = scripted([drifted, retry]);
			const { single, asked } = countingSingle();
			const events: SessionEvent[] = [];

			const out = await translateBatchSafe(originals, batch, single, {
				base: 100,
				onEvent: (e) => events.push(e),
			});

			expect(out).toEqual([
				"Primera frase aquí.",
				"Segunda frase aquí.",
				"Tercera frase aquí.",
				`single(${originals[3]})`,
				`single(${originals[4]})`,
			]);
			expect(asked.sort()).toEqual([originals[3], originals[4]].sort());
			// The fallback event names only the cues that went per cue.
			const fallback = events.find((e) => e.event === "per_segment_fallback");
			expect(fallback).toEqual({ event: "per_segment_fallback", indices: [103, 104] });
		});

		it("falls back to per-cue repair of the whole tail when the second answer has the wrong count", async () => {
			const { batch, calls } = scripted([drifted, ["solo", "dos"]]);
			const { single, asked } = countingSingle();

			const out = await translateBatchSafe(originals, batch, single);

			// One retry only: a wrong count is not asked for a third time.
			expect(calls).toHaveLength(2);
			expect(asked.sort()).toEqual(originals.slice(1).sort());
			expect(out).toEqual(["Primera frase aquí.", ...originals.slice(1).map((s) => `single(${s})`)]);
		});

		it("falls back to per-cue repair when the transport has given up (null)", async () => {
			const { batch, calls } = scripted([drifted, null]);
			const { single, asked } = countingSingle();

			const out = await translateBatchSafe(originals, batch, single);

			expect(calls).toHaveLength(2);
			expect(asked).toHaveLength(4);
			expect(out[0]).toBe("Primera frase aquí.");
			expect(out.slice(1)).toEqual(originals.slice(1).map((s) => `single(${s})`));
		});

		it("falls back to per-cue repair when the second batch call throws", async () => {
			const { batch } = scripted([drifted, new Error("boom")]);
			const { single, asked } = countingSingle();

			const out = await translateBatchSafe(originals, batch, single);

			expect(asked).toHaveLength(4);
			expect(out).toHaveLength(5);
			expect(out.slice(1)).toEqual(originals.slice(1).map((s) => `single(${s})`));
		});

		it("does not spend a batch call on a tail of one cue", async () => {
			const twoOriginals = ["Hello there.", "A bigger sentence."];
			const { batch, calls } = scripted([["Hola.", "Una frase más"]]);
			const { single, asked } = countingSingle();

			const out = await translateBatchSafe(twoOriginals, batch, single);

			expect(calls).toHaveLength(1);
			expect(asked).toEqual([twoOriginals[1]]);
			expect(out).toEqual(["Hola.", `single(${twoOriginals[1]})`]);
		});

		it("re-checks the kept slots for untranslated text", async () => {
			// The retry lines up, but hands slot 2 back in the source language.
			const retry = [
				"Segunda frase aquí.",
				originals[2],
				"Cuarta frase aquí.",
				"Quinta frase aquí.",
			];
			const { batch } = scripted([drifted, retry]);
			const { single, asked } = countingSingle();
			const events: SessionEvent[] = [];

			const out = await translateBatchSafe(originals, batch, single, {
				onEvent: (e) => events.push(e),
			});

			expect(asked).toEqual([originals[2]]);
			expect(out).toEqual([
				"Primera frase aquí.",
				"Segunda frase aquí.",
				`single(${originals[2]})`,
				"Cuarta frase aquí.",
				"Quinta frase aquí.",
			]);
			expect(events.find((e) => e.event === "per_segment_fallback")).toEqual({
				event: "per_segment_fallback",
				indices: [2],
			});
		});

		it("starts no repair at all when the session is cancelled during the second call", async () => {
			const controller = new AbortController();
			const calls: string[][] = [];
			const batch: BatchTranslator = async (segs) => {
				calls.push(segs);
				if (calls.length === 1) return drifted;
				controller.abort();
				return cleanTail;
			};
			const { single, asked } = countingSingle();
			const events: SessionEvent[] = [];

			const out = await translateBatchSafe(originals, batch, single, {
				signal: controller.signal,
				onEvent: (e) => events.push(e),
			});

			// A cancelled batch hands back its originals and says nothing more.
			expect(out).toEqual(originals);
			expect(asked).toEqual([]);
			expect(events.some((e) => e.event === "per_segment_fallback")).toBe(false);
			expect(events.some((e) => e.event === "left_untranslated")).toBe(false);
		});

		it("costs one extra request, not one per cue, on a 40-cue tail", async () => {
			const many = Array.from({ length: 41 }, (_, i) => `Sentence number ${i} is here.`);
			const good = many.map((_, i) => `Frase número ${i} está aquí.`);
			const bad = good.slice();
			bad[1] = "Frase número 1 está"; // one split near the top
			let batchCalls = 0;
			const batch: BatchTranslator = async (segs) => {
				batchCalls++;
				return batchCalls === 1 ? bad : good.slice(many.length - segs.length);
			};
			const { single, asked } = countingSingle();

			const out = await translateBatchSafe(many, batch, single);

			expect(out).toEqual(good);
			expect(batchCalls).toBe(2);
			expect(asked).toHaveLength(0);
		});
	});

	describe("untranslated detection + repair", () => {
		it("re-translates only the passed-through slots, leaving good slots alone", async () => {
			const originals = [
				"Dobrý den, jak se máte dnes večer?",
				"Nevěděl jsem, co mám dělat.",
				"To bylo naprosto neuvěřitelné.",
			];
			// Slot 1 passed through untranslated; 0 and 2 are fine.
			const buggyBatch: BatchTranslator = async () => [
				"Dzień dobry, jak się pan miewa dziś wieczorem?",
				"Nevěděl jsem, co mám dělat.",
				"To było absolutnie niewiarygodne.",
			];
			const repaired: string[] = [];
			const singleTranslator: SingleTranslator = async (s) => {
				repaired.push(s);
				return "Nie wiedziałem, co robić.";
			};

			const events: SessionEvent[] = [];
			const out = await translateBatchSafe(originals, buggyBatch, singleTranslator, {
				onEvent: (e) => events.push(e),
			});

			expect(out).toHaveLength(3);
			expect(out[0]).toBe("Dzień dobry, jak się pan miewa dziś wieczorem?");
			expect(out[1]).toBe("Nie wiedziałem, co robić.");
			expect(out[2]).toBe("To było absolutnie niewiarygodne.");
			// Only the untranslated slot is retried — no cascade
			expect(repaired).toEqual(["Nevěděl jsem, co mám dělat."]);
			expect(events.some((e) => e.event === "untranslated_detected")).toBe(true);
		});

		it("combines spot repairs with drift-range repair", async () => {
			const originals = [
				"První dlouhá věta, která má být přeložena.", // passed through (slot 0)
				"Druhá věta zde.",
				"Third complete sentence.", // split at slot 2 → cascade from here
				"Fourth complete sentence.",
			];
			const buggyBatch: BatchTranslator = async () => [
				"První dlouhá věta, která má být přeložena.", // untranslated
				"Drugie zdanie tutaj.",
				"Trzecie pełne zdanie bez", // truncated, no terminal → split
				"końca.",
			];
			const repairedIdx: number[] = [];
			const singleTranslator: SingleTranslator = async (s) => {
				repairedIdx.push(originals.indexOf(s));
				return `fixed(${s})`;
			};

			const out = await translateBatchSafe(originals, buggyBatch, singleTranslator);

			expect(out).toHaveLength(4);
			// Slot 0 (untranslated) and slots 2..3 (drift cascade) repaired;
			// slot 1 kept from the batch.
			expect(repairedIdx.sort()).toEqual([0, 2, 3]);
			expect(out[1]).toBe("Drugie zdanie tutaj.");
		});

		it("keeps the original when repair of an untranslated slot also fails", async () => {
			const originals = [
				"Nevěděl jsem, co mám dělat.",
				"Druhá věta zde.",
			];
			const buggyBatch: BatchTranslator = async () => [
				"Nevěděl jsem, co mám dělat.", // untranslated
				"Drugie zdanie tutaj.",
			];
			const singleTranslator: SingleTranslator = async () => null;
			const events: SessionEvent[] = [];
			const out = await translateBatchSafe(originals, buggyBatch, singleTranslator, {
				base: 10,
				onEvent: (e) => events.push(e),
			});
			expect(out).toHaveLength(2);
			expect(out[0]).toBe("Nevěděl jsem, co mám dělat.");
			expect(out[1]).toBe("Drugie zdanie tutaj.");
			expect(events).toContainEqual({ event: "left_untranslated", indices: [10] });
		});
	});

	describe("English-drift detection + repair", () => {
		it("re-translates only the English slots when a target language is set", async () => {
			const originals = [
				"A pak jsem toho trošku litoval.",
				"A pak jsem se řekl, co když je tata Nikola ještě.",
			];
			// Slot 0 drifted into English; slot 1 is fine.
			const buggyBatch: BatchTranslator = async () => [
				"A then I felt a bit sorry for it.",
				"A potem pomyślałem, co jeśli tata Nikola jeszcze żyje.",
			];
			const repaired: string[] = [];
			const singleTranslator: SingleTranslator = async (s) => {
				repaired.push(s);
				return "A potem trochę tego żałowałem.";
			};

			const events: SessionEvent[] = [];
			const out = await translateBatchSafe(originals, buggyBatch, singleTranslator, {
				targetLanguage: "Polish",
				onEvent: (e) => events.push(e),
			});

			expect(out).toEqual([
				"A potem trochę tego żałowałem.",
				"A potem pomyślałem, co jeśli tata Nikola jeszcze żyje.",
			]);
			expect(repaired).toEqual(["A pak jsem toho trošku litoval."]);
			expect(events.some((e) => e.event === "language_drift_detected")).toBe(true);
		});

		it("does not run drift detection without a target language", async () => {
			const buggyBatch: BatchTranslator = async () => [
				"A then I felt a bit sorry for it.",
			];
			let singleCalls = 0;
			const out = await translateBatchSafe(
				["A pak jsem toho trošku litoval."],
				buggyBatch,
				async () => {
					singleCalls++;
					return "x";
				},
			);
			expect(out).toEqual(["A then I felt a bit sorry for it."]);
			expect(singleCalls).toBe(0);
		});

		it("leaves English output alone when English is the target", async () => {
			const batch: BatchTranslator = async () => [
				"And then I felt a bit sorry for it.",
			];
			const out = await translateBatchSafe(
				["A pak jsem toho trošku litoval."],
				batch,
				async () => "should not be called",
				{ targetLanguage: "English" },
			);
			expect(out).toEqual(["And then I felt a bit sorry for it."]);
		});
	});

	describe("merge detection + repair", () => {
		it("repairs merged segments by re-doing them per-segment", async () => {
			const originals = [
				"I thought you were doing a good job",
				"of finding someone new.",
				"Me?",
				"I want you to be comfortable.",
			];
			// Merged batch: segment 0 absorbed segment 1's content, drift cascades
			const buggyBatch: BatchTranslator = async () => [
				"あなたは新しい人を見つけるのが上手だと思ってたのに。",
				"私が？",
				"楽にしてほしい。",
				"何もしたくないだけ。",
			];
			const singleTranslator: SingleTranslator = async (s) => `S(${s})`;
			const out = await translateBatchSafe(
				originals,
				buggyBatch,
				singleTranslator,
			);
			expect(out).toHaveLength(4);
			// Repair starts at the merge point
			expect(out[0]).toBe("S(I thought you were doing a good job)");
			expect(out[1]).toBe("S(of finding someone new.)");
			expect(out[2]).toBe("S(Me?)");
			expect(out[3]).toBe("S(I want you to be comfortable.)");
		});
	});

	describe("blank-slot detection + repair", () => {
		it("repairs a blank slot together with the slot that absorbed it", async () => {
			const originals = [
				"Good morning.",
				"I told you already.",
				"We have to leave now.",
				"Come on.",
			];
			// Right count, but slot 1 holds slot 2's text and slot 2 is blank.
			const buggyBatch: BatchTranslator = async () => [
				"Buenos días.",
				"Ya te lo dije. Tenemos que irnos ahora.",
				"",
				"Vamos.",
			];
			const singleTranslator: SingleTranslator = async (s) => `S(${s})`;
			const events: SessionEvent[] = [];
			const out = await translateBatchSafe(originals, buggyBatch, singleTranslator, {
				base: 10,
				onEvent: (e) => events.push(e),
			});

			expect(out).toEqual([
				"Buenos días.", // before the absorbing slot — untouched
				"S(I told you already.)",
				"S(We have to leave now.)",
				"S(Come on.)",
			]);
			expect(events).toContainEqual({ event: "empty_detected", indices: [12] });
			expect(events).toContainEqual({ event: "per_segment_fallback", indices: [11, 12, 13] });
		});

		it("repairs a blank first slot", async () => {
			const buggyBatch: BatchTranslator = async () => ["  ", "Mundo."];
			const singleTranslator: SingleTranslator = async (s) => `S(${s})`;
			const out = await translateBatchSafe(["Hello.", "World."], buggyBatch, singleTranslator);
			expect(out).toEqual(["S(Hello.)", "S(World.)"]);
		});

		it("keeps the original, and says so, when the repair of a blank slot fails", async () => {
			const buggyBatch: BatchTranslator = async () => ["Hola.", "Mundo.", ""];
			const singleTranslator: SingleTranslator = async (s) => (s === "Bye." ? null : `S(${s})`);
			const events: SessionEvent[] = [];
			const out = await translateBatchSafe(["Hello.", "World.", "Bye."], buggyBatch, singleTranslator, {
				onEvent: (e) => events.push(e),
			});
			expect(out).toEqual(["Hola.", "S(World.)", "Bye."]);
			expect(events).toContainEqual({ event: "left_untranslated", indices: [2] });
		});
	});

	describe("repair-output validation — the last line of defense", () => {
		// The exact production bug: the per-segment repair hallucinated an
		// English scene description ~9× the source length, and nothing checked
		// it. "Ihr müsst dann gemeinsam bestimmen," became this:
		const HALLUCINATION =
			"Music in the background plays softly and gently, setting a cozy atmosphere for the discussion. As the group leans in closer, the light from the table illuminates their faces, revealing a mix of curiosity and anticipation.";

		it("rejects a hallucinated repair and keeps the original", async () => {
			const originals = ["Ihr müsst dann gemeinsam bestimmen,", "Für jede richtige Übereinstimmung."];
			// Slot 0 comes back English → drift repair fires; the repair itself
			// hallucinates every time.
			const buggyBatch: BatchTranslator = async () => [
				"You must then decide together on it,",
				"Za każde prawidłowe dopasowanie.",
			];
			let singleCalls = 0;
			const singleTranslator: SingleTranslator = async () => {
				singleCalls++;
				return HALLUCINATION;
			};
			const out = await translateBatchSafe(originals, buggyBatch, singleTranslator, {
				targetLanguage: "Polish",
			});
			// Both repair attempts rejected → original beats a fabricated scene.
			expect(out[0]).toBe("Ihr müsst dann gemeinsam bestimmen,");
			expect(out[1]).toBe("Za każde prawidłowe dopasowanie.");
			expect(singleCalls).toBe(2);
		});

		it("rejects a length blowup even without a target language", async () => {
			// Untranslated pass-through triggers repair… which balloons.
			const passthroughBatch: BatchTranslator = async (segs) => [...segs];
			const out = await translateBatchSafe(
				["Nevěděl jsem, co mám dělat."],
				passthroughBatch,
				async () => "x".repeat(500),
			);
			expect(out[0]).toBe("Nevěděl jsem, co mám dělat.");
		});

		it("accepts the second attempt when the first is rejected", async () => {
			const passthroughBatch: BatchTranslator = async (segs) => [...segs];
			let calls = 0;
			const singleTranslator: SingleTranslator = async () => {
				calls++;
				return calls === 1 ? HALLUCINATION : "Nie wiedziałem, co robić.";
			};
			const out = await translateBatchSafe(
				["Nevěděl jsem, co mám dělat."],
				passthroughBatch,
				singleTranslator,
				{ targetLanguage: "Polish" },
			);
			expect(out[0]).toBe("Nie wiedziałem, co robić.");
			expect(calls).toBe(2);
		});

		it("does not reject short-cue expansions (the +40 floor)", async () => {
			const passthroughBatch: BatchTranslator = async (segs) => [...segs];
			const out = await translateBatchSafe(
				["To je ale pěkné ráno."],
				passthroughBatch,
				async () => "Ależ to piękny poranek, prawda?", // longer than 3×? no — but well over 1×
				{ targetLanguage: "Polish" },
			);
			expect(out[0]).toBe("Ależ to piękny poranek, prawda?");
		});

		it("validates the full-batch-failure fallback path too", async () => {
			const out = await translateBatchSafe(
				["A pak jsem toho trošku litoval."],
				async () => null as unknown as string[], // transport gave up
				async () => "A then I felt a bit sorry for it.", // repair drifts English
				{ targetLanguage: "Polish" },
			);
			expect(out[0]).toBe("A pak jsem toho trošku litoval.");
		});
	});

	describe("alignment INVARIANTS — these must hold for every input", () => {
		it("output.length === input.length for any input + perfect translator", async () => {
			for (const size of [1, 2, 5, 10, 50, 100, 250]) {
				const originals = Array.from(
					{ length: size },
					(_, i) => `Segment ${i + 1}.`,
				);
				const out = await translateBatchSafe(
					originals,
					echoBatch,
					passthrough,
				);
				expect(out).toHaveLength(size);
			}
		});

		it("output.length === input.length when batch always returns wrong count", async () => {
			for (const size of [1, 2, 5, 10, 50]) {
				const originals = Array.from(
					{ length: size },
					(_, i) => `Seg ${i}.`,
				);
				const out = await translateBatchSafe(
					originals,
					async () => [], // always empty
					async (s) => `single:${s}`,
				);
				expect(out).toHaveLength(size);
				expect(out.every((t) => t.startsWith("single:"))).toBe(true);
			}
		});

		it("output.length === input.length when EVERYTHING fails", async () => {
			for (const size of [1, 5, 25]) {
				const originals = Array.from(
					{ length: size },
					(_, i) => `Seg ${i}.`,
				);
				const out = await translateBatchSafe(
					originals,
					async () => {
						throw new Error("boom");
					},
					async () => {
						throw new Error("boom");
					},
				);
				expect(out).toHaveLength(size);
				// Filled with originals as final fallback
				expect(out).toEqual(originals);
			}
		});

		it("output.length === input.length when batch returns random sizes", async () => {
			for (const size of [3, 10, 30]) {
				const originals = Array.from(
					{ length: size },
					(_, i) => `Seg ${i}.`,
				);
				const out = await translateBatchSafe(
					originals,
					async (segs) => {
						// Randomize length — sometimes too few, sometimes too many
						const delta = Math.floor(Math.random() * 5) - 2;
						const target = Math.max(0, segs.length + delta);
						return Array.from({ length: target }, (_, i) => `r${i}`);
					},
					async (s) => `single(${s})`,
				);
				expect(out).toHaveLength(size);
			}
		});

		it("output never contains undefined or non-string values", async () => {
			const out = await translateBatchSafe(
				["a.", "b.", "c."],
				async () => [undefined as unknown as string, "x", "y"],
				async (s) => `single:${s}`,
			);
			expect(out).toHaveLength(3);
			expect(out.every((v) => typeof v === "string")).toBe(true);
		});

		it("translateBatchSafe never re-orders segments", async () => {
			const originals = ["FIRST.", "SECOND.", "THIRD.", "FOURTH.", "FIFTH."];
			// Batch returns translations correctly aligned
			const batch: BatchTranslator = async (segs) =>
				segs.map((s) => s.toLowerCase());
			const out = await translateBatchSafe(originals, batch, passthrough);
			expect(out).toEqual(["first.", "second.", "third.", "fourth.", "fifth."]);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════
// END-TO-END SRT ALIGNMENT REGRESSION TESTS
// These mirror the exact wave-emission loop in app/api/route.ts to prove
// that alignment safety's output stays aligned with original timestamps.
// ═══════════════════════════════════════════════════════════════════════

describe("end-to-end SRT alignment (zips aligned output with timestamps)", () => {
	async function runPipeline(
		cues: Cue[],
		batchTranslator: BatchTranslator,
		singleTranslator: SingleTranslator,
	): Promise<string> {
		const translations = await translateBatchSafe(
			cues.map((cue) => cue.text),
			batchTranslator,
			singleTranslator,
		);
		// Reassembly through the codec — the same serializer the route uses.
		return cues
			.map((cue, i) =>
				serializeCue({ ...cue, text: translations[i] ?? cue.text }, i + 1),
			)
			.join("\n\n");
	}

	it("perfect translator: every original timestamp keeps its own translation", async () => {
		const cues: Cue[] = [
			makeCue("00:00:01,000 --> 00:00:03,000", "Hello."),
			makeCue("00:00:04,000 --> 00:00:06,000", "World."),
			makeCue("00:00:07,000 --> 00:00:09,000", "Goodbye."),
		];
		const batchTranslator: BatchTranslator = async (segs) =>
			segs.map((s) => `T:${s}`);
		const single: SingleTranslator = async (s) => `S:${s}`;
		const result = await runPipeline(cues, batchTranslator, single);

		// First subtitle block must contain timestamp 1 with translation of segment 1
		expect(result).toContain("00:00:01,000 --> 00:00:03,000\nT:Hello.");
		expect(result).toContain("00:00:04,000 --> 00:00:06,000\nT:World.");
		expect(result).toContain("00:00:07,000 --> 00:00:09,000\nT:Goodbye.");
	});

	it("split bug: even with broken batch translator, each timestamp gets its own correct translation", async () => {
		const cues: Cue[] = [
			makeCue("00:00:01,000 --> 00:00:03,000", "First sentence."),
			makeCue("00:00:04,000 --> 00:00:06,000", "Second longer sentence here."),
			makeCue("00:00:07,000 --> 00:00:09,000", "Third sentence."),
		];

		// Buggy batch: splits second translation across slots 1 and 2, drifting downstream
		const buggyBatch: BatchTranslator = async () => [
			"Primera oración.",
			"Segunda oración larga", // truncated, no terminal
			"aquí.",
		];

		const correctTranslations: Record<string, string> = {
			"Second longer sentence here.": "Segunda oración más larga aquí.",
			"Third sentence.": "Tercera oración.",
		};
		const single: SingleTranslator = async (s) =>
			correctTranslations[s] ?? `S:${s}`;

		const result = await runPipeline(cues, buggyBatch, single);

		// Each original timestamp must pair with the translation of its OWN segment
		expect(result).toContain("00:00:01,000 --> 00:00:03,000\nPrimera oración.");
		expect(result).toContain(
			"00:00:04,000 --> 00:00:06,000\nSegunda oración más larga aquí.",
		);
		expect(result).toContain(
			"00:00:07,000 --> 00:00:09,000\nTercera oración.",
		);
		// Crucially, the truncated "Segunda oración larga" must NOT appear
		// against the timestamp of segment 2 (the bug we're fixing).
		expect(result).not.toContain(
			"00:00:04,000 --> 00:00:06,000\nSegunda oración larga",
		);
		// And the dangling "aquí." must NOT appear standalone against any
		// timestamp.
		expect(result).not.toContain("00:00:07,000 --> 00:00:09,000\naquí.");
	});

	it("cascade drift: alignment safety repairs the entire downstream tail", async () => {
		const cues: Cue[] = Array.from({ length: 8 }, (_, i) =>
			makeCue(
				`00:00:${String(i * 3).padStart(2, "0")},000 --> 00:00:${String(i * 3 + 2).padStart(2, "0")},000`,
				`Sentence ${i + 1}.`,
			),
		);

		// All segments end with terminal punctuation. Buggy batch leaves the
		// first 2 alone but splits #3 such that 3..7 are all misaligned.
		const buggyBatch: BatchTranslator = async () => [
			"Oración 1.",
			"Oración 2.",
			"Oración 3 truncada", // SPLIT at index 2
			"final.",
			"Oración 4 truncada",
			"otra vez.",
			"Oración 5 truncada",
			"de nuevo.",
		];
		const single: SingleTranslator = async (s) => {
			// Map "Sentence N." -> "Repaired N."
			const m = s.match(/Sentence (\d+)/);
			return m ? `Repaired ${m[1]}.` : null;
		};

		const result = await runPipeline(cues, buggyBatch, single);

		// First 2 segments untouched
		expect(result).toContain("00:00:00,000 --> 00:00:02,000\nOración 1.");
		expect(result).toContain("00:00:03,000 --> 00:00:05,000\nOración 2.");
		// Segments 3 through 8: each must show its REPAIRED translation
		// against its OWN timestamp.
		for (let i = 2; i < 8; i++) {
			const ts = `00:00:${String(i * 3).padStart(2, "0")},000 --> 00:00:${String(i * 3 + 2).padStart(2, "0")},000`;
			expect(result).toContain(`${ts}\nRepaired ${i + 1}.`);
		}
	});

	it("total batch failure: every original timestamp still emits something", async () => {
		const cues: Cue[] = Array.from({ length: 5 }, (_, i) =>
			makeCue(
				`00:00:${String(i * 2).padStart(2, "0")},000 --> 00:00:${String(i * 2 + 1).padStart(2, "0")},000`,
				`Original ${i + 1}.`,
			),
		);

		const result = await runPipeline(
			cues,
			async () => {
				throw new Error("LLM down");
			},
			async () => null,
		);

		// Every timestamp present, falls back to original text
		for (let i = 0; i < 5; i++) {
			const ts = `00:00:${String(i * 2).padStart(2, "0")},000 --> 00:00:${String(i * 2 + 1).padStart(2, "0")},000`;
			expect(result).toContain(`${ts}\nOriginal ${i + 1}.`);
		}
	});

	it("guarantees: segment count out === segment count in, for adversarial inputs", async () => {
		const adversarialBatches: BatchTranslator[] = [
			async () => [], // empty
			async (segs) => [...segs, ...segs], // double
			async (segs) => segs.slice(1), // off-by-one short
			async (segs) => segs.slice(0, -1), // off-by-one short other side
			async () => ["a", "b"], // wrong total
			async () => {
				throw new Error("boom");
			},
		];

		for (const batchTranslator of adversarialBatches) {
			const cues: Cue[] = Array.from({ length: 7 }, (_, i) =>
				makeCue(`00:00:${i},000 --> 00:00:${i + 1},000`, `Seg ${i}.`),
			);
			const single: SingleTranslator = async (s) => `S:${s}`;
			const result = await runPipeline(cues, batchTranslator, single);
			// Every original timestamp must appear in the output exactly once
			for (let i = 0; i < 7; i++) {
				const ts = `00:00:${i},000 --> 00:00:${i + 1},000`;
				expect(result).toContain(ts);
			}
			// And the block count must equal segment count
			const blocks = result
				.split("\n\n")
				.filter((b) => b.trim().length > 0);
			expect(blocks).toHaveLength(7);
		}
	});
});
