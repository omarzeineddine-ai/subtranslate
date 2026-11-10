import { describe, it, expect } from "vitest";
import {
	applyEdit,
	canRedo,
	canUndo,
	createReviewState,
	describeLineLimits,
	firstMisalignedIndex,
	isDirty,
	markDownloaded,
	nextFlaggedIndex,
	redo,
	undo,
	type CueEdit,
	type ReviewState,
} from "@/lib/review";
import { msToTimestamp, parseSrt, serializeSrt, timestampToMs } from "@/lib/srt-codec";
import type { Cue } from "@/types";

const CUES: Cue[] = [
	{ start: "00:00:01,000", end: "00:00:04,000", text: "First cue." },
	{ start: "00:00:05,000", end: "00:00:15,000", text: "Second cue with more text." },
	{ start: "00:00:15,000", end: "00:00:18,000", text: "Third cue." },
];

const fresh = (flags: number[] = []): ReviewState => createReviewState(CUES, flags);

describe("timestampToMs / msToTimestamp", () => {
	it("round-trips SRT timestamps", () => {
		for (const ts of ["00:00:00,000", "00:01:02,345", "01:59:59,999"]) {
			expect(msToTimestamp(timestampToMs(ts)!)).toBe(ts);
		}
	});

	it("accepts a dot as the millisecond separator, normalizing on the way out", () => {
		expect(timestampToMs("00:00:01.500")).toBe(1500);
	});

	it("returns null for malformed timestamps", () => {
		expect(timestampToMs("garbage")).toBeNull();
		expect(timestampToMs("00:00")).toBeNull();
		expect(timestampToMs("")).toBeNull();
	});
});

describe("createReviewState", () => {
	it("starts clean with validated flags", () => {
		const state = createReviewState(CUES, [1, -3, 99]);
		expect(state.cues).toBe(CUES);
		expect(Array.from(state.flags)).toEqual([1]);
		expect(isDirty(state)).toBe(false);
		expect(canUndo(state)).toBe(false);
		expect(canRedo(state)).toBe(false);
	});
});

