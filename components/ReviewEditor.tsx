"use client";

import React, { useMemo, useCallback, useRef, useEffect, useEffectEvent, useState } from "react";
import type { Cue } from "@/types";
import {
  applyEdit, undo, redo, canUndo, canRedo, isDirty, nextFlaggedIndex, firstMisalignedIndex,
  type CueEdit, type ReviewState,
} from "@/lib/review";
import { netflixLineLimit } from "@/lib/prompts";
import ReviewRow from "./ReviewRow";

interface ReviewEditorProps {
  originalCues: Cue[];
  /** The review session — cues, QA flags, and edit history live in lib/review. */
  state: ReviewState;
  targetLanguage: string;
  /** Warn on lines over the target language's Netflix limit. */
  warnLongLines?: boolean;
  onChange: (state: ReviewState) => void;
  onDownload: () => void;
}

const TOAST_DISMISS_MS = 6000;

/** Whether the visitor is on a Mac, iPhone or iPad, where the split shortcut
 * is written ⌘⏎. The row's key handler takes Ctrl or ⌘ on every platform;
 * only the hint in the bottom bar needs to know which to show. The editor
 * mounts after a run finishes, in the browser only, so there is no server
 * render to disagree with. */
function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** Scroll a review row to the middle of the screen. Smoothly, unless the
 * visitor asked for reduced motion: the stylesheet's reduced-motion rule
 * covers CSS scrolling only, not a scroll started from code. */
function scrollRowIntoView(index: number) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(`row-${index}`)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
}

