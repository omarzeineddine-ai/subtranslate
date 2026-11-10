"use client";

import React from "react";
import { MAX_CONTEXT_LENGTH } from "@/lib/translation-request";
import { MAX_TITLE_LENGTH } from "@/lib/context-request";
import type { useTitleContext } from "./useTitleContext";

/** Above this many characters the context box shows five rows instead of
 * two. A looked-up synopsis and cast runs to several hundred; two rows of
 * that is a slit to read it through. */
const LONG_CONTEXT_CHARS = 160;

interface Props extends ReturnType<typeof useTitleContext> {
  /** Both fields wait until a file and a language are chosen. */
  hidden: boolean;
}

/** The translate form's optional fields: the title to look up and the
 * context box it fills. State and handlers come from useTitleContext. */
export function ContextFields({ hidden, context, titleQuery, lookup, changeTitle, changeContext, lookupContext }: Props) {
  return (
    <>
      {/* Title lookup (optional) */}
      <div hidden={hidden} className="space-y-3">
        <label htmlFor="translation-title" className="text-sm font-medium text-primary">
          Movie or show <span className="font-normal text-muted">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            id="translation-title"
            type="text"
            value={titleQuery.title}
            onChange={(e) => changeTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookupContext(); } }}
            maxLength={MAX_TITLE_LENGTH}
            placeholder="e.g. Breaking Bad"
            className="flex-1 min-w-0 rounded-xl bg-transparent ring-1 ring-[var(--ring)] px-4 py-3 text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-shadow"
          />
          <button
            type="button"
            onClick={() => void lookupContext()}
            disabled={!titleQuery.title.trim() || lookup.status === "loading"}
            className="shrink-0 rounded-xl px-4 py-3 text-sm font-medium ring-1 ring-[var(--ring)] bg-card hover:bg-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            {lookup.status === "loading" ? "Looking up…" : "Look up"}
          </button>
        </div>
        <p className="text-xs text-muted" role="status" aria-live="polite">
          {lookup.status === "done" && (
            <>
              Context filled from {lookup.sources}: {lookup.match}. Edit it below if needed.
            </>
          )}
          {lookup.status === "error" && <span className="text-red-500">{lookup.message}</span>}
          {/* Said here as well as on the button: the button's text is not a
              live region, so a screen reader heard nothing start. */}
          {lookup.status === "loading" && <>Looking up {titleQuery.title.trim()}&hellip;</>}
          {lookup.status === "idle" && (
            <>
              Fetches the episode synopsis and cast from Wikipedia and TMDB into the context below.
              {titleQuery.season !== undefined && titleQuery.episode !== undefined && (
                <> Detected episode S{titleQuery.season}E{titleQuery.episode} from the filename.</>
              )}
            </>
          )}
        </p>
      </div>

      {/* Context (optional) */}
      <div hidden={hidden} className="space-y-3">
        <label htmlFor="translation-context" className="text-sm font-medium text-primary">
          Context <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="translation-context"
          value={context}
          onChange={(e) => changeContext(e.target.value)}
          // Sized by what the box holds, not by the lookup's status: retyping
          // the title sets that back to idle, and the box then shrank around
          // the synopsis it still held.
          rows={context.length > LONG_CONTEXT_CHARS ? 5 : 2}
          maxLength={MAX_CONTEXT_LENGTH}
          placeholder="e.g. Crime drama set in Warsaw. Main characters: Anna (woman, detective), Marek (man, suspect). Informal tone."
          className="w-full rounded-xl bg-transparent ring-1 ring-[var(--ring)] px-4 py-3 text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 resize-y transition-shadow"
        />
        <div className="flex items-start justify-between gap-4 text-xs text-muted">
          <p>
            A short synopsis, character names and genders, or tone helps the AI resolve ambiguity
            (e.g. he/she verb forms in Polish, tu/vous in French).
          </p>
          {/* A looked-up synopsis and cast can come close to the cap, and
              maxLength then stops typing without saying why. */}
          <span className={`shrink-0 tabular-nums ${context.length >= MAX_CONTEXT_LENGTH ? "text-amber-500" : ""}`}>
            {context.length}/{MAX_CONTEXT_LENGTH}
          </span>
        </div>
      </div>

    </>
  );
}
