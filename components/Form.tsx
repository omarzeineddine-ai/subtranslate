"use client";

import React, { FormEvent, useState, useRef, useEffect, useEffectEvent } from "react";
import { Select } from "./Select";
import { LANGUAGES } from "@/lib/languages";
import { isContentTooLarge, MAX_CONTENT_BYTES, type TranslationRequest } from "@/lib/translation-request";
import { NETFLIX_MAX_LINES, netflixLineLimit } from "@/lib/prompts";
import {
  hasSubtitleCues,
  isSubtitleFilename,
  NO_CUES_MESSAGE,
  readSubtitleFile,
  type DecodedSubtitleFile,
} from "@/lib/subtitle-file";
import { initialLanguage, writePreferredLanguage } from "@/lib/language-preference";
import { takeCleanedFile } from "@/lib/clean-handoff";
import { apiKeyState } from "@/lib/api-key";
import { ApiKeyField } from "./ApiKeyField";
import type { useApiKey } from "./useApiKey";
import { ContextFields } from "./ContextFields";
import { DropZone } from "./DropZone";
import { useTitleContext } from "./useTitleContext";
import { usePageDropGuard } from "./usePageDropGuard";

interface Props {
  /** The request that goes to the server, plus the filename — which stays
   * client-side (it names the download, it never crosses the wire). */
  onSubmit: (request: TranslationRequest, filename: string) => void;
  /** Called when the user picks or clears a file. The page above shows the
   * last run's failure over the form, and a new file is a new attempt that
   * failure no longer describes. Not called for the file the cleaner hands
   * over on mount: no run has failed by then. */
  onFileChange?: () => void;
  /** True when the server has no OpenAI key of its own, so the visitor has
   * to bring one before anything can be translated. */
  keyRequired: boolean;
  /** The visitor's own key, held by the page so it outlives this form. */
  apiKey: ReturnType<typeof useApiKey>;
}

/** Why a decoded file cannot be translated, or undefined when it can. The
 * same checks the server and the translate client run, surfaced at pick
 * time so the answer sits under the drop zone instead of arriving as an
 * opaque request failure after "Translate" is pressed. */
const describeFileProblem = (text: string): string | undefined => {
  if (isContentTooLarge(text)) {
    return `This file is too large to translate (the limit is ${Math.round(MAX_CONTENT_BYTES / 1_000_000)} MB).`;
  }
  if (!hasSubtitleCues(text)) return NO_CUES_MESSAGE;
  return undefined;
};

