import { describe, expect, it } from "vitest";
import { encodeBlockFrame, encodeStatusFrame } from "@/lib/stream-protocol";
import { readTranslationStream } from "@/lib/translation-stream";
import type { Cue } from "@/types";

const BLOCK_1 = "1\n00:00:01,000 --> 00:00:04,000\nHola";
const BLOCK_2 = "2\n00:00:05,000 --> 00:00:08,000\nMundo";

/** A body that delivers the given strings as separate chunks, then ends or breaks. */
function body(chunks: string[], breakAfter = false): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		pull(controller) {
			const next = chunks.shift();
			if (next !== undefined) controller.enqueue(encoder.encode(next));
			else if (breakAfter) controller.error(new Error("connection reset"));
			else controller.close();
		},
	});
}

const read = (stream: ReadableStream<Uint8Array>, signal = new AbortController().signal) => {
	const batches: Cue[][] = [];
	const events: string[] = [];
	return readTranslationStream(stream, {
		onCues: (batch) => batches.push(batch),
		onEvent: (event) => events.push(event.event),
		signal,
	}).then((received) => ({ received, batches, events }));
};

describe("readTranslationStream", () => {
	it("collects the cues in order and hands each chunk's cues over as a batch", async () => {
		const { received, batches } = await read(body([encodeBlockFrame(BLOCK_1), encodeBlockFrame(BLOCK_2)]));
		expect(received.cues.map((c) => c.text)).toEqual(["Hola", "Mundo"]);
		expect(received.failed).toBe(false);
		expect(batches.map((b) => b.length)).toEqual([1, 1]);
	});

	it("keeps the flagged and untranslated positions and reports every event", async () => {
		const wire =
			encodeStatusFrame({ event: "split_detected", indices: [0] }) +
			encodeBlockFrame(BLOCK_1) +
			encodeStatusFrame({ event: "left_untranslated", indices: [1] }) +
			encodeBlockFrame(BLOCK_2);
		const { received, events } = await read(body([wire]));
		expect([...received.flagged]).toEqual([0, 1]);
		expect([...received.untranslated]).toEqual([1]);
		expect(events).toEqual(["split_detected", "left_untranslated"]);
	});

	it("reports why the translator refused, with whatever arrived before it", async () => {
		const wire = encodeBlockFrame(BLOCK_1) + encodeStatusFrame({ event: "refused", reason: "no_credits" });
		const { received } = await read(body([wire]));
		expect(received.refusal).toBe("no_credits");
		expect(received.cues.map((c) => c.text)).toEqual(["Hola"]);
		// The route ends a refused stream cleanly; the reason is the signal.
		expect(received.failed).toBe(false);
	});

	it("reports no refusal for an ordinary run", async () => {
		const { received } = await read(body([encodeBlockFrame(BLOCK_1)]));
		expect(received.refusal).toBeUndefined();
	});

	it("hands back what arrived when the stream breaks, marked failed", async () => {
		const { received } = await read(body([encodeBlockFrame(BLOCK_1)], true));
		expect(received.cues.map((c) => c.text)).toEqual(["Hola"]);
		expect(received.failed).toBe(true);
	});

	it("rethrows a read error that follows the caller's own abort", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(read(body([encodeBlockFrame(BLOCK_1)], true), controller.signal)).rejects.toThrow("connection reset");
	});
});
