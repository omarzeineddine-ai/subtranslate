import {
	detectEmptySegments,
	detectEnglishDriftSegments,
	detectMergedSegments,
	detectSplitSegments,
	detectUntranslatedSegments,
} from "@/lib/parsing";
import { LINEBREAK_SENTINEL } from "@/lib/prompts";
import type { Cue } from "@/types";

/**
 * Translation session — the full policy for translating a parsed subtitle
 * file: token-budget batching, batch-level concurrency scheduling, transport
 * retry with exponential backoff, the linebreak-sentinel round-trip, and
 * alignment safety (count enforcement, drift detection, per-segment repair),
 * with ordered emission.
 *
 * The LLM itself sits behind the TranslatorAdapter seam: the OpenAI adapter
 * in production, a fake in tests. Everything in this module runs without a
 * network.
 *
 * Retry budgets: each batch gets ONE transport budget (`maxRetries` calls to
 * the adapter, shared across alignment retries). When the transport layer
 * gives up it returns null, which the alignment layer treats as terminal —
 * it falls straight back to per-segment translation instead of re-entering
 * the ladder.
 *
 * A refusal is the exception to all of it: when the backend turns the client
 * away outright (a rejected key, an exhausted quota) no retry or fallback can
 * succeed, so the session stops its in-flight calls, emits the batches that
 * had already finished, and throws.
 */

/** What the session needs from a translation backend. Both calls are single
 * attempts — retry, timeouts, and fallback policy live in the session. */
export interface TranslatorAdapter {
	/** Translate a batch 1:1. May return a wrong-length array (alignment
	 * safety recovers); throws on transport/model failure. Input segments
	 * have embedded newlines replaced by the linebreak sentinel. */
	translateBatch(segments: string[], signal: AbortSignal): Promise<string[]>;
	/** Translate one segment. Throws on transport/model failure. */
	translateSingle(segment: string, signal: AbortSignal): Promise<string>;
	/** Token count under the backend's tokenizer, used for batch sizing. */
	countTokens(text: string): number;
	/** What a thrown error means for the retry ladder, when the backend can
	 * tell from more than the message (an HTTP status, a typed error). Return
	 * undefined to let the session judge by the message instead. */
	classifyError?(error: unknown): TransportErrorKind | undefined;
	/** Why the backend refused, for an error classified `refused`, so the
	 * user can be told what to fix. Undefined when the backend cannot say. */
	describeRefusal?(error: unknown): RefusalReason | undefined;
}

/** Why a backend turns a client away for good: the key is wrong, the key may
 * not use the model, or the account behind it has nothing left to spend. */
export type RefusalReason = "invalid_key" | "no_credits" | "no_access";

/** `rate_limit` and `retryable` are retried with backoff (longer for a rate
 * limit); `fatal` ends the batch's transport budget at once. `refused` is a
 * failure of the whole backend rather than of one request: it turns this
 * client away whatever is sent (a rejected key, an exhausted quota), so no
 * other call in the session can succeed either. */
export type TransportErrorKind = "rate_limit" | "retryable" | "fatal" | "refused";

/** The wire event vocabulary. `indices` are whole-file cue positions. */
export type SessionEvent =
	| { event: "count_mismatch_retry"; attempt: number; count: number; expected: number }
	| { event: "split_detected"; indices: number[] }
	| { event: "merge_detected"; indices: number[] }
	| { event: "empty_detected"; indices: number[] }
	| { event: "untranslated_detected"; indices: number[] }
	| { event: "language_drift_detected"; indices: number[] }
	| { event: "per_segment_fallback"; indices: number[] }
	/** Cues every recovery path failed on: they carry their original text. */
	| { event: "left_untranslated"; indices: number[] }
	| {
			event: "retrying";
			attempt: number;
			maxAttempts: number;
			delayMs: number;
			reason: "rate_limit" | "error";
			/** A few words on what failed, safe to show the user. */
			detail: string;
	  }
	| { event: "retrying_done" }
	/** The backend refused the session; the run ends after what had finished.
	 * Sent once, so the client can say why instead of only that it stopped. */
	| { event: "refused"; reason: RefusalReason | "unknown" };

