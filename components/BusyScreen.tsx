"use client"

import { TranslationProgress } from "@/components/ProgressBar"
import Timestamp from "@/components/Timestamp"
import { describeRetryStatus, type RetryStatus } from "@/lib/retry-status"
import { formatTimestamp } from "@/lib/srt-codec"
import type { Cue } from "@/types"
import React from "react"

const BUSY_MESSAGES = [
  "Polishing punctuation",
  "Aligning timestamps",
  "Checking line breaks",
  "Verifying segment alignment",
  "Cross-checking each subtitle",
  "Smoothing out phrasing",
  "Preserving timing",
  "Almost there",
] as const

/** Rows the busy screen keeps mounted. The list exists to show the run is
 * moving, and the review editor lists every cue afterwards — so a long file
 * shows its latest rows instead of growing the DOM by a row per cue. */
const LIVE_ROWS = 50

interface Props {
  translatedCues: Cue[]
  originalCues: Cue[]
  targetLanguage: string
  /** The translator's current back-off, so a rate-limited run does not look stalled. */
  retry: RetryStatus | null
  /** The server's reference for the run, shown beside the retry notice. */
  requestRef: string | null
  onCancel: () => void
}

/** The screen shown while a translation runs: a rotating status line, the
 * progress bar, the cue just translated, and a live list of the latest rows.
 * Mounted for one run and unmounted after it, so its own state starts fresh
 * each time. While it is mounted the body is marked busy, which hides the
 * site chrome and locks the viewport. */
export function BusyScreen({ translatedCues, originalCues, targetLanguage, retry, requestRef, onCancel }: Props) {
  const [busyMsgIdx, setBusyMsgIdx] = React.useState(0)
  /** The cue list, kept scrolled to the newest row for as long as the user
   * has not scrolled up to read an earlier one. */
  const liveListRef = React.useRef<HTMLDivElement>(null)
  const followLatest = React.useRef(true)

  // A layout effect, so the list is back at the bottom before the browser
  // reports a scroll: a passive effect runs after the scroll event for its
  // own commit, which sees the new rows below the fold and reads that as the
  // user having scrolled away.
  React.useLayoutEffect(() => {
    const list = liveListRef.current
    if (list && followLatest.current) list.scrollTop = list.scrollHeight
  }, [translatedCues.length])

  React.useEffect(() => {
    const id = setInterval(() => {
      setBusyMsgIdx((i) => (i + 1) % BUSY_MESSAGES.length)
    }, 2500)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    document.body.dataset.busy = "true"
    return () => { delete document.body.dataset.busy }
  }, [])

  const latestIdx = translatedCues.length - 1
  const latest = latestIdx >= 0 ? translatedCues[latestIdx] : null
  const latestOriginal = latestIdx >= 0 ? originalCues[latestIdx] : null
  const firstShown = Math.max(0, translatedCues.length - LIVE_ROWS)
  return (
    <div className="flex flex-col flex-1 overflow-hidden gap-6">
      {/* The busy screen announces only the retry status below. The
          rotating message here, the "just translated" card and the
          cue count all change every few seconds, and as live regions
          they talked over each other for the whole run. */}
      <div className="text-center space-y-3">
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm text-primary ring-1 ring-[var(--ring)]">
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Translating
        </span>
        <h1 className="text-3xl font-light tracking-tight text-primary">
          Translating your subtitles
        </h1>
        <p className="text-secondary text-sm min-h-[1.25rem]">
          <span key={busyMsgIdx} className="inline-block animate-status-swap">
            {BUSY_MESSAGES[busyMsgIdx]}&hellip;
          </span>
          <span className="text-muted"> &middot; auto-downloads when complete</span>
        </p>
      </div>

      <TranslationProgress current={translatedCues.length} total={originalCues.length} language={targetLanguage} />
      {retry && (
        <p className="text-xs text-amber-500 text-center -mt-2" role="status" aria-live="polite">
          {describeRetryStatus(retry)}&hellip;
          {requestRef && <span className="block text-muted select-all mt-0.5">Ref: {requestRef}</span>}
        </p>
      )}

      {/* Live "just translated" preview — re-animates on every new cue */}
      <div
        key={latest ? `${latestIdx}-${latest.start}` : "preview-empty"}
        className="animate-preview-pulse rounded-2xl ring-1 ring-[var(--ring)] bg-card shadow-inset px-5 py-4 max-w-2xl w-full mx-auto"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            {latest ? `Just translated · #${latestIdx + 1}` : "Warming up…"}
          </span>
          {latest && <span className="text-[10px] font-mono text-muted tabular-nums">{formatTimestamp(latestOriginal?.start ?? latest.start, "deciseconds")}</span>}
        </div>
        {latest ? (
          <>
            {latestOriginal?.text && (
              <p className="text-xs text-muted line-clamp-2 mb-1.5">{latestOriginal.text}</p>
            )}
            <p className="text-sm text-primary leading-relaxed line-clamp-2">{latest.text}</p>
          </>
        ) : (
          <p className="text-sm text-secondary">Sending your subtitles to the translator&hellip;</p>
        )}
      </div>

      <div className="flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <h2 className="text-sm text-secondary">Translated segments</h2>
          <div className="flex items-center gap-3">
            {/* Hidden on a phone, where it shared one row with the
                heading and Cancel; the browser's leave prompt still
                guards a refresh there. */}
            <p className="hidden sm:block text-xs text-muted">Don&apos;t refresh &mdash; this may take a few minutes</p>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              Cancel
            </button>
          </div>
        </div>
        <div
          ref={liveListRef}
          onScroll={(e) => {
            const list = e.currentTarget
            followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48
          }}
          className="space-y-2 overflow-y-auto flex-1 min-h-0"
        >
          {firstShown > 0 && (
            <p className="text-xs text-muted text-center py-1">
              Showing the latest {LIVE_ROWS} segments &mdash; all {originalCues.length} open for review when translation finishes
            </p>
          )}
          {translatedCues.slice(firstShown).map((cue, offset) => {
            const i = firstShown + offset
            const orig = originalCues[i]
            return (
              <Timestamp key={`${i}-${cue.start}`} index={i + 1} start={orig?.start ?? cue.start} end={orig?.end ?? cue.end} text={cue.text} originalText={orig?.text} />
            )
          })}
        </div>
      </div>
    </div>
  )
}
