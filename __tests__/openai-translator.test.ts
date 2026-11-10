import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { classifyOpenAIError, describeOpenAIRefusal } from "@/lib/openai-translator";

const apiError = (statusCode: number, message: string, data?: unknown) =>
	new APICallError({ message, statusCode, url: "https://api.openai.com/v1/responses", requestBodyValues: {}, data });

/** The body OpenAI sent on 2026-11-10 for an account with nothing left. Its
 * message never says "quota", which is what the classifier used to look for:
 * the 429 was waited out as a rate limit, eight attempts and four and a half
 * minutes of back-off, until the platform's time limit cut the response. */
const NO_CREDITS_BODY = {
	error: {
		message:
			"You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
		type: "insufficient_quota",
		param: null,
		code: "credit_balance_exhausted",
	},
};

describe("classifyOpenAIError", () => {
	it("calls a 429 a rate limit", () => {
		expect(classifyOpenAIError(apiError(429, "Rate limit reached for gpt-5-nano"))).toBe("rate_limit");
	});

	it("reports an exhausted quota as a refusal even though it is a 429", () => {
		expect(classifyOpenAIError(apiError(429, "You exceeded your current quota, please check your plan"))).toBe("refused");
	});

	it("reports an account with no credits as a refusal, whatever the message says", () => {
		const error = apiError(429, NO_CREDITS_BODY.error.message, NO_CREDITS_BODY);
		expect(classifyOpenAIError(error)).toBe("refused");
	});

	it("reads the no-credits label from the error body when the message is unfamiliar", () => {
		const byType = apiError(429, "Payment required", { error: { type: "insufficient_quota" } });
		const byCode = apiError(429, "Payment required", { error: { code: "credit_balance_exhausted" } });
		expect(classifyOpenAIError(byType)).toBe("refused");
		expect(classifyOpenAIError(byCode)).toBe("refused");
	});

	it("reports no credits from the message alone when the body did not parse", () => {
		expect(classifyOpenAIError(apiError(429, NO_CREDITS_BODY.error.message))).toBe("refused");
	});

	it("still calls a 429 with a rate-limit body a rate limit", () => {
		const error = apiError(429, "Rate limit reached for gpt-5-nano", {
			error: { type: "requests", code: "rate_limit_exceeded" },
		});
		expect(classifyOpenAIError(error)).toBe("rate_limit");
	});

	it("does not mistake a rate limit that mentions the billing page for no credits", () => {
		const message =
			"Rate limit reached for gpt-5-nano on requests per min. You can increase your rate limit by adding a payment method to your account at https://platform.openai.com/account/billing.";
		expect(classifyOpenAIError(apiError(429, message))).toBe("rate_limit");
	});

	it("waits out a server error whose message names no status", () => {
		expect(classifyOpenAIError(apiError(500, "The server had an error while processing your request"))).toBe(
			"retryable",
		);
	});

	it("reports a rejected key as a refusal", () => {
		expect(classifyOpenAIError(apiError(401, "Incorrect API key provided"))).toBe("refused");
	});

	it("reports a key without access as a refusal", () => {
		expect(classifyOpenAIError(apiError(403, "You do not have access to this model"))).toBe("refused");
	});

	it("gives up on a request the API rejects on its own terms", () => {
		expect(classifyOpenAIError(apiError(400, "Invalid schema for response_format"))).toBe("fatal");
	});

	it("looks through the SDK's retry wrapper to the last failure", () => {
		const last = apiError(503, "The engine is currently overloaded");
		const wrapped = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [last] });
		expect(classifyOpenAIError(wrapped)).toBe("retryable");
	});

	it("leaves anything that is not an API response to the session", () => {
		expect(classifyOpenAIError(new Error("timeout"))).toBeUndefined();
	});
});

describe("describeOpenAIRefusal", () => {
	it("names a rejected key", () => {
		expect(describeOpenAIRefusal(apiError(401, "Incorrect API key provided"))).toBe("invalid_key");
	});

	it("names a key without access to the model", () => {
		expect(describeOpenAIRefusal(apiError(403, "You do not have access to this model"))).toBe("no_access");
	});

	it("names an account with no credits", () => {
		expect(describeOpenAIRefusal(apiError(429, NO_CREDITS_BODY.error.message, NO_CREDITS_BODY))).toBe("no_credits");
		expect(describeOpenAIRefusal(apiError(429, "You exceeded your current quota, please check your plan"))).toBe(
			"no_credits",
		);
	});

	it("is undefined for failures that are not refusals", () => {
		expect(describeOpenAIRefusal(apiError(429, "Rate limit reached for gpt-5-nano"))).toBeUndefined();
		expect(describeOpenAIRefusal(apiError(500, "The server had an error"))).toBeUndefined();
		expect(describeOpenAIRefusal(new Error("timeout"))).toBeUndefined();
	});

	it("looks through the SDK's retry wrapper", () => {
		const last = apiError(401, "Incorrect API key provided");
		const wrapped = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [last] });
		expect(describeOpenAIRefusal(wrapped)).toBe("invalid_key");
	});
});
