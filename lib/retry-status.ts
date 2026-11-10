import type { SessionEvent } from "@/lib/translate-session";

/**
 * What the busy screen says while the translator is backing off. Without
 * this a rate-limited run just looks stalled: the progress bar stops and
 * nothing explains why. The session's retry events carry the reason and the
 * delay; this module turns them into one line of status.
 */

export interface RetryStatus {
	reason: "rate_limit" | "error";
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	detail: string;
}

/** Fold a session event into the current retry status. Several batches run
 * at once, so the latest retry wins and the first success clears it. */
export function nextRetryStatus(current: RetryStatus | null, event: SessionEvent): RetryStatus | null {
	if (event.event === "retrying") {
		const { reason, attempt, maxAttempts, delayMs, detail } = event;
		return { reason, attempt, maxAttempts, delayMs, detail };
	}
	if (event.event === "retrying_done") return null;
	return current;
}

/** "Rate limited by the translator, retrying in 4s (attempt 2 of 5)", or for
 * any other failure "The translator hit an error (no reply within 30s), …". */
export function describeRetryStatus(status: RetryStatus): string {
	const cause =
		status.reason === "rate_limit"
			? "Rate limited by the translator"
			: `The translator hit an error (${status.detail})`;
	const seconds = Math.max(1, Math.round(status.delayMs / 1000));
	return `${cause}, retrying in ${seconds}s (attempt ${status.attempt} of ${status.maxAttempts})`;
}