export interface SessionOptions {
	/** Target language of the translation. When set, output that drifted into
	 * English (the model's fallback language) is detected and repaired. */
	targetLanguage?: string;
	/** Aborts in-flight LLM calls and stops emission. */
	signal?: AbortSignal;
	/** Observer for progress/status events (streamed to the client by the route). */
	onEvent?: (event: SessionEvent) => void;
	/** Batches translated concurrently. */
	concurrency?: number;
	/** Transport budget per batch: total adapter batch calls, shared across
	 * alignment retries. */
	maxRetries?: number;
	/** Backoff base; doubled for rate limits, exponential per attempt. */
	baseDelayMs?: number;
	batchTimeoutMs?: number;
	singleTimeoutMs?: number;
	/** Token budget per batch. */
	maxTokensPerBatch?: number;
}

const DEFAULTS = {
	concurrency: 6,
	maxRetries: 8,
	baseDelayMs: 1500,
	batchTimeoutMs: 30_000,
	singleTimeoutMs: 20_000,
	maxTokensPerBatch: 800,
};

const LINEBREAK_RE = /\r?\n+/g;

/** The model sometimes double-escapes line breaks in its JSON output, so the
 * decoded string carries the two-character sequence `\n` (backslash + n)
 * instead of a real newline — which then renders literally inside the
 * subtitle ("rolę\nrycerza"). Restore the sentinel first, then de-escape any
 * stray literals. Real backslash-n content in subtitles doesn't exist outside
 * this failure mode, so the rewrite is safe. */
function restoreLineBreaks(text: string): string {
	return text.split(LINEBREAK_SENTINEL).join("\n").replace(/(?:\\r)?\\n/g, "\n");
}

/** Per-segment LLM call concurrency. Each batch can fire this many parallel
 * single-segment repairs. Sized so repairs finish in roughly one call-latency
 * even for a fully-fallen-back 80-segment batch, while staying well under
 * OpenAI's RPM budget when multiplied by the batch-level concurrency. */
const SINGLE_CONCURRENCY = 8;

/**
 * Group cues into batches of at most `budget` tokens. A cue larger than the
 * budget gets a batch of its own — never an empty batch.
 */
export function groupCuesByTokenBudget(
	cues: Cue[],
	budget: number,
	countTokens: (text: string) => number,
): Cue[][] {
	const groups: Cue[][] = [];
	let current: Cue[] = [];
	let currentTokens = 0;

	for (const cue of cues) {
		const cueTokens = countTokens(cue.text);
		if (current.length > 0 && currentTokens + cueTokens > budget) {
			groups.push(current);
			current = [];
			currentTokens = 0;
		}
		current.push(cue);
		currentTokens += cueTokens + 1; // slack for the "[N] " prefix and newline the adapter adds
	}

	if (current.length > 0) {
		groups.push(current);
	}

	return groups;
}

// ─── Transport layer: retry ladder over the adapter ─────────────────────────

/** A signal for one adapter call: fires on timeout or when the session is
 * cancelled. Composed rather than wired by hand so that a call which finishes
 * leaves no listener behind on the session's signal — a long file makes
 * hundreds of calls against that one signal. */
function createCallSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

/** Wait out a back-off, or stop waiting the moment the session is cancelled:
 * a back-off can run to a minute, and a cancelled request should not hold its
 * batches asleep for that long. */
function backOff(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve();
		const done = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		signal?.addEventListener("abort", done, { once: true });
	});
}

/** Matched on "rate limit", not a bare "rate": that is also a substring of
 * "No object generated", which made every malformed model response look like
 * throttling — doubled backoff, and a busy screen blaming a rate limit. */
const RATE_LIMIT_RE = /\b429\b|too many requests|rate.?limit|resource.*exhaust/i;

function isRateLimitError(error: unknown): boolean {
	return error instanceof Error && RATE_LIMIT_RE.test(error.message ?? "");
}

function isRetryableError(error: unknown): boolean {
	if (!(error instanceof Error)) return true;
	const msg = error.message?.toLowerCase() ?? "";
	return (
		RATE_LIMIT_RE.test(msg) ||
		// A response that failed the schema or did not parse: the next sample
		// usually comes back well-formed.
		msg.includes("no object generated") ||
		msg.includes("500") ||
		msg.includes("503") ||
		msg.includes("unavailable") ||
		msg.includes("internal") ||
		msg.includes("timeout") ||
		msg.includes("abort") ||
		msg.includes("econnreset") ||
		msg.includes("socket") ||
		msg.includes("fetch failed")
	);
}

