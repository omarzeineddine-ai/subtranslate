import { describe, it, expect } from "vitest";
import {
	groupCuesByTokenBudget,
	runTranslationSession,
	type SessionEvent,
	type SessionOptions,
	type TranslatorAdapter,
} from "@/lib/translate-session";
import { LINEBREAK_SENTINEL } from "@/lib/prompts";
import type { Cue } from "@/types";

function makeCues(texts: string[]): Cue[] {
	return texts.map((text, i) => ({
		start: `00:00:${String(i).padStart(2, "0")},000`,
		end: `00:00:${String(i + 1).padStart(2, "0")},000`,
		text,
	}));
}

/** Word-count tokenizer: predictable batch sizing in tests. */
const countTokens = (text: string) => text.split(/\s+/).length;

function echoAdapter(overrides: Partial<TranslatorAdapter> = {}): TranslatorAdapter {
	return {
		countTokens,
		translateBatch: async (segments) => segments.map((s) => `T:${s}`),
		translateSingle: async (segment) => `S:${segment}`,
		...overrides,
	};
}

async function collect(
	cues: Cue[],
	adapter: TranslatorAdapter,
	options: SessionOptions = {},
): Promise<Cue[]> {
	const out: Cue[] = [];
	for await (const cue of runTranslationSession(cues, adapter, options)) {
		out.push(cue);
	}
	return out;
}

// Fast-retry options: no backoff waits in tests.
const FAST: SessionOptions = { baseDelayMs: 0 };

describe("groupCuesByTokenBudget", () => {
	it("packs cues under the budget into one group", () => {
		const cues = makeCues(["one two", "three four", "five"]);
		const groups = groupCuesByTokenBudget(cues, 100, countTokens);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toHaveLength(3);
	});

	it("starts a new group when the budget would overflow", () => {
		const cues = makeCues(["a a a", "b b b", "c c c"]);
		const groups = groupCuesByTokenBudget(cues, 7, countTokens);
		expect(groups.map((g) => g.length)).toEqual([2, 1]);
	});

	it("never produces an empty group when the first cue exceeds the budget", () => {
		const cues = makeCues(["w ".repeat(50).trim(), "small"]);
		const groups = groupCuesByTokenBudget(cues, 10, countTokens);
		expect(groups.every((g) => g.length > 0)).toBe(true);
		expect(groups.flat()).toHaveLength(2);
	});

	it("keeps cue order across groups", () => {
		const cues = makeCues(Array.from({ length: 20 }, (_, i) => `word${i}`));
		const groups = groupCuesByTokenBudget(cues, 3, countTokens);
		expect(groups.flat().map((c) => c.text)).toEqual(cues.map((c) => c.text));
	});
});