export default function ReviewEditor({
  originalCues, state, targetLanguage, warnLongLines, onChange, onDownload,
}: ReviewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitShortcut] = useState(() => (isApplePlatform() ? "\u2318\u23CE" : "Ctrl+Enter"));
  const [undoShortcut] = useState(() => (isApplePlatform() ? "\u2318Z" : "Ctrl+Z"));

  const editedCues = state.cues;
  const hasEdits = isDirty(state);
  const origCount = originalCues.length;
  const editCount = editedCues.length;
  const mismatch = origCount - editCount;
  const maxLineChars = warnLongLines ? netflixLineLimit(targetLanguage) : undefined;

  /** Where the Original column stops lining up: the first edit that added
   * or removed a cue, wherever in the list it was made, not the end of the
   * shorter list. -1 while every row still matches. */
  const firstMismatchIndex = useMemo(
    () => firstMisalignedIndex(state, origCount),
    [state, origCount],
  );
  const isAligned = firstMismatchIndex === -1;

  // ─── Toast (component concern; history itself lives in lib/review) ───
  /** The message, and the cue the toast's Undo brings back. */
  const [toast, setToast] = useState<{ message: string; index: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, index: number) => {
    setToast({ message, index });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /** The cue whose text should take focus once the next edit has rendered.
   * A delete removes the row that holds the button it was pressed with, and
   * focus would otherwise fall back to the page, at the top of a long list. */
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    const i = pendingFocus.current;
    if (i === null) return;
    pendingFocus.current = null;
    document.getElementById(`ta-${Math.min(i, editCount - 1)}`)?.focus();
  }, [editedCues, editCount]);

  const handleApply = useCallback((edit: CueEdit) => {
    if (edit.type === "delete") pendingFocus.current = edit.index;
    onChange(applyEdit(state, edit));
    if (edit.type === "delete") showToast(`Cue ${edit.index + 1} deleted`, edit.index);
  }, [state, onChange, showToast]);

  const handleUndo = useCallback(() => {
    setToast(null);
    onChange(undo(state));
  }, [state, onChange]);

  /** Undo from the toast. The toast goes away with the button that was
   * pressed, so focus goes to the cue it brought back rather than the page. */
  const handleToastUndo = useCallback(() => {
    if (toast) pendingFocus.current = toast.index;
    handleUndo();
  }, [toast, handleUndo]);

  const handleRedo = useCallback(() => {
    setToast(null);
    onChange(redo(state));
  }, [state, onChange]);

  // ⌘Z / Ctrl+Z undoes the last cue edit, and ⇧⌘Z, Ctrl+Shift+Z or Ctrl+Y
  // redoes it. Not while typing in a field: there the browser's own undo
  // steps back through the text being written, which is what the user means.
  // An effect event, so the listener is added once: as a closure over the
  // state it was torn down and re-added on every edit.
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, input, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      const wantsRedo = (key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey && !e.shiftKey);
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo(state)) handleUndo();
      } else if (wantsRedo) {
        e.preventDefault();
        if (canRedo(state)) handleRedo();
      }
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => onShortcut(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ─── Focus / navigation ───
  const focusTextarea = useCallback((index: number) => {
    const el = document.getElementById(`ta-${index}`) as HTMLTextAreaElement | null;
    if (el) el.focus();
  }, []);

  const handleFocusNext = useCallback((i: number) => {
    if (i < editCount - 1) focusTextarea(i + 1);
  }, [editCount, focusTextarea]);

  // ─── Flagged-cue review ───
  const flagged = useMemo(
    () => Array.from(state.flags).filter((i) => i >= 0 && i < editCount).sort((a, b) => a - b),
    [state.flags, editCount],
  );
  /** The cue whose text the user was last in. Kept in a ref because the
   * "Next flagged" button takes focus as it is clicked, so by the time it
   * runs no textarea is focused any more. */
  const lastFocusedCue = useRef(-1);

  const trackFocusedCue = useCallback((e: React.FocusEvent) => {
    const match = /^ta-(\d+)$/.exec(e.target.id);
    if (match) lastFocusedCue.current = Number(match[1]);
  }, []);

  const jumpToNextFlagged = useCallback(() => {
    const i = nextFlaggedIndex(flagged, lastFocusedCue.current);
    if (i === undefined) return;
    scrollRowIntoView(i);
    focusTextarea(i);
  }, [flagged, focusTextarea]);

  // Scroll to the first misaligned cue once, when the editor opens on a run
  // that stopped early. Not after an edit: a delete, split or insert moves
  // the boundary too, and following it would carry the user away from the
  // cue they just edited. An effect event, so the effect runs on mount only.
  const scrollToMismatch = useEffectEvent(() => {
    if (firstMismatchIndex > 0) scrollRowIntoView(firstMismatchIndex);
  });
  useEffect(() => scrollToMismatch(), []);

  return (
    <div ref={containerRef} className="flex flex-col" onFocusCapture={trackFocusedCue}>
      {/* Flagged-cue review banner */}
      {flagged.length > 0 && (
        <div
          role="status"
          className="rounded-lg ring-1 ring-blue-500/20 bg-blue-500/5 px-4 py-2.5 flex items-center justify-between gap-3 mb-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18M3 4.5h13.5L13.5 9l3 4.5H3" />
            </svg>
            <p className="text-sm text-blue-400">
              <span className="tabular-nums">{flagged.length}</span> cue{flagged.length === 1 ? "" : "s"} flagged during
              translation &mdash; worth a quick look
            </p>
          </div>
          <button
            onClick={jumpToNextFlagged}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full ring-1 ring-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            Review next
          </button>
        </div>
      )}

      {/* Alignment note — informational, marks only the boundary row */}
      {!isAligned && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg ring-1 ring-amber-500/20 bg-amber-500/5 px-4 py-2.5 flex items-center gap-3 mb-4"
        >
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-amber-400 tabular-nums">
            {mismatch === 0
              ? "Cues were added and removed"
              : `${Math.abs(mismatch)} ${mismatch > 0 ? "fewer" : "more"} cue${Math.abs(mismatch) === 1 ? "" : "s"} than the original`}
            {" "}&mdash; from cue #{firstMismatchIndex + 1} the Original column may be offset
          </p>
        </div>
      )}

      {/* Table header */}
      <div className="flex items-center border-b border-[var(--border)] pb-2 mb-1 text-[10px] font-medium text-muted uppercase tracking-wider select-none">
        <div className="w-8 sm:w-12 flex-shrink-0 text-center">#</div>
        <div className="hidden sm:block w-28 flex-shrink-0">Time</div>
        <div className="flex-1 min-w-0 pr-3">Original</div>
        <div className="flex-1 min-w-0 pr-2">Translation</div>
        <div className="w-20 flex-shrink-0" />
      </div>

      {/* Rows */}
      {/* role="list" on the ul as well: Safari drops a list's semantics once
          its markers are styled away, as the preflight does. Rows are keyed
          by the cue's id, which survives edits above it, so a split, insert
          or delete moves the rows' DOM with their cues instead of handing
          each row the next cue's text. The element id stays positional: the
          scroll and focus helpers address rows by position. */}
      <ul className="divide-y divide-[var(--border)]/50" role="list" aria-label="Translation cues">
        {editedCues.map((cue, i) => (
          <li key={state.ids[i]} id={`row-${i}`}>
            <ReviewRow
              cue={cue}
              originalCue={originalCues[i]}
              index={i}
              isMisaligned={i === firstMismatchIndex}
              isFlagged={state.flags.has(i)}
              maxLineChars={maxLineChars}
              isEven={i % 2 === 0}
              onApply={handleApply}
              onFocusNext={handleFocusNext}
              textareaId={`ta-${i}`}
            />
          </li>
        ))}
      </ul>

      {/* Undo toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-[var(--text)] text-[var(--bg)] pl-4 pr-2 py-1.5 text-sm shadow-lg"
        >
          <span>{toast.message}</span>
          <button
            onClick={handleToastUndo}
            className="font-medium px-2.5 py-1 rounded-full hover:bg-[var(--bg)]/10 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bg)]"
          >
            Undo
          </button>
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 border-t border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-xl mt-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="tabular-nums">{editCount} {editCount === 1 ? "cue" : "cues"}</span>
            <span className="hidden sm:inline">&middot;</span>
            <span className="hidden sm:inline">{targetLanguage}</span>
            <span className="hidden md:inline">&middot;</span>
            <span className="hidden md:inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-elevated text-[10px] font-mono">Enter</kbd> next
              <kbd className="px-1 py-0.5 rounded bg-elevated text-[10px] font-mono ml-2">Esc</kbd> revert
              <kbd className="px-1 py-0.5 rounded bg-elevated text-[10px] font-mono ml-2">{splitShortcut}</kbd> split
              <kbd className="hidden lg:inline px-1 py-0.5 rounded bg-elevated text-[10px] font-mono ml-2">{undoShortcut}</kbd>
              <span className="hidden lg:inline">undo</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* The full line needs the room a wide screen has; on a phone a
                dot on the button says the same thing. */}
            {hasEdits && (
              <span className="hidden sm:inline text-xs text-amber-400/90">
                Edits aren&apos;t in the downloaded file yet
              </span>
            )}
            <button
              onClick={handleUndo}
              disabled={!canUndo(state)}
              className="text-xs px-4 py-2 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] disabled:opacity-40 disabled:hover:text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo(state)}
              className="text-xs px-4 py-2 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] disabled:opacity-40 disabled:hover:text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              Redo
            </button>
            <button
              onClick={onDownload}
              aria-label={hasEdits ? "Re-download SRT; edits aren't in the downloaded file yet" : undefined}
              className="relative inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-5 py-2 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              {hasEdits && (
                <span aria-hidden="true" className="sm:hidden absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-[var(--bg)]" />
              )}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {hasEdits ? "Re-download SRT" : "Download SRT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