/** The adapter's verdict when it has one, the message heuristics otherwise. */
function classifyError(adapter: TranslatorAdapter, error: unknown): TransportErrorKind {
	const known = adapter.classifyError?.(error);
	if (known) return known;
	if (isRateLimitError(error)) return "rate_limit";
	return isRetryableError(error) ? "retryable" : "fatal";
}

/**
 * What went wrong with a call, in a few words the busy screen can show. The
 * full message goes to the server log; this is what a user screenshots when
 * they report a problem, so it has to tell an outage from a slow model from
 * a malformed reply without leaking the provider's raw wording.
 */
export function describeTransportError(error: unknown, timeoutMs: number): string {
	// The SDK wraps the last failure once its own retries are spent.
	const cause = (error as { lastError?: unknown } | null)?.lastError ?? error;
	if (!(cause instanceof Error)) return "unknown error";
	const status = (cause as { statusCode?: unknown }).statusCode;
	if (typeof status === "number") return `server returned ${status}`;
	const msg = cause.message ?? "";
	if (cause.name === "TimeoutError" || /timeout|timed out/i.test(msg)) {
		return `no reply within ${Math.round(timeoutMs / 1000)}s`;
	}
	if (/no object generated/i.test(msg)) return "unusable response";
	if (/econnreset|socket|fetch failed/i.test(msg)) return "connection dropped";
	return "unexpected error";
}

function getRetryDelay(attempt: number, kind: TransportErrorKind, baseDelayMs: number): number {
	const base = kind === "rate_limit" ? baseDelayMs * 2 : baseDelayMs;
	const exponential = base * Math.pow(2, attempt);
	const jitter = exponential * (0.75 + Math.random() * 0.5);
	return Math.min(jitter, 60_000);
}

/**
 * Wrap the adapter's batch call with the sentinel round-trip and the retry
 * ladder. The returned function shares ONE budget of `maxRetries` adapter
 * calls across all its invocations for this batch; when the budget is spent
 * (or an error is not retryable) it returns null — terminal, no more calls.
 */
function makeBatchCall(
	adapter: TranslatorAdapter,
	options: Required<Omit<SessionOptions, "signal" | "onEvent" | "targetLanguage">> & SessionOptions,
	onRefused: (error: unknown) => void,
): BatchTranslator {
	let attemptsLeft = options.maxRetries;

	return async (segments: string[]): Promise<string[] | null> => {
		const flattened = segments.map((s) => s.replace(LINEBREAK_RE, LINEBREAK_SENTINEL));
		let retried = false;

		let attempt = 0;
		while (attemptsLeft > 0) {
			attemptsLeft--;
			try {
				const callSignal = createCallSignal(options.batchTimeoutMs, options.signal);
				const raw = await adapter.translateBatch(flattened, callSignal);
				if (retried) options.onEvent?.({ event: "retrying_done" });
				// Restore real newlines from the sentinel and stray escapes.
				return raw.map((t) => (typeof t === "string" ? restoreLineBreaks(t) : t));
			} catch (error: unknown) {
				// A cancelled session surfaces here as an AbortError, which looks
				// retryable; retrying would spend the budget on calls nobody is
				// waiting for.
				if (options.signal?.aborted) return null;
				const kind = classifyError(adapter, error);
				if (kind === "refused") onRefused(error);
				if (attemptsLeft > 0 && (kind === "rate_limit" || kind === "retryable")) {
					retried = true;
					const delay = getRetryDelay(attempt, kind, options.baseDelayMs);
					console.error(
						`[translate] Batch attempt ${attempt + 1}/${options.maxRetries} error: ${error instanceof Error ? error.message : "unknown"}, retrying in ${Math.round(delay)}ms...`,
					);
					options.onEvent?.({
						event: "retrying",
						attempt: attempt + 1,
						maxAttempts: options.maxRetries,
						delayMs: Math.round(delay),
						reason: kind === "rate_limit" ? "rate_limit" : "error",
						detail: describeTransportError(error, options.batchTimeoutMs),
					});
					attempt++;
					await backOff(delay, options.signal);
					if (options.signal?.aborted) return null;
					continue;
				}

				console.error(
					`[translate] Batch translator failed: ${error instanceof Error ? error.message : "unknown"}`,
				);
				// Giving up ends the back-off as surely as a success does; without
				// this the client keeps announcing a retry that will never run.
				if (retried) options.onEvent?.({ event: "retrying_done" });
				return null;
			}
		}
		return null;
	};
}

