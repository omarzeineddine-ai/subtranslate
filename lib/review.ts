import { NETFLIX_MAX_LINES } from "@/lib/prompts";
import { msToTimestamp, timestampToMs } from "@/lib/srt-codec";
import type { Cue } from "@/types";

/**
 * Review-edit module: the full state of a review session — the cue list, the
 * QA flags pointing into it, and the edit history — behind one interface.
 *
 * Flags are positional, and structural edits shift positions; every edit
 * therefore remaps the flag set so a flag keeps pointing at the cue it was
 * raised for. Each cue also carries an id that no edit changes, so the
 * editor can key its rows by something that survives a split, an insert or
 * a delete above. History snapshots cues, ids AND flags together, so undo
 * restores all three. Cue numbers stay out of all of this — the codec
 * assigns them positionally at serialization.
 *
 * Timing rules:
 * - split divides the cue's time range proportionally to the text split
 *   position; if the timestamps are unparsable, both halves keep them as-is.
 * - insertBefore creates a blank cue spanning the silent gap between its
 *   neighbours (previous cue's end → next cue's start), collapsing to a
 *   zero-length range when the neighbours touch or overlap.
 */

export type CueEdit =
	| { type: "editText"; index: number; text: string }
	/** Split at `position` within `text` (the editor's current, possibly
	 * unsaved text — carried in the edit so a pending change is never lost). */
	| { type: "split"; index: number; position: number; text: string }
	| { type: "insertBefore"; index: number }
	| { type: "delete"; index: number };

interface Snapshot {
	cues: Cue[];
	ids: readonly number[];
	flags: ReadonlySet<number>;
}

export interface ReviewState {
	cues: Cue[];
	/** One id per cue, in the cue's position. A cue keeps its id through
	 * every edit; a split's second half and an inserted cue get new ones. */
	ids: readonly number[];
	/** The next id to hand out; never reused, so undo and redo cannot make
	 * two cues share one. */
	nextId: number;
	/** QA-flagged cue positions, kept in step with every edit. */
	flags: ReadonlySet<number>;
	past: readonly Snapshot[];
	future: readonly Snapshot[];
	/** The cue list last written to a downloaded file. Edits and undo swap
	 * whole arrays, so comparing by reference tells whether the file the user
	 * holds matches what is on screen. */
	downloaded: Cue[];
}

const HISTORY_LIMIT = 50;

export function createReviewState(cues: Cue[], flags: Iterable<number> = []): ReviewState {
	const valid = new Set<number>();
	for (const i of flags) {
		if (i >= 0 && i < cues.length) valid.add(i);
	}
	return {
		cues,
		ids: cues.map((_, i) => i),
		nextId: cues.length,
		flags: valid,
		past: [],
		future: [],
		downloaded: cues,
	};
}

export function canUndo(state: ReviewState): boolean {
	return state.past.length > 0;
}

export function canRedo(state: ReviewState): boolean {
	return state.future.length > 0;
}

/**
 * The flagged cue to visit after cue `from`: the first one below it, or,
 * past the last, the first one from the top. `flagged` is sorted ascending.
 * Starting from the cue the user is on, rather than counting button presses,
 * keeps "Next flagged" moving down from wherever they have scrolled or
 * clicked to, and stays right after splits and deletes renumber the cues.
 * `from` is -1 when no cue has been visited yet. Undefined when nothing is
 * flagged.
 */
export function nextFlaggedIndex(flagged: readonly number[], from: number): number | undefined {
	return flagged.find((i) => i > from) ?? flagged[0];
}

/**
 * The first position where the edited cue is no longer the original cue at
 * that position, or -1 when every row still lines up with the original
 * file of `originalCount` cues. Cues start with ids equal to their original
 * positions and keep them through every edit, so the first id out of place
 * is where a delete, split or insert was made, wherever in the list that
 * is; a run that stopped early lines up up to where it stopped.
 */
export function firstMisalignedIndex(state: ReviewState, originalCount: number): number {
	const length = Math.max(state.ids.length, originalCount);
	for (let i = 0; i < length; i++) {
		if (state.ids[i] !== i || i >= originalCount) return i;
	}
	return -1;
}

/** True when the cue list differs from the one last downloaded. */
export function isDirty(state: ReviewState): boolean {
	return state.cues !== state.downloaded;
}

/** Record that the current cue list has been written to a downloaded file. */
export function markDownloaded(state: ReviewState): ReviewState {
	return state.downloaded === state.cues ? state : { ...state, downloaded: state.cues };
}

export function applyEdit(state: ReviewState, edit: CueEdit): ReviewState {
	const cues = applyCueEdit(state.cues, edit);
	if (cues === state.cues) return state; // out-of-range edit — no-op

	const snapshot: Snapshot = { cues: state.cues, ids: state.ids, flags: state.flags };
	const past = state.past.length >= HISTORY_LIMIT
		? [...state.past.slice(1), snapshot]
		: [...state.past, snapshot];
	const { ids, nextId } = applyIdEdit(state.ids, state.nextId, edit);

	return { ...state, cues, ids, nextId, flags: remapFlags(state.flags, edit), past, future: [] };
}