describe("runTranslationSession", () => {
	it("translates every cue, preserving order and timestamps", async () => {
		const cues = makeCues(["Hello.", "World.", "Goodbye."]);
		const out = await collect(cues, echoAdapter(), FAST);
		expect(out.map((c) => c.text)).toEqual(["T:Hello.", "T:World.", "T:Goodbye."]);
		expect(out.map((c) => c.start)).toEqual(cues.map((c) => c.start));
	});

	it("emits in original order even when later batches finish first", async () => {
		const delays = [30, 1, 15, 1];
		let call = 0;
		const adapter = echoAdapter({
			translateBatch: async (segments) => {
				const d = delays[call++ % delays.length];
				await new Promise((r) => setTimeout(r, d));
				return segments.map((s) => `T:${s}`);
			},
		});
		const cues = makeCues(Array.from({ length: 8 }, (_, i) => `Cue ${i}.`));
		// Budget of 2 tokens → one cue per batch → 8 batches racing.
		const out = await collect(cues, adapter, { ...FAST, maxTokensPerBatch: 2 });
		expect(out.map((c) => c.text)).toEqual(cues.map((c) => `T:${c.text}`));
	});

	it("respects the batch concurrency cap", async () => {
		let inFlight = 0;
		let peak = 0;
		const adapter = echoAdapter({
			translateBatch: async (segments) => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await new Promise((r) => setTimeout(r, 5));
				inFlight--;
				return segments.map((s) => `T:${s}`);
			},
		});
		const cues = makeCues(Array.from({ length: 10 }, (_, i) => `Cue ${i}.`));
		await collect(cues, adapter, { ...FAST, maxTokensPerBatch: 2, concurrency: 2 });
		expect(peak).toBeLessThanOrEqual(2);
	});

	it("retries retryable errors and reports them via events", async () => {
		let attempts = 0;
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async (segments) => {
				attempts++;
				if (attempts <= 2) throw new Error("429 Too Many Requests");
				return segments.map((s) => `T:${s}`);
			},
		});
		const out = await collect(makeCues(["Hello."]), adapter, {
			...FAST,
			onEvent: (e) => events.push(e),
		});
		expect(out[0].text).toBe("T:Hello.");
		expect(attempts).toBe(3);
		const retrying = events.filter((e) => e.event === "retrying");
		expect(retrying).toHaveLength(2);
		expect(retrying[0]).toMatchObject({ reason: "rate_limit", attempt: 1 });
		expect(events.some((e) => e.event === "retrying_done")).toBe(true);
	});

	it("retries a malformed model response as an error, not a rate limit", async () => {
		let attempts = 0;
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async (segments) => {
				if (attempts++ === 0) throw new Error("No object generated: response did not match schema.");
				return segments.map((s) => `T:${s}`);
			},
		});
		const out = await collect(makeCues(["Hello."]), adapter, {
			...FAST,
			onEvent: (e) => events.push(e),
		});
		expect(out[0].text).toBe("T:Hello.");
		expect(events.filter((e) => e.event === "retrying")).toEqual([
			expect.objectContaining({ reason: "error", attempt: 1 }),
		]);
	});

	it("lets the adapter's verdict on an error override the message", async () => {
		let attempts = 0;
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async (segments) => {
				attempts++;
				if (attempts === 1) throw new Error("The server had an error"); // unrecognised wording
				if (attempts === 2) throw new Error("429 Too Many Requests"); // reads as a rate limit
				return segments.map((s) => `T:${s}`);
			},
			classifyError: (error) =>
				(error as Error).message.startsWith("The server") ? "retryable" : "fatal",
		});
		const out = await collect(makeCues(["Hello."]), adapter, {
			...FAST,
			onEvent: (e) => events.push(e),
		});
		// Retried the first error, gave up on the second, repaired per-segment.
		expect(attempts).toBe(2);
		expect(out[0].text).toBe("S:Hello.");
		expect(events.filter((e) => e.event === "retrying")).toEqual([
			expect.objectContaining({ reason: "error", attempt: 1 }),
		]);
	});

	it("falls back per-segment when the batch translator fails outright", async () => {
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async () => {
				throw new Error("400 invalid schema"); // non-retryable
			},
		});
		const out = await collect(makeCues(["Hello.", "World."]), adapter, {
			...FAST,
			onEvent: (e) => events.push(e),
		});
		expect(out.map((c) => c.text)).toEqual(["S:Hello.", "S:World."]);
		expect(events.some((e) => e.event === "per_segment_fallback")).toBe(true);
	});

	it("keeps original text when both translators fail — never drops a cue", async () => {
		const adapter = echoAdapter({
			translateBatch: async () => {
				throw new Error("400 broken");
			},
			translateSingle: async () => {
				throw new Error("400 broken");
			},
		});
		const cues = makeCues(["Hello.", "World.", "Goodbye."]);
		const out = await collect(cues, adapter, FAST);
		expect(out.map((c) => c.text)).toEqual(["Hello.", "World.", "Goodbye."]);
	});

	it("reports the cues that kept their original text, at whole-file positions", async () => {
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async () => {
				throw new Error("400 broken");
			},
			// Only the second batch's cues fail per-segment too.
			translateSingle: async (segment) => {
				if (segment.startsWith("three") || segment.startsWith("five")) throw new Error("400 broken");
				return `S:${segment}`;
			},
		});
		const cues = makeCues(["one two.", "three four.", "five."]);
		const out = await collect(cues, adapter, {
			...FAST,
			maxTokensPerBatch: 2,
			onEvent: (e) => events.push(e),
		});

		expect(out.map((c) => c.text)).toEqual(["S:one two.", "three four.", "five."]);
		const left = events.flatMap((e) => (e.event === "left_untranslated" ? e.indices : []));
		expect(left.sort()).toEqual([1, 2]);
	});

	it("reports nothing as left untranslated when every cue translates", async () => {
		const events: SessionEvent[] = [];
		await collect(makeCues(["Hello.", "World."]), echoAdapter(), { ...FAST, onEvent: (e) => events.push(e) });
		expect(events.some((e) => e.event === "left_untranslated")).toBe(false);
	});

	it("round-trips embedded newlines through the linebreak sentinel", async () => {
		const seen: string[][] = [];
		const adapter = echoAdapter({
			translateBatch: async (segments) => {
				seen.push([...segments]);
				return segments.map((s) => `T:${s}`);
			},
		});
		const out = await collect(makeCues(["Line one\nLine two"]), adapter, FAST);
		// The adapter must never see a raw newline inside a segment…
		expect(seen[0][0]).toBe(`Line one${LINEBREAK_SENTINEL}Line two`);
		// …and the session must restore it on the way out.
		expect(out[0].text).toBe("T:Line one\nLine two");
	});

	describe("literal \\n escape leak (the 'rolę\\nrycerza' bug)", () => {
		it("converts a literal backslash-n from the batch translator into a real newline", async () => {
			const adapter = echoAdapter({
				// Model double-escaped the line break in its JSON output: the
				// decoded string carries backslash + n, not a newline.
				translateBatch: async () => ["A rád jestem się wpasował w rolę\\nrycerza"],
			});
			const out = await collect(makeCues(["A rád jsem se pasoval do role rytíře"]), adapter, FAST);
			expect(out[0].text).toBe("A rád jestem się wpasował w rolę\nrycerza");
		});

		it("converts a literal backslash-r-backslash-n as well", async () => {
			const adapter = echoAdapter({
				translateBatch: async () => ["pierwsza linia\\r\\ndruga linia"],
			});
			const out = await collect(makeCues(["first line second line"]), adapter, FAST);
			expect(out[0].text).toBe("pierwsza linia\ndruga linia");
		});

		it("normalizes escapes on the single-segment fallback path too", async () => {
			const adapter = echoAdapter({
				translateBatch: async () => {
					throw new Error("400 broken"); // non-retryable → per-segment
				},
				translateSingle: async () => "górna linia\\ndolna linia",
			});
			const out = await collect(makeCues(["top line bottom line"]), adapter, FAST);
			expect(out[0].text).toBe("górna linia\ndolna linia");
		});

		it("handles sentinel and literal escape mixed in one segment", async () => {
			const adapter = echoAdapter({
				translateBatch: async () => [`jeden${LINEBREAK_SENTINEL}dwa\\ntrzy`],
			});
			const out = await collect(makeCues(["one two three"]), adapter, FAST);
			expect(out[0].text).toBe("jeden\ndwa\ntrzy");
		});
	});

	it("rebases event indices to whole-file cue positions across batches", async () => {
		// Five-word sentences with >12 letters: identical output triggers the
		// untranslated detector. Echoing adapter → every cue gets flagged.
		const texts = [
			"This is the first sentence.",
			"This is the second sentence.",
			"This is the third sentence.",
			"This is the fourth sentence.",
		];
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async (segments) => [...segments], // untranslated pass-through
		});
		// Budget of 11 word-tokens → two cues per batch → two batches.
		const out = await collect(makeCues(texts), adapter, {
			...FAST,
			maxTokensPerBatch: 11,
			onEvent: (e) => events.push(e),
		});

		const untranslated = events.filter((e) => e.event === "untranslated_detected");
		expect(untranslated).toHaveLength(2);
		// Second batch must report positions 2 and 3 — not batch-relative 0 and 1.
		expect(untranslated.map((e) => e.indices)).toEqual([
			[0, 1],
			[2, 3],
		]);
		// And the repair replaced every flagged cue via the single translator.
		expect(out.map((c) => c.text)).toEqual(texts.map((t) => `S:${t}`));
	});

	it("repairs English drift when the session carries a target language", async () => {
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			// Batch drifts into English; single-segment repair returns Polish.
			translateBatch: async () => ["A then I felt a bit sorry for it."],
			translateSingle: async () => "A potem trochę tego żałowałem.",
		});
		const out = await collect(makeCues(["A pak jsem toho trošku litoval."]), adapter, {
			...FAST,
			targetLanguage: "Polish",
			onEvent: (e) => events.push(e),
		});
		expect(out[0].text).toBe("A potem trochę tego żałowałem.");
		expect(events.some((e) => e.event === "language_drift_detected")).toBe(true);
	});

	it("hard call ceiling: a batch that always throws consumes exactly maxRetries adapter calls", async () => {
		// Regression for the nested-ladder bug: transport give-up used to
		// return [] which the alignment layer retried, re-entering the full
		// ladder — up to 3× the budget. `null` is now terminal.
		let batchCalls = 0;
		const adapter = echoAdapter({
			translateBatch: async () => {
				batchCalls++;
				throw new Error("503 unavailable"); // retryable
			},
		});
		const out = await collect(makeCues(["Hello.", "World."]), adapter, {
			...FAST,
			maxRetries: 3,
		});
		expect(batchCalls).toBe(3);
		expect(out.map((c) => c.text)).toEqual(["S:Hello.", "S:World."]);
	});

	it("ends the retry status when a batch runs out of attempts", async () => {
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async () => {
				throw new Error("503 unavailable"); // retryable
			},
		});
		await collect(makeCues(["Hello."]), adapter, {
			...FAST,
			maxRetries: 3,
			onEvent: (e) => events.push(e),
		});
		const names = events.map((e) => e.event);
		expect(names.filter((n) => n === "retrying")).toHaveLength(2);
		// Cleared once, and before the fallback that replaces the batch call.
		expect(names.filter((n) => n === "retrying_done")).toHaveLength(1);
		expect(names.indexOf("retrying_done")).toBeLessThan(names.indexOf("per_segment_fallback"));
	});

	it("ends the retry status when a retried batch then fails for good", async () => {
		let attempts = 0;
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async () => {
				throw new Error(attempts++ === 0 ? "503 unavailable" : "400 invalid schema");
			},
		});
		await collect(makeCues(["Hello."]), adapter, { ...FAST, onEvent: (e) => events.push(e) });
		expect(events.map((e) => e.event).filter((n) => n.startsWith("retrying"))).toEqual([
			"retrying",
			"retrying_done",
		]);
	});

	it("reports no retry status for a batch that fails without retrying", async () => {
		const events: SessionEvent[] = [];
		const adapter = echoAdapter({
			translateBatch: async () => {
				throw new Error("400 invalid schema"); // non-retryable
			},
		});
		await collect(makeCues(["Hello."]), adapter, { ...FAST, onEvent: (e) => events.push(e) });
		expect(events.some((e) => e.event === "retrying" || e.event === "retrying_done")).toBe(false);
	});

	it("bounded alignment retries: wrong-count responses stop after batchRetries+1 calls", async () => {
		let batchCalls = 0;
		const adapter = echoAdapter({
			translateBatch: async () => {
				batchCalls++;
				return ["only one item"];
			},
		});
		const out = await collect(makeCues(["Hello.", "World."]), adapter, FAST);
		expect(batchCalls).toBe(3); // 1 + 2 count-mismatch retries
		expect(out.map((c) => c.text)).toEqual(["S:Hello.", "S:World."]);
	});

	it("yields nothing when the signal is already aborted", async () => {
		const ac = new AbortController();
		ac.abort();
		const out = await collect(makeCues(["Hello."]), echoAdapter(), {
			...FAST,
			signal: ac.signal,
		});
		expect(out).toEqual([]);
	});

	it("stops retrying a batch once the session is cancelled mid-call", async () => {
		const ac = new AbortController();
		let batchCalls = 0;
		let singleCalls = 0;
		const adapter = echoAdapter({
			// Behaves like a real HTTP client: the in-flight call rejects with an
			// AbortError as soon as its signal fires.
			translateBatch: (_segments, signal) =>
				new Promise((_, reject) => {
					batchCalls++;
					if (signal.aborted) return reject(new Error("This operation was aborted"));
					signal.addEventListener("abort", () => reject(new Error("This operation was aborted")), { once: true });
					// Cancel while the first call is in flight.
					queueMicrotask(() => ac.abort());
				}),
			translateSingle: async () => { singleCalls++; return "never"; },
		});

		const out = await collect(makeCues(["Hello.", "World."]), adapter, {
			...FAST,
			maxRetries: 5,
			signal: ac.signal,
		});

		expect(batchCalls).toBe(1);
		expect(singleCalls).toBe(0);
		expect(out).toEqual([]);
	});

	it("stops waiting out a back-off once the session is cancelled", async () => {
		const ac = new AbortController();
		let batchCalls = 0;
		const adapter = echoAdapter({
			translateBatch: async () => {
				batchCalls++;
				throw new Error("503 unavailable"); // retryable
			},
		});

		// A back-off far longer than the test may run: only cancellation ends it.
		const out = await collect(makeCues(["Hello.", "World."]), adapter, {
			baseDelayMs: 60_000,
			signal: ac.signal,
			onEvent: (e) => { if (e.event === "retrying") ac.abort(); },
		});

		expect(batchCalls).toBe(1);
		expect(out).toEqual([]);
	});

	describe("a translator that refuses the session", () => {
		const refusedError = new Error("Incorrect API key provided");
		const classifyError = (error: unknown) => (error === refusedError ? "refused" as const : undefined);

		it("fails the run without retrying or falling back per-segment", async () => {
			let batchCalls = 0;
			let singleCalls = 0;
			const events: SessionEvent[] = [];
			const adapter = echoAdapter({
				classifyError,
				translateBatch: async () => { batchCalls++; throw refusedError; },
				translateSingle: async () => { singleCalls++; throw refusedError; },
			});
			// Ten batches of two cues: far more than one window of concurrency.
			const cues = makeCues(Array.from({ length: 20 }, (_, i) => `line ${i}.`));

			const run = collect(cues, adapter, {
				...FAST,
				maxTokensPerBatch: 4,
				concurrency: 3,
				onEvent: (e) => events.push(e),
			});

			await expect(run).rejects.toThrow("The translator refused the request");
			await expect(run).rejects.toHaveProperty("cause", refusedError);
			expect(batchCalls).toBeLessThanOrEqual(3); // the first window, never the rest
			expect(singleCalls).toBe(0);
			// Three calls were refused; the client is told once, and nothing else.
			expect(events).toEqual([{ event: "refused", reason: "unknown" }]);
		});

		it("passes on the adapter's reason for the refusal", async () => {
			const events: SessionEvent[] = [];
			const adapter = echoAdapter({
				classifyError,
				describeRefusal: (error) => (error === refusedError ? "invalid_key" : undefined),
				translateBatch: async () => { throw refusedError; },
			});

			await expect(
				collect(makeCues(["Hello."]), adapter, { ...FAST, onEvent: (e) => events.push(e) }),
			).rejects.toThrow("The translator refused the request");
			expect(events).toEqual([{ event: "refused", reason: "invalid_key" }]);
		});

		it("says nothing about a refusal that lands after the run was cancelled", async () => {
			const ac = new AbortController();
			const events: SessionEvent[] = [];
			const adapter = echoAdapter({
				classifyError,
				// The batch fails for this request only, so the repair path runs,
				// and the refusal arrives on it after the user has cancelled.
				translateBatch: async () => { throw new Error("400 invalid schema"); },
				translateSingle: async () => { ac.abort(); throw refusedError; },
			});

			const out = await collect(makeCues(["Hello."]), adapter, {
				...FAST,
				signal: ac.signal,
				onEvent: (e) => events.push(e),
			});

			expect(out).toEqual([]);
			expect(events.some((e) => e.event === "refused")).toBe(false);
		});

		it("yields the batches that finished before the refusal", async () => {
			let batchCalls = 0;
			const adapter = echoAdapter({
				classifyError,
				translateBatch: async (segments) => {
					if (++batchCalls > 2) throw refusedError; // the quota runs out mid-file
					return segments.map((s) => `T:${s}`);
				},
			});
			const cues = makeCues(["one.", "two.", "three.", "four."]);

			const out: string[] = [];
			const run = (async () => {
				for await (const cue of runTranslationSession(cues, adapter, {
					...FAST,
					maxTokensPerBatch: 1,
					concurrency: 1,
				})) {
					out.push(cue.text);
				}
			})();

			await expect(run).rejects.toThrow("The translator refused the request");
			expect(out).toEqual(["T:one.", "T:two."]);
			expect(batchCalls).toBe(3);
		});

		it("fails the run when the refusal first shows on the per-segment path", async () => {
			let singleCalls = 0;
			const adapter = echoAdapter({
				classifyError,
				translateBatch: async () => { throw new Error("400 invalid schema"); }, // this request only
				translateSingle: async () => { singleCalls++; throw refusedError; },
			});
			const cues = makeCues(Array.from({ length: 40 }, (_, i) => `line ${i}.`));

			await expect(collect(cues, adapter, FAST)).rejects.toThrow("The translator refused the request");
			expect(singleCalls).toBeLessThanOrEqual(8); // one round of repairs, not two tries per cue
		});

		it("still ends quietly when the run was cancelled", async () => {
			const ac = new AbortController();
			const adapter = echoAdapter({
				classifyError,
				translateBatch: async () => { ac.abort(); throw refusedError; },
			});
			const out = await collect(makeCues(["Hello."]), adapter, { ...FAST, signal: ac.signal });
			expect(out).toEqual([]);
		});
	});

	it("returns no cues for an empty file", async () => {
		expect(await collect([], echoAdapter(), FAST)).toEqual([]);
	});
});