const TranslateForm: React.FC<Props> = ({ onSubmit, onFileChange, keyRequired, apiKey }) => {
  const [file, setFile] = useState<File>();
  /** The selected file's text, decoded with encoding detection at select time
   * so the encoding note can sit under the filename. */
  const [decoded, setDecoded] = useState<DecodedSubtitleFile>();
  const [language, setLanguage] = useState<string>("");
  const [netflixFormat, setNetflixFormat] = useState<boolean>(false);
  const titleContext = useTitleContext();
  /** Why the last picked file was rejected; shown under the drop zone. */
  const [fileError, setFileError] = useState<string>();
  usePageDropGuard();

  // Pick the starting language after mount: the URL query and storage are
  // both browser-only, and reading them during render would make the server
  // and client disagree.
  useEffect(() => {
    const starting = initialLanguage(
      window.location.search,
      typeof localStorage === "undefined" ? undefined : localStorage,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync from the URL and external storage
    if (starting) setLanguage(starting);
  }, []);

  const keyState = apiKeyState(apiKey.value);
  /** A key that cannot be one blocks the run even when it is optional:
   * dropping it silently would bill the site for a run the user meant to
   * pay for. */
  const keyReady = keyState === "ok" || (keyState === "empty" && !keyRequired);

  const selectLanguage = (next: string) => {
    setLanguage(next);
    writePreferredLanguage(typeof localStorage === "undefined" ? undefined : localStorage, next);
  };

  /** The file whose decode is allowed to land. Picking another file before
   * the previous decode resolves would otherwise let the stale text win. */
  const pendingFile = useRef<File | undefined>(undefined);

  const selectFile = async (next: File | undefined) => {
    pendingFile.current = next;
    setFile(next);
    setDecoded(undefined);
    setFileError(undefined);
    titleContext.resetForFile(next?.name);
    if (!next) return;
    if (!isSubtitleFilename(next.name)) {
      setFile(undefined);
      setFileError("Please choose a .srt or .vtt file.");
      return;
    }
    const result = await readSubtitleFile(next);
    if (pendingFile.current !== next) return;
    const problem = describeFileProblem(result.text);
    if (problem) {
      setFile(undefined);
      setFileError(problem);
      return;
    }
    setDecoded(result);
  };

  // Arriving from the cleaner's "Translate this cleaned file": start with
  // that file selected, through the same checks as a picked one. An effect
  // event, so the mount effect can call selectFile without listing it.
  const selectHandedOverFile = useEffectEvent((cleaned: { name: string; content: string }) => {
    void selectFile(new File([cleaned.content], cleaned.name, { type: "text/plain" }));
  });
  useEffect(() => {
    const cleaned = takeCleanedFile(typeof sessionStorage === "undefined" ? undefined : sessionStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync from external storage
    if (cleaned) selectHandedOverFile(cleaned);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (file && language && decoded && keyReady) {
      onSubmit(
        {
          content: decoded.text,
          language,
          netflixFormat,
          context: titleContext.context.trim(),
          ...(keyState === "ok" ? { apiKey: apiKey.value.trim() } : {}),
        },
        file.name,
      );
    }
  };


  /** A pick or a clear by the user, as against the cleaner's handoff,
   * which is no new attempt after a failed run. */
  const pickFile = (next: File | undefined) => {
    onFileChange?.();
    return selectFile(next);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      <DropZone
        file={file}
        decoded={decoded}
        fileError={fileError}
        onPick={(next) => void pickFile(next)}
        onClear={() => void pickFile(undefined)}
      />

      {/* Language Selection */}
      <div hidden={!file} className="space-y-3">
        <p id="language-label" className="text-sm font-medium text-primary">Target language</p>
        <Select value={language} onChange={selectLanguage} options={LANGUAGES.map((l) => ({ value: l, label: l }))} placeholder="Choose a language…" ariaLabelledBy="language-label" searchPlaceholder="Search languages…" emptyMessage="No languages found" listLabel="Languages" />
      </div>

      {/* Before the optional fields when it is required: it is the one thing
          left that the run cannot start without. */}
      {keyRequired && (
        <ApiKeyField hidden={!file || !language} required value={apiKey.value} onChange={apiKey.change} remember={apiKey.remember} onRememberChange={apiKey.changeRemember} />
      )}

      <ContextFields hidden={!file || !language} {...titleContext} />

      {/* Netflix Formatting */}
      <div hidden={!file || !language}>
        <label className="flex items-center gap-3 p-3 rounded-xl ring-1 ring-[var(--ring)] bg-card hover:bg-elevated transition-colors cursor-pointer">
          <div className="relative flex items-center">
            <input type="checkbox" checked={netflixFormat} onChange={(e) => setNetflixFormat(e.target.checked)} className="sr-only peer" />
            <div className="w-9 h-5 bg-[var(--bg-elevated)] rounded-full peer-checked:bg-red-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/50" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
          </div>
          <div className="flex-1">
            <span className="text-sm text-primary">Netflix formatting</span>
            <p className="text-xs text-muted mt-0.5">Max {NETFLIX_MAX_LINES} lines, {netflixLineLimit(language)} chars/line</p>
          </div>
        </label>
      </div>

      {!keyRequired && (
        <ApiKeyField hidden={!file || !language} required={false} value={apiKey.value} onChange={apiKey.change} remember={apiKey.remember} onRememberChange={apiKey.changeRemember} />
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!file || !language || !decoded || !keyReady}
        className={`w-full text-sm py-3 px-6 rounded-full font-medium transition-[background-color,color,opacity,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
          file && language && decoded && keyReady
            ? "bg-[var(--text)] text-[var(--bg)] hover:opacity-90 active:scale-[0.98]"
            : "bg-[var(--bg-elevated)] text-muted cursor-not-allowed ring-1 ring-[var(--ring)]"
        }`}
      >
        {file && language && !decoded ? (
          "Reading file…"
        ) : file && language && keyState === "invalid" ? (
          "Fix the API key to continue"
        ) : file && language && !keyReady ? (
          "Add your OpenAI API key to continue"
        ) : file && language ? (
          <span className="inline-flex items-center justify-center gap-2">Translate to {language} <span aria-hidden="true">&rarr;</span></span>
        ) : file ? "Choose a language to continue" : "Select a file and a language to continue"}
      </button>
    </form>
  );
};

export default TranslateForm;