export function undo(state: ReviewState): ReviewState {
	const previous = state.past[state.past.length - 1];
	if (!previous) return state;
	return {
		...state,
		cues: previous.cues,
		ids: previous.ids,
		flags: previous.flags,
		past: state.past.slice(0, -1),
		future: [{ cues: state.cues, ids: state.ids, flags: state.flags }, ...state.future],
	};
}

export function redo(state: ReviewState): ReviewState {
	const next = state.future[0];
	if (!next) return state;
	return {
		...state,
		cues: next.cues,
		ids: next.ids,
		flags: next.flags,
		past: [...state.past, { cues: state.cues, ids: state.ids, flags: state.flags }],
		future: state.future.slice(1),
	};
}

/** Move ids with the cues they belong to. The first half of a split keeps
 * the cue's id, so the row the user is typing in stays theirs. */
function applyIdEdit(
	ids: readonly number[],
	nextId: number,
	edit: CueEdit,
): { ids: readonly number[]; nextId: number } {
	switch (edit.type) {
		case "editText":
			return { ids, nextId };
		case "split":
			return { ids: [...ids.slice(0, edit.index + 1), nextId, ...ids.slice(edit.index + 1)], nextId: nextId + 1 };
		case "insertBefore":
			return { ids: [...ids.slice(0, edit.index), nextId, ...ids.slice(edit.index)], nextId: nextId + 1 };
		case "delete":
			return { ids: ids.filter((_, i) => i !== edit.index), nextId };
	}
}

/** Shift flags with the positions they point at. A split flags both halves;
 * deleting a flagged cue clears its flag. */
function remapFlags(flags: ReadonlySet<number>, edit: CueEdit): ReadonlySet<number> {
	switch (edit.type) {
		case "editText":
			return flags;
		case "split": {
			const out = new Set<number>();
			for (const f of flags) {
				if (f < edit.index) out.add(f);
				else if (f === edit.index) { out.add(f); out.add(f + 1); }
				else out.add(f + 1);
			}
			return out;
		}
		case "insertBefore": {
			const out = new Set<number>();
			for (const f of flags) out.add(f >= edit.index ? f + 1 : f);
			return out;
		}
		case "delete": {
			const out = new Set<number>();
			for (const f of flags) {
				if (f === edit.index) continue;
				out.add(f > edit.index ? f - 1 : f);
			}
			return out;
		}
	}
}

/** Returns the same array reference when the edit is out of range. */
function applyCueEdit(cues: Cue[], edit: CueEdit): Cue[] {
	switch (edit.type) {
		case "editText": {
			if (!cues[edit.index]) return cues;
			return cues.map((cue, i) => (i === edit.index ? { ...cue, text: edit.text } : cue));
		}

		case "split": {
			const cue = cues[edit.index];
			if (!cue) return cues;
			const before = edit.text.slice(0, edit.position).trim();
			const after = edit.text.slice(edit.position).trim();
			const ratio = edit.text.length > 0 ? Math.min(Math.max(edit.position / edit.text.length, 0), 1) : 0.5;
			const [firstTiming, secondTiming] = splitTiming(cue, ratio);
			const result = [...cues];
			result.splice(
				edit.index,
				1,
				{ ...cue, ...firstTiming, text: before },
				{ ...cue, ...secondTiming, text: after },
			);
			return result;
		}

		case "insertBefore": {
			if (edit.index < 0 || edit.index > cues.length) return cues;
			const prev = cues[edit.index - 1];
			const next = cues[edit.index];
			const start = prev?.end ?? "00:00:00,000";
			let end = next?.start ?? start;
			const startMs = timestampToMs(start);
			const endMs = timestampToMs(end);
			if (startMs === null || endMs === null || endMs < startMs) end = start;
			const result = [...cues];
			result.splice(edit.index, 0, { start, end, text: "" });
			return result;
		}

		case "delete": {
			if (!cues[edit.index]) return cues;
			return cues.filter((_, i) => i !== edit.index);
		}
	}
}

function splitTiming(
	cue: Cue,
	ratio: number,
): [{ start: string; end: string }, { start: string; end: string }] {
	const startMs = timestampToMs(cue.start);
	const endMs = timestampToMs(cue.end);
	if (startMs === null || endMs === null || endMs <= startMs) {
		return [
			{ start: cue.start, end: cue.end },
			{ start: cue.start, end: cue.end },
		];
	}
	const mid = msToTimestamp(startMs + (endMs - startMs) * ratio);
	return [
		{ start: cue.start, end: mid },
		{ start: mid, end: cue.end },
	];
}

/**
 * The note shown under a cue's text when Netflix formatting is on and the
 * text breaks its rules: a line over `maxLineChars`, more than the allowed
 * number of lines, or both. Undefined when the text is within them.
 */
export function describeLineLimits(text: string, maxLineChars: number): string | undefined {
	const lines = text.split("\n");
	const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
	const notes: string[] = [];
	if (longest > maxLineChars) notes.push(`Line exceeds ${maxLineChars} characters (${longest})`);
	if (lines.length > NETFLIX_MAX_LINES) notes.push(`${lines.length} lines; Netflix allows ${NETFLIX_MAX_LINES}`);
	return notes.length ? notes.join(" \u00b7 ") : undefined;
}
