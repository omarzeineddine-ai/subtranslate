import { buildBatchSystemPrompt, buildSingleSystemPrompt } from "@/lib/prompts";
import type { RefusalReason, TranslatorAdapter, TransportErrorKind } from "@/lib/translate-session";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateObject, generateText, RetryError } from "ai";
import { encodingForModel } from "js-tiktoken";
import { z } from "zod";

/** The one place the model name lives — the LLM calls and the batching
 * tokenizer can never silently diverge. gpt-5-nano: newer multilingual base
 * than gpt-4o-mini at a lower price on both axes ($0.05/$0.40 vs $0.15/$0.60
 * per 1M tokens). */
const MODEL = "gpt-5-nano";

/** Translation is not a reasoning task: minimal effort keeps batch latency
 * inside the session's 30s timeout while retaining the model's multilingual
 * quality. */
const REASONING = { openai: { reasoningEffort: "minimal" } } as const;

/** The session runs the retry ladder for batch calls. The SDK would otherwise
 * retry twice inside each one, tripling the requests behind every attempt the
 * session counts and spending the call's timeout on a backoff nobody is told
 * about. The single-segment call keeps the SDK's retries: the session has no
 * backoff of its own on that path. */
const NO_SDK_RETRIES = 0;

/** OpenAI's own labels for an account that cannot pay for the call. They come
 * in the error body's `type` and `code`; the message has been reworded before
 * ("You exceeded your current quota" became "You have no credits remaining"),
 * so the wording is only the fallback. */
const NO_CREDITS_LABELS = new Set(["insufficient_quota", "credit_balance_exhausted", "billing_not_active"]);
// Not "billing": a plain rate-limit message points at the billing page too
// ("increase your rate limit by adding a payment method ... /account/billing").
const NO_CREDITS_MESSAGE_RE = /quota|no credits/i;

function apiCallError(error: unknown): APICallError | undefined {
	// The SDK wraps the last failure once its own retries are spent.
	const cause = RetryError.isInstance(error) ? error.lastError : error;
	return APICallError.isInstance(cause) ? cause : undefined;
}

function isOutOfCredits(error: APICallError): boolean {
	const body = (error.data as { error?: { type?: unknown; code?: unknown } } | undefined)?.error;
	if (typeof body?.type === "string" && NO_CREDITS_LABELS.has(body.type)) return true;
	if (typeof body?.code === "string" && NO_CREDITS_LABELS.has(body.code)) return true;
	return NO_CREDITS_MESSAGE_RE.test(error.message);
}

/**
 * Why the API refused the key, or undefined when the failure is not a
 * refusal. A rejected key, a key without access to the model and an account
 * with nothing left to spend fail every request the same way, so no amount of
 * waiting helps and the user has to be told which one it is.
 */
export function describeOpenAIRefusal(error: unknown): RefusalReason | undefined {
	const cause = apiCallError(error);
	if (!cause) return undefined;
	if (cause.statusCode === 401) return "invalid_key";
	if (cause.statusCode === 403) return "no_access";
	// An account out of credits is also a 429, and it is not a rate limit.
	if (cause.statusCode === 429 && isOutOfCredits(cause)) return "no_credits";
	return undefined;
}

/**
 * Judge an API failure by its HTTP status rather than its wording. OpenAI's
 * messages rarely name the status ("The server had an error while processing
 * your request" is a 500), so matching on text alone gives up on outages it
 * should wait out and cannot tell a bad key from a blip. A rejected key and
 * an account out of credits are reported as `refused`: they fail every
 * request the same way, not just this one. Anything that is not an API
 * response (a timeout, a schema failure) is left to the session.
 */
export function classifyOpenAIError(error: unknown): TransportErrorKind | undefined {
	const cause = apiCallError(error);
	if (!cause) return undefined;
	if (describeOpenAIRefusal(cause)) return "refused";
	if (cause.statusCode === 429) return "rate_limit";
	return cause.isRetryable ? "retryable" : "fatal";
}

export interface OpenAITranslatorConfig {
	/** The key that pays for the calls: the user's own, or the server's. Passed
	 * in rather than read from the environment so one process can serve
	 * requests under different keys. */
	apiKey: string;
	language: string;
	netflixFormat: boolean;
	/** Optional user-provided video context (synopsis, character names, tone). */
	context: string;
}

/**
 * OpenAI adapter at the session's translator seam. Single-attempt calls only:
 * retry, timeouts, sentinel handling, and fallback policy all live in the
 * translation session.
 */
export function createOpenAITranslator(config: OpenAITranslatorConfig): TranslatorAdapter {
	const { apiKey, language, netflixFormat, context } = config;
	const openai = createOpenAI({ apiKey });
	const encoder = encodingForModel(MODEL);

	return {
		countTokens(text: string): number {
			return encoder.encode(text).length;
		},

		classifyError: classifyOpenAIError,
		describeRefusal: describeOpenAIRefusal,

		// Structured output: generateObject with a z.array schema so OpenAI
		// enforces "translations is an array of strings" at the protocol layer.
		async translateBatch(segments: string[], signal: AbortSignal): Promise<string[]> {
			const expectedCount = segments.length;
			const numberedInput = segments.map((text, i) => `[${i + 1}] ${text}`).join("\n");

			const { object } = await generateObject({
				model: openai(MODEL),
				providerOptions: REASONING,
				maxRetries: NO_SDK_RETRIES,
				abortSignal: signal,
				schema: z.object({
					translations: z
						.array(z.string())
						.describe(
							`Exactly ${expectedCount} translations, one per numbered input segment, in the same order. Item N must contain only the translation of input segment [N+1].`,
						),
				}),
				schemaName: "subtitle_translations",
				schemaDescription: `Array of exactly ${expectedCount} translated subtitle segments aligned 1:1 with the input.`,
				messages: [
					{
						role: "system",
						content: buildBatchSystemPrompt(expectedCount, language, { netflixFormat, context }),
					},
					{ role: "user", content: numberedInput },
				],
			});

			return object.translations;
		},

		async translateSingle(segment: string, signal: AbortSignal): Promise<string> {
			const { text } = await generateText({
				model: openai(MODEL),
				providerOptions: REASONING,
				abortSignal: signal,
				messages: [
					{
						role: "system",
						content: buildSingleSystemPrompt(language, { netflixFormat, context }),
					},
					{ role: "user", content: segment },
				],
			});
			return text;
		},
	};
}