/**
 * Wrap the adapter's per-segment call. One input → one output cannot drift by
 * construction; alignment safety uses this as the bulletproof fallback. On
 * failure returns null so the caller keeps the original text.
 */
function makeSingleCall(
	adapter: TranslatorAdapter,
	options: Required<Omit<SessionOptions, "signal" | "onEvent" | "targetLanguage">> & SessionOptions,
	onRefused: (error: unknown) => void,
): SingleTranslator {
	return async (segment: string): Promise<string | null> => {
		try {
			const callSignal = createCallSignal(options.singleTimeoutMs, options.signal);
			const text = await adapter.translateSingle(segment, callSignal);
			return restoreLineBreaks(text).trim() || null;
		} catch (error) {
			if (!options.signal?.aborted && classifyError(adapter, error) === "refused") onRefused(error);
			console.error(
				`[translate] Single-segment translator failed: ${error instanceof Error ? error.message : "unknown"}`,
			);
			return null;
		}
	};
}

// ─── Alignment safety ───────────────────────────────────────────────────────
// Internal seam, exported so tests can drive it with deterministic fakes.

/** Single-attempt-per-invocation batch translation. `null` means the
 * transport layer gave up — terminal, do not call again. A thrown error is
 * tolerated and treated as one failed alignment attempt. */
export type BatchTranslator = (segments: string[]) => Promise<string[] | null>;
export type SingleTranslator = (segment: string) => Promise<string | null>;

export interface AlignmentOptions {
	/** Target language; enables English-drift detection when set. */
	targetLanguage?: string;
	/** How many times to retry the batch translator on count mismatch. */
	batchRetries?: number;
	/** Offset added to every emitted index, so events carry whole-file
	 * positions no matter which batch they came from. */
	base?: number;
	onEvent?: (event: SessionEvent) => void;
	signal?: AbortSignal;
}

/**
 * Translate a batch of segments. The returned array is ALWAYS the same length
 * as the input — no matter how badly the underlying translator misbehaves.
 *
 * Alignment-safety strategy (defense in depth):
 *   1. Call the batch translator. Retry on count mismatch (the LLM produced
 *      != N outputs). A `null` return is terminal — skip straight to 2.
 *   2. If batch translation failed entirely, translate per-segment
 *      (1 input → 1 output cannot drift by construction).
 *   3. Run split + merge + blank-slot + untranslated detection on the result.
 *   4. Repair suspect slots: a drifted tail is asked for again as one batch,
 *      and what still looks wrong is translated per-segment. Final guarantee:
 *      originals fill any slot every recovery path failed on — never a
 *      partial/empty array, never a re-indexed array — and those slots are
 *      reported as `left_untranslated`.
 */
