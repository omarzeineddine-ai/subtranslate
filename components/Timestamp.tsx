"use client";

import React, { FC, memo } from "react";
import type { Cue } from "@/types";
import { formatTimestamp } from "@/lib/srt-codec";

interface TimestampProps extends Cue {
  /** Positional 1-based cue number, for display only. */
  index: number;
  originalText?: string;
}

/** One translated cue on the busy screen: original beside translation, with
 * the timing in the margin. Cues only appear here once translated, so there
 * is no pending state to draw. Memoised: the list re-renders on every chunk
 * of the stream, and a row that is already on screen never changes. */
const Timestamp: FC<TimestampProps> = ({ index, start, end, text, originalText }) => {
  return (
    <article
      className="rounded-xl ring-1 ring-[var(--ring)] bg-card p-4"
      aria-label={`Segment ${index}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400"
            aria-hidden="true"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <div className="flex flex-col items-center text-[10px] font-mono text-muted tabular-nums">
            <span>{formatTimestamp(start, "deciseconds")}</span>
            <span className="text-muted">&darr;</span>
            <span>{formatTimestamp(end, "deciseconds")}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 grid md:grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] font-medium text-muted uppercase tracking-wider">Original</span>
            <p className="text-sm text-secondary leading-relaxed mt-0.5">{originalText || text}</p>
          </div>
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400">Translated</span>
            <p className="text-sm text-primary leading-relaxed mt-0.5">{text}</p>
          </div>
        </div>
      </div>
    </article>
  );
};

export default memo(Timestamp);
