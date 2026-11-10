"use client";

import React from "react";
import { OPENAI_KEYS_URL, apiKeyState } from "@/lib/api-key";
import { MAX_API_KEY_LENGTH } from "@/lib/translation-request";

interface Props {
  /** The field waits until a file and a language are chosen, like the
   * other options. */
  hidden: boolean;
  /** True when the server has no key of its own: nothing translates until
   * the visitor brings one. False makes the field an optional extra. */
  required: boolean;
  value: string;
  onChange: (value: string) => void;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
}

/** The visitor's own OpenAI API key. Masked like a password, and kept away
 * from autofill: a browser offering to save it as a login for this site, or
 * filling in a real password, would both be wrong. */
export function ApiKeyField({ hidden, required, value, onChange, remember, onRememberChange }: Props) {
  const state = apiKeyState(value);
  /** Whether the optional form is unfolded. A key in the field keeps it open
   * whatever this says, so a key is never sent unseen. */
  const [open, setOpen] = React.useState(false);
  const field = (
    <div className="space-y-3">
      {required && (
        <label htmlFor="openai-api-key" className="text-sm font-medium text-primary">
          Your OpenAI API key
        </label>
      )}
      <input
        id="openai-api-key"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_API_KEY_LENGTH + 20}
        placeholder="sk-…"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-label={required ? undefined : "Your OpenAI API key"}
        aria-invalid={state === "invalid"}
        aria-describedby="openai-api-key-help"
        className="w-full rounded-xl bg-transparent ring-1 ring-[var(--ring)] px-4 py-3 text-sm font-mono text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 transition-shadow"
      />
      <div id="openai-api-key-help" className="space-y-1 text-xs text-muted">
        {state === "invalid" && (
          <p className="text-red-500" role="alert">That does not look like an API key. Paste the key on its own, with no spaces.</p>
        )}
        <p>
          {required
            ? "Translation runs on your own OpenAI account, so OpenAI bills you for what you translate. "
            : "With a key of your own, OpenAI bills your account for what you translate. "}
          <a
            href={OPENAI_KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
          >
            Create a key at OpenAI
          </a>
          .
        </p>
        <p>The key is sent with your file to OpenAI through this site. It is not stored on the server.</p>
      </div>
      <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => onRememberChange(e.target.checked)}
          className="h-4 w-4 rounded accent-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        />
        Remember this key in this browser
      </label>
    </div>
  );

  if (required) return <div hidden={hidden}>{field}</div>;

  // Optional: folded away so it does not read as one more thing to fill in.
  return (
    <details hidden={hidden} open={open || state !== "empty"} onToggle={(e) => setOpen(e.currentTarget.open)} className="group">
      <summary className="cursor-pointer text-sm text-secondary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded">
        Use your own OpenAI API key <span className="text-muted">(optional)</span>
      </summary>
      <div className="mt-3">{field}</div>
    </details>
  );
}