export async function translateBatchSafe(
	segments: string[],
	batchTranslator: BatchTranslator,
	singleTranslator: SingleTranslator,
	options: AlignmentOptions = {},
): Promise<string[]> {
	if (segments.length === 0) return [];

	const batchRetries = options.batchRetries ?? 2;
	const base = options.base ?? 0;
	const expectedCount = segments.length;
	const globalIndices = (indices: number[]) => indices.map((i) => i + base);
	const aborted = () => options.signal?.aborted ?? false;
	// Keeping the original is what holds the timing together, but it is not a
	// translation — say which cues it happened to so the client never presents
	// them as one. A cancelled session keeps nothing, so it reports nothing.
	const reportLeftUntranslated = (indices: number[]) => {
		if (indices.length === 0 || aborted()) return;
		options.onEvent?.({
			event: "left_untranslated",
			indices: globalIndices(indices.sort((a, b) => a - b)),
		});
	};

	// ─── Phase 1: batch translation with count enforcement ─────────────────
	let translations: string[] | null = null;
	for (let attempt = 0; attempt < batchRetries + 1; attempt++) {
		let raw: string[] | null = [];
		try {
			raw = await batchTranslator(segments);
		} catch {
			raw = [];
		}

		if (raw === null) break; // transport gave up — don't re-enter the ladder

		if (raw.length === expectedCount) {
			// Normalize immediately so detection sees only strings — defends
			// against translators that put undefined/null/non-strings in a slot.
			translations = normalizeLength(segments, raw);
			break;
		}

		options.onEvent?.({
			event: "count_mismatch_retry",
			attempt: attempt + 1,
			count: raw.length,
			expected: expectedCount,
		});
	}

	// A cancelled session keeps nothing, so skip the repair paths and their
	// events instead of announcing a fallback for work that will not run.
	if (aborted()) return normalizeLength(segments, []);

	// ─── Phase 2: if batch failed entirely, go straight to per-segment ─────
	if (!translations) {
		options.onEvent?.({
			event: "per_segment_fallback",
			indices: globalIndices(segments.map((_, i) => i)),
		});
		const out: (string | undefined)[] = new Array(expectedCount);
		const failed: number[] = [];
		await parallelFor(expectedCount, SINGLE_CONCURRENCY, async (i) => {
			const result = await translateOne(segments[i], singleTranslator, options.targetLanguage, aborted);
			if (result === null) failed.push(i);
			else out[i] = result;
		}, aborted);
		reportLeftUntranslated(failed);
		return normalizeLength(segments, out);
	}

	// ─── Phase 3: detect drift (splits + merges) and off-language slots ────
	const splits = detectSplitSegments(segments, translations);
	const merges = detectMergedSegments(segments, translations);
	const empties = detectEmptySegments(segments, translations);
	const untranslated = detectUntranslatedSegments(segments, translations);
	const englishDrift = options.targetLanguage
		? detectEnglishDriftSegments(translations, options.targetLanguage)
		: [];

	if (
		splits.length === 0 &&
		merges.length === 0 &&
		empties.length === 0 &&
		untranslated.length === 0 &&
		englishDrift.length === 0
	) {
		return normalizeLength(segments, translations);
	}

	if (splits.length > 0) {
		options.onEvent?.({ event: "split_detected", indices: globalIndices(splits) });
	}
	if (merges.length > 0) {
		options.onEvent?.({ event: "merge_detected", indices: globalIndices(merges) });
	}
	if (empties.length > 0) {
		options.onEvent?.({ event: "empty_detected", indices: globalIndices(empties) });
	}
	if (untranslated.length > 0) {
		options.onEvent?.({ event: "untranslated_detected", indices: globalIndices(untranslated) });
	}
	if (englishDrift.length > 0) {
		options.onEvent?.({ event: "language_drift_detected", indices: globalIndices(englishDrift) });
	}

	// ─── Phase 4: repair suspect regions ───────────────────────────────────
	// A split/merge at index i means translation[i] is wrong AND every
	// downstream slot may also be shifted. So the repair range starts at the
	// earliest drift suspect and extends to the end of the batch.
	// A blank slot counts as drift, and so does the slot before it: that is
	// where the blank slot's text usually went, and repairing only the blank
	// one would leave its content shown twice.
	let repairStart = firstDriftSuspect(splits, merges, empties, expectedCount);
	let untranslatedNow = untranslated;
	let englishDriftNow = englishDrift;

	// 4a: ask for the drifted tail again as ONE batch before paying for it
	// cue by cue. A tail of 40 cues is 40 single calls, each with its own
	// copy of the instructions and no neighbouring lines for context; a
	// second batch is one call. Whatever part of the second answer lines up
	// is kept, and only what still looks shifted goes to the per-cue path.
	// One try only: a null (transport gave up) or a wrong count leaves the
	// whole tail to the per-cue path, as before.
	if (expectedCount - repairStart >= 2) {
		const tail = segments.slice(repairStart);
		let retry: string[] | null = null;
		try {
			retry = await batchTranslator(tail);
		} catch {
			retry = null;
		}
		if (aborted()) return normalizeLength(segments, []);

		if (retry && retry.length === tail.length) {
			const redone = normalizeLength(tail, retry);
			const aligned = firstDriftSuspect(
				detectSplitSegments(tail, redone),
				detectMergedSegments(tail, redone),
				detectEmptySegments(tail, redone),
				tail.length,
			);
			for (let k = 0; k < aligned; k++) translations[repairStart + k] = redone[k];
			repairStart += aligned;
			// The kept slots are new text, so the per-slot checks run again.
			untranslatedNow = detectUntranslatedSegments(segments, translations);
			englishDriftNow = options.targetLanguage
				? detectEnglishDriftSegments(translations, options.targetLanguage)
				: [];
		}
	}

	// 4b: per-cue repair of what is left (1 input → 1 output cannot drift).
	// Untranslated and English-drift slots do NOT shift alignment, so any that
	// fall before the drift range are repaired individually.
	const repairSet = new Set<number>(untranslatedNow.concat(englishDriftNow));
	for (let i = repairStart; i < expectedCount; i++) repairSet.add(i);
	const repairList = Array.from(repairSet).sort((a, b) => a - b);
	if (repairList.length === 0) return normalizeLength(segments, translations);

	options.onEvent?.({
		event: "per_segment_fallback",
		indices: globalIndices(repairList),
	});

	const failed: number[] = [];
	await parallelFor(repairList.length, SINGLE_CONCURRENCY, async (k) => {
		const i = repairList[k];
		const result = await translateOne(segments[i], singleTranslator, options.targetLanguage, aborted);
		if (result === null) failed.push(i);
		translations![i] = result ?? segments[i];
	}, aborted);
	reportLeftUntranslated(failed);

	return normalizeLength(segments, translations);
}