describe("applyEdit — cue effects", () => {
	it("editText replaces one cue's text and nothing else", () => {
		const out = applyEdit(fresh(), { type: "editText", index: 1, text: "Changed." }).cues;
		expect(out[1].text).toBe("Changed.");
		expect(out[0]).toEqual(CUES[0]);
		expect(out[2]).toEqual(CUES[2]);
		expect(out).toHaveLength(3);
	});

	it("does not mutate the input state or cues", () => {
		const snapshot = structuredClone(CUES);
		const state = fresh([1]);
		applyEdit(state, { type: "editText", index: 0, text: "X" });
		applyEdit(state, { type: "split", index: 1, position: 6, text: CUES[1].text });
		applyEdit(state, { type: "delete", index: 0 });
		expect(CUES).toEqual(snapshot);
		expect(Array.from(state.flags)).toEqual([1]);
		expect(state.past).toHaveLength(0);
	});

	describe("split", () => {
		// "Second cue with more text." (26 chars), split at 13 → ratio 0.5 over
		// the 10s range 5s..15s → midpoint at 10s.
		const out = applyEdit(fresh(), { type: "split", index: 1, position: 13, text: CUES[1].text }).cues;

		it("replaces the cue with two halves of trimmed text", () => {
			expect(out).toHaveLength(4);
			expect(out[1].text).toBe("Second cue wi");
			expect(out[2].text).toBe("th more text.");
		});

		it("divides the time range proportionally to the split position", () => {
			expect(out[1]).toMatchObject({ start: "00:00:05,000", end: "00:00:10,000" });
			expect(out[2]).toMatchObject({ start: "00:00:10,000", end: "00:00:15,000" });
		});

		it("splits the text carried in the edit, so unsaved editor text is not lost", () => {
			const edited = applyEdit(fresh(), { type: "split", index: 0, position: 3, text: "New words" }).cues;
			expect(edited[0].text).toBe("New");
			expect(edited[1].text).toBe("words");
		});

		it("keeps a positioned cue's position on both halves and divides its time", () => {
			const [positioned] = parseSrt("1\n00:00:10,000 --> 00:00:20,000 X1:40 X2:600 Y1:20 Y2:50\nLeft right");
			const halves = applyEdit(createReviewState([positioned]), {
				type: "split",
				index: 0,
				position: 5,
				text: "Left right",
			}).cues;
			expect(halves).toEqual([
				{ start: "00:00:10,000", end: "00:00:15,000", settings: "X1:40 X2:600 Y1:20 Y2:50", text: "Left" },
				{ start: "00:00:15,000", end: "00:00:20,000", settings: "X1:40 X2:600 Y1:20 Y2:50", text: "right" },
			]);
		});

		it("keeps original timestamps on both halves when they are unparsable", () => {
			const weird = createReviewState([{ start: "bad", end: "worse", text: "Some text here" }]);
			const halves = applyEdit(weird, { type: "split", index: 0, position: 4, text: "Some text here" }).cues;
			expect(halves[0]).toMatchObject({ start: "bad", end: "worse" });
			expect(halves[1]).toMatchObject({ start: "bad", end: "worse" });
		});
	});

	describe("insertBefore", () => {
		it("fills the silent gap between neighbours", () => {
			const out = applyEdit(fresh(), { type: "insertBefore", index: 1 }).cues;
			expect(out).toHaveLength(4);
			expect(out[1]).toEqual({ start: "00:00:04,000", end: "00:00:05,000", text: "" });
		});

		it("collapses to zero length when neighbours touch", () => {
			const out = applyEdit(fresh(), { type: "insertBefore", index: 2 }).cues;
			expect(out[2]).toEqual({ start: "00:00:15,000", end: "00:00:15,000", text: "" });
		});

		it("starts from zero when inserting before the first cue", () => {
			const out = applyEdit(fresh(), { type: "insertBefore", index: 0 }).cues;
			expect(out[0]).toEqual({ start: "00:00:00,000", end: "00:00:01,000", text: "" });
		});

		it("appends after the last cue when index equals the length", () => {
			const out = applyEdit(fresh(), { type: "insertBefore", index: CUES.length }).cues;
			expect(out).toHaveLength(4);
			expect(out[3]).toEqual({ start: "00:00:18,000", end: "00:00:18,000", text: "" });
		});
	});

	it("delete removes exactly one cue", () => {
		const out = applyEdit(fresh(), { type: "delete", index: 1 }).cues;
		expect(out.map((c) => c.text)).toEqual(["First cue.", "Third cue."]);
	});

	it("out-of-range edits are no-ops that add no history", () => {
		const state = fresh([2]);
		const edits: CueEdit[] = [
			{ type: "editText", index: 99, text: "X" },
			{ type: "split", index: -1, position: 1, text: "ab" },
			{ type: "delete", index: 3 },
			{ type: "insertBefore", index: 99 },
		];
		for (const edit of edits) {
			expect(applyEdit(state, edit)).toBe(state);
		}
	});

	it("edited lists serialize with sequential numbering — no reindex step needed", () => {
		let state = applyEdit(fresh(), { type: "split", index: 1, position: 13, text: CUES[1].text });
		state = applyEdit(state, { type: "delete", index: 0 });
		const srt = serializeSrt(state.cues);
		expect(srt.startsWith("1\n")).toBe(true);
		expect(srt).toContain("\n\n2\n");
		expect(srt).toContain("\n\n3\n");
	});
});

describe("applyEdit — flag remapping", () => {
	it("keeps flags in place for text edits", () => {
		const state = applyEdit(fresh([1]), { type: "editText", index: 1, text: "X" });
		expect(Array.from(state.flags)).toEqual([1]);
	});

	it("shifts flags down after a delete above them (the flag-drift bug)", () => {
		// Flag on cue 2; delete cue 0 → the flagged cue is now at position 1.
		const state = applyEdit(fresh([2]), { type: "delete", index: 0 });
		expect(Array.from(state.flags)).toEqual([1]);
		expect(state.cues[1].text).toBe("Third cue.");
	});

	it("clears the flag when the flagged cue itself is deleted", () => {
		const state = applyEdit(fresh([1]), { type: "delete", index: 1 });
		expect(state.flags.size).toBe(0);
	});

	it("flags both halves when a flagged cue is split, and shifts later flags", () => {
		const state = applyEdit(fresh([1, 2]), { type: "split", index: 1, position: 13, text: CUES[1].text });
		expect(Array.from(state.flags).sort((a, b) => a - b)).toEqual([1, 2, 3]);
	});

	it("shifts flags up after an insert above them", () => {
		const state = applyEdit(fresh([1]), { type: "insertBefore", index: 0 });
		expect(Array.from(state.flags)).toEqual([2]);
	});
});

