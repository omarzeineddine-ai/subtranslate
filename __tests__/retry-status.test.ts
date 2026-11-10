import { describe, it, expect } from "vitest";
import { describeRetryStatus, nextRetryStatus, type RetryStatus } from "@/lib/retry-status";

const retry = (overrides: Partial<RetryStatus> = {}): RetryStatus => ({
	reason: "rate_limit",
	attempt: 1,
	maxAttempts: 5,
	delayMs: 2000,
	detail: "server returned 503",
	...overrides,
});

describe("nextRetryStatus", () => {
	it("records a retry event", () => {
		expect(nextRetryStatus(null, { event: "retrying", ...retry() })).toEqual(retry());
	});

	it("replaces an older retry with the latest one", () => {
		const later = retry({ attempt: 2, delayMs: 4000, reason: "error" });
		expect(nextRetryStatus(retry(), { event: "retrying", ...later })).toEqual(later);
	});

	it("clears the status when a retry succeeds", () => {
		expect(nextRetryStatus(retry(), { event: "retrying_done" })).toBeNull();
	});

	it("leaves the status alone for unrelated events", () => {
		expect(nextRetryStatus(retry(), { event: "split_detected", indices: [3] })).toEqual(retry());
		expect(nextRetryStatus(null, { event: "per_segment_fallback", indices: [3] })).toBeNull();
	});
});

describe("describeRetryStatus", () => {
	it("explains a rate limit with the delay in whole seconds", () => {
		expect(describeRetryStatus(retry({ delayMs: 4200, attempt: 2 }))).toBe(
			"Rate limited by the translator, retrying in 4s (attempt 2 of 5)",
		);
	});

	it("explains a transient error and never says zero seconds", () => {
		expect(describeRetryStatus(retry({ reason: "error", delayMs: 300 }))).toBe(
			"The translator hit an error (server returned 503), retrying in 1s (attempt 1 of 5)",
		);
	});
});