/** Where the alignment of a batch stops being trustworthy: the earliest slot
 * a split, merge or blank was seen at, or `count` when there is none. The slot
 * before a blank counts too, since that is where its text usually went. */
function firstDriftSuspect(
	splits: number[],
	merges: number[],
	empties: number[],
	count: number,
): number {
	const absorbers = empties.map((i) => Math.max(i - 1, 0));
	return Math.min(count, ...splits, ...merges, ...empties, ...absorbers);
}

/** Attempts per repaired segment. The repair path is the last line of defense
 * with no detector behind it, so a rejected result earns one more try before
 * we fall back to the original text. */
const REPAIR_ATTEMPTS = 2;

/**
 * Repair-output validation. The per-segment path has no downstream detector,
 * so a bad result here ships straight into the file — this is what let a
 * hallucinated English scene description ~9× the source length replace a real
 * subtitle. Reject length blowups (the +40 floor keeps short cues like "Me?"
 * → "¿Yo?" safe) and English drift when the target is another language.
 */
function isSuspectRepair(
	original: string,
	result: string,
	targetLanguage: string | undefined,
): boolean {
	if (result.length > original.length * 3 + 40) return true;
	if (targetLanguage && detectEnglishDriftSegments([result], targetLanguage).length > 0) {
		return true;
	}
	return false;
}

/**
 * Per-segment fallback for a single segment. Tries the single-segment
 * translator; if every attempt fails validation or returns null/empty,
 * returns null and the caller keeps the original (so timing stays aligned
 * even on total LLM failure). A stopped session gets no further attempt.
 */
async function translateOne(
	original: string,
	singleTranslator: SingleTranslator,
	targetLanguage?: string,
	shouldStop: () => boolean = () => false,
): Promise<string | null> {
	for (let attempt = 0; attempt < REPAIR_ATTEMPTS && !shouldStop(); attempt++) {
		try {
			const result = await singleTranslator(original);
			if (!result?.trim()) continue;
			if (isSuspectRepair(original, result, targetLanguage)) continue;
			return result;
		} catch {
			// try again, then give up on this segment
		}
	}
	return null;
}

/** Run `task(i)` for each i in [0, count) with at most `limit` concurrent.
 * Stops launching new tasks once `shouldStop()` reports true. */
async function parallelFor(
	count: number,
	limit: number,
	task: (i: number) => Promise<void>,
	shouldStop: () => boolean = () => false,
): Promise<void> {
	if (count === 0) return;
	let next = 0;
	// Each worker is a chain: it takes the next index, runs the task, and
	// takes another when that one settles. The chain is the bound: at most
	// `limit` tasks run at once, and nothing starts out of turn.
	const worker = (): Promise<void> => {
		if (shouldStop()) return Promise.resolve();
		const i = next++;
		if (i >= count) return Promise.resolve();
		return task(i).then(worker);
	};
	const workers = Array.from({ length: Math.min(limit, count) }, worker);
	await Promise.all(workers);
}

/**
 * Pad or truncate the translator's output to match the expected length.
 * Slots without a translation fall back to the original text so the caller's
 * downstream loop (which zips translations with original timestamps) never
 * reads undefined.
 */
function normalizeLength(
	originals: string[],
	candidate: readonly (string | undefined)[],
): string[] {
	const out: string[] = new Array(originals.length);
	for (let i = 0; i < originals.length; i++) {
		const v = candidate[i];
		out[i] = typeof v === "string" ? v : originals[i];
	}
	return out;
}

// ─── The session ────────────────────────────────────────────────────────────

