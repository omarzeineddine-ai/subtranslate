/**
 * Reads the translate route's response stream into cues. The route sends
 * one block frame per cue and status frames in between; this collects the
 * cues, keeps the positions the QA checks flagged, and hands each chunk's
 * cues to the caller as they arrive so a live list can show them.
 */

import { parseSrt } from "@/lib/srt-codec";
import { createFrameDecoder, type StreamFrame } from "@/lib/stream-protocol";
import type { RefusalReason, SessionEvent } from "@/lib/translate-session";
import type { Cue } from "@/types";

export interface ReceivedTranslation {
	cues: Cue[];
	/** Positions the translation QA checks flagged (untranslated pass-through,
	 * suspected split/merge, a slot left blank). The session already rebased
	 * them to whole-file positions; the review editor points the user at them. */
	flagged: Set<number>;
	/** Positions the translator gave up on: they arrive carrying their
	 * original text, so they are flagged for review and counted for the banner. */
	untranslated: Set<number>;
	/** Why the translator refused the key, when it did: the run ended there,
	 * and the user has to fix the key rather than try again. */
	refusal?: RefusalReason | "unknown";
	/** True when the stream broke part-way. Whatever arrived is still a
	 * valid partial translation, so it is handed back rather than dropped. */
	failed: boolean;
}

export interface StreamHandlers {
	/** Cues decoded from one chunk, in one call rather than one per cue. */
	onCues: (batch: Cue[]) => void;
	/** Every status frame, for the retry notice. */
	onEvent: (event: SessionEvent) => void;
	/** The request's signal: a read error after the caller aborted is the
	 * abort itself and is rethrown, not reported as a broken stream. */
	signal: AbortSignal;
}

export async function readTranslationStream(
	body: ReadableStream<Uint8Array>,
	{ onCues, onEvent, signal }: StreamHandlers,
): Promise<ReceivedTranslation> {
	const reader = body.getReader();
	const textDecoder = new TextDecoder();
	const frameDecoder = createFrameDecoder();
	const cues: Cue[] = [];
	const flagged = new Set<number>();
	const untranslated = new Set<number>();
	let refusal: ReceivedTranslation["refusal"];

	let arrived: Cue[] = [];
	const showArrived = () => {
		if (!arrived.length) return;
		const batch = arrived;
		arrived = [];
		onCues(batch);
	};

	const handleFrame = (frame: StreamFrame) => {
		if (frame.kind === "status") {
			const event = frame.event;
			onEvent(event);
			if (
				(event.event === "untranslated_detected" ||
					event.event === "language_drift_detected" ||
					event.event === "split_detected" ||
					event.event === "merge_detected" ||
					event.event === "empty_detected") &&
				event.indices
			) {
				for (const i of event.indices) flagged.add(i);
			}
			if (event.event === "refused") refusal = event.reason;
			if (event.event === "left_untranslated" && event.indices) {
				for (const i of event.indices) { flagged.add(i); untranslated.add(i); }
			}
			return;
		}
		const [cue] = parseSrt(frame.text);
		if (cue) { cues.push(cue); arrived.push(cue); }
	};

	let failed = false;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			for (const frame of frameDecoder.push(textDecoder.decode(value, { stream: true }))) handleFrame(frame);
			showArrived();
		}
	} catch (error) {
		if (signal.aborted) throw error;
		failed = true;
	}
	for (const frame of frameDecoder.flush()) handleFrame(frame);
	showArrived();
	return { cues, flagged, untranslated, failed, ...(refusal ? { refusal } : {}) };
}
