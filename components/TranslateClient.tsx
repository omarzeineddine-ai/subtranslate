"use client"

import Form from "@/components/Form"
import { BusyScreen } from "@/components/BusyScreen"
import ReviewEditor from "@/components/ReviewEditor"
import { describeRefusal } from "@/lib/api-key"
import { translatedFilename } from "@/lib/download-name"
import { triggerFileDownload } from "@/lib/file-download"
import { nextRetryStatus, type RetryStatus } from "@/lib/retry-status"
import { createReviewState, isDirty, markDownloaded, type ReviewState } from "@/lib/review"
import { isContentTooLarge, type TranslationRequest } from "@/lib/translation-request"
import { parseSrt, serializeSrt } from "@/lib/srt-codec"
import { readTranslationStream } from "@/lib/translation-stream"
import type { Cue } from "@/types"
import Link from "next/link"
import React from "react"
import { useApiKey } from "./useApiKey"
import { useLeaveGuard } from "./useLeaveGuard"

/** Why the route rejected a request, and whether what it wants is a key. */
interface RequestFailure {
  message: string
  /** The server has no key of its own and the request brought none. */
  keyRequired: boolean
}

/** The route answers a rejected request with `{ error }` (unsupported
 * language, oversized file, no API key); show that reason when it is there
 * rather than a generic failure. */
async function describeRequestFailure(response: Response): Promise<RequestFailure> {
  // The platform rejects an oversized body before the route runs, so the
  // answer carries no `{ error }` to read.
  if (response.status === 413) return { message: "This file is too large to translate.", keyRequired: false }
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown }
    if (body.code === "key_required") {
      return { message: "Add your OpenAI API key below to translate.", keyRequired: true }
    }
    // The reason stands on its own: for an unsupported language or a
    // malformed key, trying again changes nothing.
    if (typeof body.error === "string" && body.error.trim()) {
      return { message: `${body.error.trim().replace(/\.$/, "")}.`, keyRequired: false }
    }
  } catch {
    // Not JSON (a proxy error page, an empty body): fall through.
  }
  return { message: "Translation request failed. Please try again.", keyRequired: false }
}

/** What went wrong with the last run, shown inline: an error sits above the
 * form, a warning sits in the completion banner beside the partial file. */
type Notice = { kind: "error" | "warning"; message: string }

/** The question asked before anything throws review edits away. One wording
 * for every exit, so the user always knows what is at stake. */
const DISCARD_EDITS_PROMPT = "Your review edits aren't in the downloaded file yet. Discard them?"

