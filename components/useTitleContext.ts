"use client";

import { useCallback, useRef, useState } from "react";
import { parseTitleFromFilename, type ParsedTitle } from "@/lib/title-parser";

export type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; match: string; sources: string }
  | { status: "error"; message: string };

const SOURCE_LABELS: Record<string, string> = { wikipedia: "Wikipedia", tmdb: "TMDB" };

/** "Wikipedia", "Wikipedia and TMDB". */
const describeSources = (sources: string[] | undefined): string =>
  (sources ?? []).map((s) => SOURCE_LABELS[s] ?? s).join(" and ") || "the lookup";

/**
 * The optional title lookup and the context box, as one piece of state: the
 * lookup fills the box, the box can be retyped, and a new file resets what
 * the lookup put there. Returned handlers are what the fields and the form
 * call; the form keeps the file and the language.
 */
export function useTitleContext() {
  const [context, setContext] = useState<string>("");
  /** Title to look up, prefilled from the filename; year/season/episode ride along from the parse. */
  const [titleQuery, setTitleQuery] = useState<ParsedTitle>({ title: "" });
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });

  /** The title lookup in flight; only it may fill the context. A lookup
   * takes seconds, and in that time the user can retype the title, pick
   * another file, or start writing the context themselves. Without this, the
   * earlier answer still lands when it arrives: it replaces the context with
   * the wrong title's synopsis and cast, reports a match, and that context
   * then steers the whole translation. Aborting also ends the request, and
   * with it the server's calls to Wikipedia and TMDB, instead of leaving them
   * to run for an answer nobody reads. */
  const lookupController = useRef<AbortController | null>(null);

  /** True while the context box holds what a lookup filled in. Kept apart
   * from the lookup status: retyping the title sets that back to idle, and
   * the context then still describes the looked-up title, so a file picked
   * after that must still drop it. Cleared when the user empties the box. */
  const contextFromLookup = useRef(false);

  /** Abandon any lookup in flight: its request is aborted and its answer,
   * should one still arrive, is ignored. */
  const cancelLookup = () => {
    lookupController.current?.abort();
    setLookup({ status: "idle" });
  };

  /** A new file, or none: the title comes from its name, a context the
   * lookup filled in is dropped (typed context is the user's and stays),
   * and any lookup for the old title is abandoned. Stable, so the form's
   * mount effect can call the file handler that calls this without a
   * dependency to list. */
  const resetForFile = useCallback((filename: string | undefined) => {
    setTitleQuery(filename ? parseTitleFromFilename(filename) ?? { title: "" } : { title: "" });
    if (contextFromLookup.current) {
      setContext("");
      contextFromLookup.current = false;
    }
    lookupController.current?.abort();
    setLookup({ status: "idle" });
  }, []);

  /** The user retyped the title: a lookup still running was for the old one. */
  const changeTitle = (title: string) => {
    setTitleQuery((query) => ({ ...query, title }));
    cancelLookup();
  };

  const changeContext = (text: string) => {
    setContext(text);
    // An emptied box is the user's to fill from scratch; a box they are
    // adjusting still describes the looked-up title.
    if (!text) contextFromLookup.current = false;
    // Typing takes the context over: a lookup still running would replace
    // what the user just wrote. A finished one keeps its note, since the
    // user is only adjusting what it filled in.
    if (lookup.status === "loading") cancelLookup();
  };

  const lookupContext = async () => {
    // Nothing to look up, or one already running: the button is disabled
    // then, and Enter in the title field should not restart it either.
    if (!titleQuery.title.trim() || lookup.status === "loading") return;
    lookupController.current?.abort();
    const controller = new AbortController();
    lookupController.current = controller;
    /** False once a newer lookup started or this one was cancelled. */
    const current = () => !controller.signal.aborted;
    setLookup({ status: "loading" });
    try {
      const response = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(titleQuery),
        signal: controller.signal,
      });
      const body = (await response.json()) as {
        context?: string;
        match?: { title: string; year?: number };
        sources?: string[];
        error?: string;
      };
      if (!current()) return;
      if (!response.ok || !body.context || !body.match) {
        setLookup({ status: "error", message: body.error ?? "Title lookup failed" });
        return;
      }
      setContext(body.context);
      contextFromLookup.current = true;
      setLookup({
        status: "done",
        match: body.match.year ? `${body.match.title} (${body.match.year})` : body.match.title,
        sources: describeSources(body.sources),
      });
    } catch {
      if (!current()) return;
      setLookup({ status: "error", message: "Title lookup failed" });
    }
  };

  return { context, titleQuery, lookup, changeTitle, changeContext, lookupContext, resetForFile };
}