describe("undo / redo / dirty", () => {
	it("undo restores cues AND flags; redo replays them", () => {
		const start = fresh([1]);
		const afterDelete = applyEdit(start, { type: "delete", index: 0 });
		expect(Array.from(afterDelete.flags)).toEqual([0]);

		const undone = undo(afterDelete);
		expect(undone.cues).toBe(CUES);
		expect(Array.from(undone.flags)).toEqual([1]);
		expect(canRedo(undone)).toBe(true);

		const redone = redo(undone);
		expect(redone.cues).toEqual(afterDelete.cues);
		expect(Array.from(redone.flags)).toEqual([0]);
	});

	it("isDirty is false at origin, true after an edit, false again after full undo", () => {
		const start = fresh();
		expect(isDirty(start)).toBe(false);
		const edited = applyEdit(start, { type: "editText", index: 0, text: "X" });
		expect(isDirty(edited)).toBe(true);
		const undone = undo(edited);
		expect(isDirty(undone)).toBe(false);
		expect(isDirty(redo(undone))).toBe(true);
	});

	it("isDirty is false once the edited cues are downloaded, and true again after undo", () => {
		const edited = applyEdit(fresh(), { type: "editText", index: 0, text: "X" });
		const saved = markDownloaded(edited);
		expect(isDirty(saved)).toBe(false);
		expect(canUndo(saved)).toBe(true);
		const undone = undo(saved);
		expect(isDirty(undone)).toBe(true);
		expect(isDirty(redo(undone))).toBe(false);
	});

	it("a new edit clears the redo stack", () => {
		const edited = applyEdit(fresh(), { type: "editText", index: 0, text: "X" });
		const undone = undo(edited);
		const branched = applyEdit(undone, { type: "editText", index: 0, text: "Y" });
		expect(canRedo(branched)).toBe(false);
	});

	it("undo/redo at the boundaries are no-ops", () => {
		const state = fresh();
		expect(undo(state)).toBe(state);
		expect(redo(state)).toBe(state);
	});

	it("history is capped: oldest snapshots drop after 50 edits", () => {
		let state = fresh();
		for (let i = 0; i < 60; i++) {
			state = applyEdit(state, { type: "editText", index: 0, text: `v${i}` });
		}
		expect(state.past).toHaveLength(50);
		// Undo all the way back — lands on v9, the oldest surviving snapshot's successor origin.
		while (canUndo(state)) state = undo(state);
		expect(state.cues[0].text).toBe("v9");
		// v9 is not what was downloaded, so the edits are still unsaved.
		expect(isDirty(state)).toBe(true);
	});
});

describe("applyEdit — row ids", () => {
	const idsOf = (state: ReviewState) => [...state.ids];

	it("gives every cue its own id to start", () => {
		expect(idsOf(fresh())).toEqual([0, 1, 2]);
		expect(fresh().ids.length).toBe(fresh().cues.length);
	});

	it("keeps a cue's id through a text edit", () => {
		expect(idsOf(applyEdit(fresh(), { type: "editText", index: 1, text: "changed" }))).toEqual([0, 1, 2]);
	});

	it("keeps the split cue's id on the first half and gives the second a new one", () => {
		const state = applyEdit(fresh(), { type: "split", index: 1, position: 6, text: CUES[1].text });
		expect(idsOf(state)).toEqual([0, 1, 3, 2]);
		expect(state.ids.length).toBe(state.cues.length);
	});

	it("gives an inserted cue a new id and leaves the others in place", () => {
		expect(idsOf(applyEdit(fresh(), { type: "insertBefore", index: 1 }))).toEqual([0, 3, 1, 2]);
	});

	it("drops a deleted cue's id and keeps the rest", () => {
		expect(idsOf(applyEdit(fresh(), { type: "delete", index: 0 }))).toEqual([1, 2]);
	});

	it("never hands an id out twice, even across undo", () => {
		let state = applyEdit(fresh(), { type: "insertBefore", index: 0 });
		state = undo(state);
		state = applyEdit(state, { type: "insertBefore", index: 0 });
		expect(idsOf(state)).toEqual([4, 0, 1, 2]);
	});

	it("undo and redo restore the ids with the cues", () => {
		const edited = applyEdit(fresh(), { type: "delete", index: 1 });
		expect(idsOf(undo(edited))).toEqual([0, 1, 2]);
		expect(idsOf(redo(undo(edited)))).toEqual([0, 2]);
	});
});

