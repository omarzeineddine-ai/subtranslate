import { describe, it, expect } from "vitest";
import {
	createFrameDecoder,
	encodeBlockFrame,
	encodeStatusFrame,
	type StreamFrame,
} from "@/lib/stream-protocol";

const BLOCK_1 = "1\n00:00:01,000 --> 00:00:04,000\nHola";
const BLOCK_2 = "2\n00:00:05,000 --> 00:00:08,000\nMundo";

function decodeAll(chunks: string[]): StreamFrame[] {
	const decoder = createFrameDecoder();
	const frames = chunks.flatMap((c) => decoder.push(c));
	return frames.concat(decoder.flush());
}

describe("stream protocol", () => {
	it("round-trips blocks and status frames in order", () => {
		const wire =
			encodeBlockFrame(BLOCK_1) +
			encodeStatusFrame({ event: "retrying_done" }) +
			encodeBlockFrame(BLOCK_2);
		expect(decodeAll([wire])).toEqual([
			{ kind: "block", text: BLOCK_1 },
			{ kind: "status", event: { event: "retrying_done" } },
			{ kind: "block", text: BLOCK_2 },
		]);
	});

	it("preserves status event payloads through encoding", () => {
		const event = {
			event: "retrying",
			attempt: 2,
			maxAttempts: 8,
			delayMs: 3000,
			reason: "rate_limit",
			detail: "server returned 429",
		} as const;
		const [frame] = decodeAll([encodeStatusFrame(event)]);
		expect(frame).toEqual({ kind: "status", event });
	});

	it("reassembles a frame split across arbitrary chunk boundaries", () => {
		const wire = encodeBlockFrame(BLOCK_1) + encodeStatusFrame({ event: "retrying_done" });
		for (const cut of [1, 5, BLOCK_1.length, wire.length - 3]) {
			const frames = decodeAll([wire.slice(0, cut), wire.slice(cut)]);
			expect(frames).toEqual([
				{ kind: "block", text: BLOCK_1 },
				{ kind: "status", event: { event: "retrying_done" } },
			]);
		}
	});

	it("does not split a multi-line cue on its internal single newlines", () => {
		const multiline = "1\n00:00:01,000 --> 00:00:04,000\nLine one\nLine two";
		const frames = decodeAll([encodeBlockFrame(multiline)]);
		expect(frames).toEqual([{ kind: "block", text: multiline }]);
	});

	it("flush yields a trailing block that never got its separator", () => {
		const decoder = createFrameDecoder();
		expect(decoder.push(BLOCK_1)).toEqual([]);
		expect(decoder.flush()).toEqual([{ kind: "block", text: BLOCK_1 }]);
		// flush resets: nothing left afterwards
		expect(decoder.flush()).toEqual([]);
	});

	it("drops malformed status frames instead of surfacing them as SRT", () => {
		const frames = decodeAll(["__STATUS__:{not json\n\n", encodeBlockFrame(BLOCK_1)]);
		expect(frames).toEqual([{ kind: "block", text: BLOCK_1 }]);
	});

	it("ignores empty frames from consecutive separators", () => {
		expect(decodeAll(["\n\n\n\n" + encodeBlockFrame(BLOCK_1)])).toEqual([
			{ kind: "block", text: BLOCK_1 },
		]);
	});
});
