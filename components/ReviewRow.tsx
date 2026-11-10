"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import type { Cue } from "@/types";
import { describeLineLimits, type CueEdit } from "@/lib/review";
import { formatTimestamp } from "@/lib/srt-codec";

interface ReviewRowProps {
  cue: Cue;
  originalCue?: Cue;
  index: number;
  isMisaligned: boolean;
  /** Flagged by the translation QA checks — fixed up or left untranslated, worth review. */
  isFlagged: boolean;
  /** Warn when a line runs past this many characters (the target language's
   * Netflix limit); undefined when Netflix formatting is off. */
  maxLineChars?: number;
  isEven: boolean;
  onApply: (edit: CueEdit) => void;
  onFocusNext: (index: number) => void;
  textareaId: string;
}

export default function ReviewRow({
  cue, originalCue, index, isMisaligned, isFlagged, maxLineChars, isEven,
  onApply, onFocusNext, textareaId,
}: ReviewRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localText, setLocalText] = useState(cue.text);
  const [focused, setFocused] = useState(false);

  // Reset the draft when the cue changes externally (split, insert, delete).
  // Adjusting during render rather than in an effect means the row never
  // paints one frame of the previous cue's text.
  const [syncedText, setSyncedText] = useState(cue.text);
  if (syncedText !== cue.text) {
    setSyncedText(cue.text);
    setLocalText(cue.text);
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, [localText]);

  // Set by Escape for the blur it triggers. That blur runs before the reverted
  // draft has rendered, so the handler below still holds the edited text and
  // would save the very change Escape is discarding.
  const discardOnBlur = useRef(false);

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (discardOnBlur.current) {
      discardOnBlur.current = false;
      return;
    }
    if (localText !== cue.text) onApply({ type: "editText", index, text: localText });
  }, [localText, cue.text, index, onApply]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSplit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textareaRef.current?.blur();
      onFocusNext(index);
    }
    if (e.key === "Escape") {
      discardOnBlur.current = true;
      setLocalText(cue.text);
      textareaRef.current?.blur();
    }
    // Tab is handled natively — moves on to this row's actions, then the next row
  };

  const handleSplit = () => {
    const pos = textareaRef.current?.selectionStart ?? 0;
    if (pos > 0 && pos < localText.length) {
      // The edit carries the current text, so an unsaved change is split
      // correctly instead of being lost to a stale parent state.
      onApply({ type: "split", index, position: pos, text: localText });
    }
  };

  // The line limit comes with a lines-per-subtitle limit; both only apply
  // when Netflix formatting is on, which is what maxLineChars being set means.
  const limitNote = maxLineChars === undefined ? undefined : describeLineLimits(localText, maxLineChars);

  return (
    <div
      className={`group relative flex items-stretch border-l-2 transition-colors ${
        focused
          ? "border-l-blue-500"
          : isMisaligned
          ? "border-l-amber-500"
          : isFlagged
          ? "border-l-blue-400/60"
          : "border-l-transparent"
      } ${isEven ? "bg-[var(--bg-card)]/50" : ""}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 80px" }}
    >
      {/* Cue number (positional, 1-based) */}
      <div className="w-8 sm:w-12 flex-shrink-0 flex flex-col items-center gap-1 pt-2.5 font-mono text-xs text-muted tabular-nums select-none">
        <span>{index + 1}</span>
        {isFlagged && (
          <svg
            className="w-3 h-3 text-blue-400"
            fill="currentColor"
            viewBox="0 0 24 24"
            role="img"
            aria-label="Flagged during translation — worth review"
          >
            <title>Flagged during translation — worth review</title>
            <path d="M4 2.5a1 1 0 011-1h.5a1 1 0 011 1V3h11.6a1 1 0 01.8 1.6L16 9l2.9 4.4a1 1 0 01-.8 1.6H6.5v7a1 1 0 01-1 1H5a1 1 0 01-1-1v-19z" />
          </svg>
        )}
      </div>

      {/* Time. Hidden on a phone: with the number and action columns it left
          the two text columns about 50px each, and the timing is read-only.
          The edited cue's own timing, which is what the download carries: a
          split or an insert gives cues new times, and the original cue at
          the same position belongs to another line from then on. */}
      <div className="hidden sm:flex w-28 flex-shrink-0 items-start pt-2.5 font-mono text-[11px] text-muted tabular-nums select-none">
        <span>{formatTimestamp(cue.start)}</span>
        <span className="mx-0.5 text-muted/50">&rarr;</span>
        <span>{formatTimestamp(cue.end)}</span>
      </div>

      {/* Original */}
      <div className="flex-1 min-w-0 py-2 pr-3">
        <p className="text-sm text-secondary leading-relaxed">{originalCue?.text || "\u2014"}</p>
      </div>

      {/* Translation (always editable) */}
      <div className="flex-1 min-w-0 py-1.5 pr-2 relative">
        <textarea
          ref={textareaRef}
          id={textareaId}
          name={`translation-${index}`}
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          rows={1}
          // The placeholder is no name, and every row's textarea needs its own.
          aria-label={`Translation of cue ${index + 1}`}
          spellCheck={false}
          className="w-full text-sm text-primary leading-relaxed bg-transparent border-0 border-b border-transparent focus:border-b-blue-500/50 focus:bg-[var(--bg-elevated)]/30 rounded-sm px-1.5 py-1 resize-none outline-none transition-colors placeholder:text-muted"
          placeholder="Empty cue"
        />
        {limitNote && (
          <p className="text-[10px] text-amber-400 px-1.5 pb-1 tabular-nums">{limitNote}</p>
        )}
      </div>

      {/* Row actions — visible on hover/focus-within, and in the Tab order so
          insert and delete, which have no shortcut, work from the keyboard.
          A touch screen has no hover to reveal them, so there they always show. */}
      <div className="w-20 flex-shrink-0 flex items-start pt-2 gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
        <button
          onClick={handleSplit}
          aria-label={`Split cue ${index + 1} at cursor`}
          title="Split at cursor"
          className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.165 2.165 0 011.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 11-5.196 3 3 3 0 015.196-3zm1.536-.887a2.165 2.165 0 001.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863l2.077-1.199m0-3.328a4.323 4.323 0 012.068-1.379l5.325-1.628a4.5 4.5 0 012.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.331 4.331 0 0010.607 12m3.736 0l7.794 4.5-.802.215a4.5 4.5 0 01-2.48-.043l-5.326-1.629a4.324 4.324 0 01-2.068-1.379M14.343 12l-2.882 1.664" />
          </svg>
        </button>
        <button
          onClick={() => onApply({ type: "insertBefore", index })}
          aria-label={`Insert cue above cue ${index + 1}`}
          title="Insert above"
          className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <button
          onClick={() => onApply({ type: "delete", index })}
          aria-label={`Delete cue ${index + 1}`}
          title="Delete"
          className="p-1.5 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500/30 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}
