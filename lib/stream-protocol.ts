import type { SessionEvent } from "@/lib/translate-session";

/**
 * Wire protocol for the translation stream: serialized SRT cue blocks and
 * status frames interleaved on one text stream, separated by blank lines.
 * Both sides of the network import this module — the route encodes, the
 * client decodes. Nothing else may know the framing.
 */

const STATUS_PREFIX = "__STATUS__:";
const FRAME_SEPARATOR = "\n\n";

export type StreamFrame =
	| { kind: "status"; event: SessionEvent }
	| { kind: "block"; text: string };

export function encodeStatusFrame(event: SessionEvent): string {
	return `${STATUS_PREFIX}${JSON.stringify(event)}${FRAME_SEPARATOR}`;
}

export function encodeBlockFrame(block: string): string {
	return `${block}${FRAME_SEPARATOR}`;
}

function decodeFrame(raw: string): StreamFrame | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith(STATUS_PREFIX)) {
		try {
			return { kind: "status", event: JSON.parse(trimmed.slice(STATUS_PREFIX.length)) };
		} catch {
			return null; // malformed status frame — drop it, never surface as SRT
		}
	}
	return { kind: "block", text: trimmed };
}

/**
 * Incremental decoder for the other end of the stream. push() text chunks as
 * they arrive and get back the frames each chunk completed — a frame split
 * across reads is held until its separator arrives. flush() at end-of-stream
 * yields the final unterminated frame, if any.
 */
export function createFrameDecoder() {
	let buffer = "";
	return {
		push(chunk: string): StreamFrame[] {
			buffer += chunk;
			const parts = buffer.split(FRAME_SEPARATOR);
			buffer = parts.pop() ?? "";
			return parts.map(decodeFrame).filter((f): f is StreamFrame => f !== null);
		},
		flush(): StreamFrame[] {
			const frame = decodeFrame(buffer);
			buffer = "";
			return frame ? [frame] : [];
		},
	};
}