/**
 * Translate a parsed subtitle file, yielding translated cues in original
 * order as they become available. The returned cue count always equals the
 * input count; on unrecoverable failure a cue keeps its original text.
 *
 * Throws, after yielding what had finished, when the backend refuses the
 * session outright: the caller then has a partial translation and an error
 * rather than a file of originals that took thousands of doomed calls to
 * produce.
 */
export async function* runTranslationSession(
	cues: Cue[],
	adapter: TranslatorAdapter,
	sessionOptions: SessionOptions = {},
): AsyncGenerator<Cue> {
	// A refusal stops the session through the same signal a cancellation uses,
	// so in-flight calls end and the repair paths stand down; the reason it
	// carries is what the session throws.
	const halt = new AbortController();
	const refuse = (error: unknown) => {
		// Several calls are in flight and each one is refused; say it once.
		if (halt.signal.aborted) return;
		halt.abort(new Error("The translator refused the request", { cause: error }));
		// A cancelled run has no one left to tell.
		if (sessionOptions.signal?.aborted) return;
		sessionOptions.onEvent?.({ event: "refused", reason: adapter.describeRefusal?.(error) ?? "unknown" });
	};
	const cancelled = () => sessionOptions.signal?.aborted ?? false;
	const signal = sessionOptions.signal
		? AbortSignal.any([sessionOptions.signal, halt.signal])
		: halt.signal;

	const options = { ...DEFAULTS, ...sessionOptions, signal };
	const groups = groupCuesByTokenBudget(cues, options.maxTokensPerBatch, adapter.countTokens);

	const groupOffsets: number[] = [];
	let offset = 0;
	for (const group of groups) {
		groupOffsets.push(offset);
		offset += group.length;
	}

	const singleCall = makeSingleCall(adapter, options, refuse);

	// Sliding window: keep `concurrency` batches in flight at all times, emit
	// each in original order as it completes. A slow batch (e.g. one that fell
	// back to per-segment) no longer blocks the others in its wave, and the
	// next batch starts as soon as a slot opens.
	const inFlight: (Promise<string[] | null> | undefined)[] = new Array(groups.length);
	let nextToStart = 0;

	/** Resolves to null for a batch the session was stopped under: what it
	 * returns then is its originals, not a translation. */
	const startBatch = (idx: number): Promise<string[] | null> => {
		const group = groups[idx];
		return translateBatchSafe(
			group.map((cue) => cue.text),
			makeBatchCall(adapter, options, refuse), // fresh transport budget per batch
			singleCall,
			{
				targetLanguage: options.targetLanguage,
				base: groupOffsets[idx],
				onEvent: options.onEvent,
				signal,
			},
		)
			.catch(() => {
				console.error(`[translate] Unexpected failure on batch ${idx + 1}/${groups.length}`);
				return group.map((cue) => cue.text);
			})
			.then((translations) => (signal.aborted ? null : translations));
	};

	const fillWindow = (emitCursor: number) => {
		while (
			!signal.aborted &&
			nextToStart < groups.length &&
			nextToStart - emitCursor < options.concurrency
		) {
			inFlight[nextToStart] = startBatch(nextToStart);
			nextToStart++;
		}
	};

	/** The batches' results in file order, each taken as its turn comes and
	 * the window refilled behind it. Ends early when the run is cancelled; a
	 * batch the window never started, because the session was stopped
	 * first, comes through as undefined. */
	const inOrder: AsyncIterable<{ idx: number; translations: string[] | null | undefined }> = {
		[Symbol.asyncIterator]() {
			let emit = 0;
			return {
				async next() {
					if (emit >= groups.length || cancelled()) return { done: true, value: undefined };
					const idx = emit++;
					fillWindow(idx);
					const translations = await inFlight[idx];
					inFlight[idx] = undefined;
					return { done: false, value: { idx, translations } };
				},
			};
		},
	};

	for await (const { idx, translations } of inOrder) {
		// The batch may have been cancelled while it was awaited; its result is
		// then just the originals, which the client must not receive as output.
		if (cancelled()) return;
		// Stopped, or never started, because the translator refused the session.
		// Batches that finished before the refusal were emitted above.
		if (!translations) throw halt.signal.reason;

		// translateBatchSafe guarantees length match, so the index alignment
		// with the group's cues is safe.
		const group = groups[idx];
		for (let i = 0; i < group.length; i++) {
			yield { ...group[i], text: translations[i] ?? group[i].text };
		}
	}
}