export default function TranslateClient() {
  const [status, setStatus] = React.useState<"idle" | "busy" | "done">("idle")
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [translatedCues, setTranslatedCues] = React.useState<Cue[]>([])
  const [originalCues, setOriginalCues] = React.useState<Cue[]>([])
  const [review, setReview] = React.useState<ReviewState | null>(null)
  const [downloadFilename, setDownloadFilename] = React.useState("")
  const [targetLanguage, setTargetLanguage] = React.useState("")
  const [netflixMode, setNetflixMode] = React.useState(false)
  /** The translator's current back-off, so a rate-limited run does not look stalled. */
  const [retry, setRetry] = React.useState<RetryStatus | null>(null)
  /** The server's reference for the current run (its Vercel request ID),
   * shown beside retry and failure messages so a reported screenshot can be
   * matched to the server logs. */
  const [requestRef, setRequestRef] = React.useState<string | null>(null)
  /** Whether the visitor has to bring their own OpenAI key. The server says
   * so up front; until it answers the form assumes not, and a request that
   * turns out to need one is told so and flips this. */
  const [keyRequired, setKeyRequired] = React.useState(false)
  const apiKey = useApiKey()
  React.useEffect(() => {
    let current = true
    fetch("/api")
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { keyRequired?: unknown } | null) => {
        if (current && config?.keyRequired === true) setKeyRequired(true)
      })
      .catch(() => {
        // Not knowing is fine: the request itself reports a missing key.
      })
    return () => { current = false }
  }, [])
  /** Controller for the in-flight request; aborting it stops the server-side
   * session too, since the route hands the request signal to the session. */
  const abortRef = React.useRef<AbortController | null>(null)
  /** Review edits the user would lose by leaving: the downloaded file
   * predates them. */
  const unsavedEdits = status === "done" && review !== null && isDirty(review)
  useLeaveGuard({ busy: status === "busy", unsavedEdits, prompt: DISCARD_EDITS_PROMPT })

  async function handleSubmit(request: TranslationRequest, filename: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (!request.content) return
      if (isContentTooLarge(request.content)) {
        setNotice({ kind: "error", message: "This file is too large to translate." })
        return
      }
      setNotice(null)
      setStatus("busy"); setTargetLanguage(request.language); setNetflixMode(request.netflixFormat)
      setRetry(null); setRequestRef(null)
      setTranslatedCues([]); setOriginalCues([]); setReview(null)
      setDownloadFilename("")

      // Same validity rule as the server: parse with the codec, drop empty-text
      // cues. Keeping the two sides on one parser is what keeps the review
      // editor's alignment counts honest.
      const cues = parseSrt(request.content).filter((cue) => cue.text.trim())
      if (!cues.length) { setStatus("idle"); setNotice({ kind: "error", message: "No subtitle cues were found in this file." }); return }
      setOriginalCues(cues)

      const resp = await fetch("/api", {
        method: "POST",
        body: JSON.stringify(request),
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      })
      const ref = resp.headers.get("X-Request-Ref")
      setRequestRef(ref)
      const withRef = (message: string) => (ref ? `${message} (Ref: ${ref})` : message)
      if (resp.ok) {
        const received = resp.body
          ? await readTranslationStream(resp.body, {
              onCues: (batch) => setTranslatedCues((prev) => prev.concat(batch)),
              onEvent: (event) => setRetry((current) => nextRetryStatus(current, event)),
              signal: controller.signal,
            })
          : null
        const fname = translatedFilename(filename, request.language)
        setDownloadFilename(fname)
        // The server sends one block per cue it was given, so a shortfall
        // means the run was cut off. A read error is the usual sign, but a
        // connection that is closed rather than broken (a proxy or platform
        // time limit ending the response) can end the stream cleanly, and
        // the partial file would then pass for a complete one. Count instead
        // of trusting how the stream ended.
        const stoppedEarly = received !== null && (received.failed || received.cues.length < cues.length)
        const leftUntranslated = received
          ? received.cues.filter((_, i) => received.untranslated.has(i)).length
          : 0
        // OpenAI turned the key away. With the site's key there is nothing to
        // retry: from here on the visitor needs their own.
        const refusal = received?.refusal ? describeRefusal(received.refusal, Boolean(request.apiKey)) : null
        if (refusal && !request.apiKey) setKeyRequired(true)
        if (refusal && received && !received.cues.length) {
          setStatus("idle")
          setNotice({ kind: "error", message: withRef(refusal) })
        }
        else if (received && received.cues.length && leftUntranslated === received.cues.length) {
          // Every cue came back in its original text (the translator is down
          // or rejecting the key): that is a failed run, not a file to hand over.
          setStatus("idle")
          setNotice({ kind: "error", message: withRef("The translator could not translate this file. Please try again later.") })
        }
        else if (received && received.cues.length) {
          setReview(createReviewState(received.cues, received.flagged))
          // Auto-download immediately
          triggerFileDownload(fname, serializeSrt(received.cues))
          setStatus("done")
          const warnings: string[] = []
          if (stoppedEarly) {
            warnings.push(`Translation stopped early after ${received.cues.length} of ${cues.length} cues. The partial file was downloaded.`)
          }
          if (refusal) warnings.push(refusal)
          if (leftUntranslated > 0) {
            warnings.push(`${leftUntranslated} ${leftUntranslated === 1 ? "cue" : "cues"} could not be translated and ${leftUntranslated === 1 ? "keeps its" : "keep their"} original text. They are flagged below.`)
          }
          if (warnings.length) setNotice({ kind: "warning", message: withRef(warnings.join(" ")) })
        }
        else {
          setStatus("idle")
          setNotice({
            kind: "error",
            message: withRef(stoppedEarly ? "Translation failed before any cues were translated." : "Error reading the translation."),
          })
        }
      } else {
        const failure = await describeRequestFailure(resp)
        if (failure.keyRequired) setKeyRequired(true)
        setStatus("idle")
        // A missing key is the visitor's next step, not a fault to report.
        setNotice({ kind: "error", message: failure.keyRequired ? failure.message : withRef(failure.message) })
      }
    } catch {
      // A cancelled run already reset the UI; a stale rejection must not
      // clobber whatever the user started next.
      if (controller.signal.aborted) return
      setStatus("idle")
      setNotice({ kind: "error", message: "Translation failed. Check your connection and try again." })
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const cancel = () => {
    // A long file can be minutes in; one stray click should not throw all of
    // that away. Nothing has arrived yet means nothing to lose, so no prompt.
    const done = translatedCues.length
    if (done > 0 && !window.confirm(`Stop translating? The ${done} ${done === 1 ? "cue" : "cues"} translated so far will be lost.`)) return
    abortRef.current?.abort()
    abortRef.current = null
    reset()
  }

  const handleRedownload = () => {
    if (!review) return
    triggerFileDownload(downloadFilename, serializeSrt(review.cues))
    setReview(markDownloaded(review))
  }

  // "Translate another" swaps the review screen for an empty form, and with
  // it every edit the user has not re-downloaded. The browser's own leave
  // prompt never fires here (nothing unloads), so ask in its place.
  const translateAnother = () => {
    if (unsavedEdits && !window.confirm(DISCARD_EDITS_PROMPT)) return
    reset()
  }

  const reset = () => {
    setStatus("idle"); setNotice(null); setTranslatedCues([]); setOriginalCues([])
    setReview(null); setDownloadFilename("")
    setTargetLanguage(""); setNetflixMode(false)
  }

  return (
    <main id="main" className={`max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full grow ${status === "busy" ? "flex-1 overflow-hidden flex flex-col py-8" : "py-8"}`}>

        {/* ─── IDLE ─── */}
        {/* Hidden rather than unmounted while a run is busy: the form holds the
            picked file, the context and the options, and a run that fails or is
            cancelled should come back to them, not to an empty form. A finished
            run does unmount it, so "Translate another" starts clean. */}
        {status !== "done" && (
          <div className={`space-y-8 max-w-xl mx-auto py-12 ${status === "busy" ? "hidden" : ""}`}>
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-light tracking-tight text-primary">
                Translate your subtitles
              </h1>
              <p className="text-secondary text-sm">Upload an SRT or VTT file and select a target language to get started.</p>
            </div>
            {notice && (
              <div role="alert" className="rounded-xl ring-1 ring-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                {notice.message}
              </div>
            )}
            <div className="rounded-3xl ring-1 ring-[var(--ring)] bg-card shadow-inset p-6 sm:p-8">
              <Form onSubmit={handleSubmit} onFileChange={() => setNotice(null)} keyRequired={keyRequired} apiKey={apiKey} />
            </div>

            <div className="flex items-start gap-3 rounded-xl ring-1 ring-[var(--ring)] bg-elevated/40 px-4 py-3 text-xs text-secondary">
              <svg
                className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="leading-relaxed">
                Subtitle files with HTML tags, ASS overrides, or speaker labels can occasionally cause translation issues.
                <br />
                If something looks off, try running your file through the{" "}
                <Link
                  href="/clean"
                  className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  SRT Cleaner
                </Link>{" "}
                first, it strips noisy formatting in your browser.
              </p>
            </div>
          </div>
        )}

        {status === "busy" && (
          <BusyScreen
            translatedCues={translatedCues}
            originalCues={originalCues}
            targetLanguage={targetLanguage}
            retry={retry}
            requestRef={requestRef}
            onCancel={cancel}
          />
        )}

        {/* ─── DONE ─── */}
        {status === "done" && review && (
          <div className="space-y-6">
            {/* Success banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl ring-1 ring-emerald-500/20 bg-emerald-500/5 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <h1 className="text-sm font-medium text-primary">Translation complete</h1>
                  <p className="text-xs text-secondary mt-0.5">
                    <span className="tabular-nums">{review.cues.length}</span> {review.cues.length === 1 ? "cue" : "cues"} &middot; {targetLanguage} &middot; Downloaded as <span className="font-mono text-primary break-all">{downloadFilename}</span>
                  </p>
                  {notice && (
                    <p className="text-xs text-amber-500 mt-1" role="status">{notice.message}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={translateAnother}
                  className="text-xs px-4 py-2 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Translate another
                </button>
              </div>
            </div>

            {/* Inline editor */}
            <div>
              <p className="text-xs text-muted mb-3">Select any translation to edit, then download again to keep your changes.</p>
              <ReviewEditor
                originalCues={originalCues}
                state={review}
                targetLanguage={targetLanguage}
                warnLongLines={netflixMode}
                onChange={setReview}
                onDownload={handleRedownload}
              />
            </div>
          </div>
        )}
    </main>
  )
}