describe("firstMisalignedIndex", () => {
	it("is -1 for an untouched file and after text edits", () => {
		expect(firstMisalignedIndex(fresh(), 3)).toBe(-1);
		expect(firstMisalignedIndex(applyEdit(fresh(), { type: "editText", index: 1, text: "x" }), 3)).toBe(-1);
	});

	it("points at a deleted cue's position, not at the end of the list", () => {
		expect(firstMisalignedIndex(applyEdit(fresh(), { type: "delete", index: 0 }), 3)).toBe(0);
	});

	it("points at a split's second half and at an inserted cue", () => {
		const split = applyEdit(fresh(), { type: "split", index: 0, position: 5, text: CUES[0].text });
		expect(firstMisalignedIndex(split, 3)).toBe(1);
		expect(firstMisalignedIndex(applyEdit(fresh(), { type: "insertBefore", index: 1 }), 3)).toBe(1);
	});

	it("points past the last cue of a run that stopped early", () => {
		expect(firstMisalignedIndex(createReviewState(CUES.slice(0, 2)), 3)).toBe(2);
	});

	it("is -1 again once an edit is undone or cancelled out", () => {
		const deleted = applyEdit(fresh(), { type: "delete", index: 1 });
		expect(firstMisalignedIndex(undo(deleted), 3)).toBe(-1);
		const inserted = applyEdit(fresh(), { type: "insertBefore", index: 1 });
		expect(firstMisalignedIndex(applyEdit(inserted, { type: "delete", index: 1 }), 3)).toBe(-1);
	});

	it("still sees a delete and an insert that leave the count unchanged", () => {
		const deleted = applyEdit(fresh(), { type: "delete", index: 2 });
		expect(firstMisalignedIndex(applyEdit(deleted, { type: "insertBefore", index: 1 }), 3)).toBe(1);
	});
});

describe("nextFlaggedIndex", () => {
	it("starts at the first flagged cue when no cue has been visited", () => {
		expect(nextFlaggedIndex([3, 10, 42], -1)).toBe(3);
	});

	it("moves to the first flagged cue below the one the user is on", () => {
		expect(nextFlaggedIndex([3, 10, 42], 3)).toBe(10);
		expect(nextFlaggedIndex([3, 10, 42], 20)).toBe(42);
	});

	it("wraps to the top after the last flagged cue", () => {
		expect(nextFlaggedIndex([3, 10, 42], 42)).toBe(3);
		expect(nextFlaggedIndex([3, 10, 42], 100)).toBe(3);
	});

	it("is undefined when nothing is flagged", () => {
		expect(nextFlaggedIndex([], 5)).toBeUndefined();
	});
});

describe("describeLineLimits", () => {
	it("says nothing for text within both limits", () => {
		expect(describeLineLimits("short\nlines", 42)).toBeUndefined();
	});

	it("names the longest line when one runs past the limit", () => {
		expect(describeLineLimits("x".repeat(50), 42)).toBe("Line exceeds 42 characters (50)");
	});

	it("counts the lines when there are too many", () => {
		expect(describeLineLimits("a\nb\nc", 42)).toBe("3 lines; Netflix allows 2");
	});

	it("joins both notes when both rules are broken", () => {
		expect(describeLineLimits(`${"x".repeat(50)}\nb\nc`, 42)).toBe("Line exceeds 42 characters (50) \u00b7 3 lines; Netflix allows 2");
	});
});
