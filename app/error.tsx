"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Catches a render failure below the root layout so the nav and footer
 * survive and the visitor gets a retry instead of a blank page. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[page] render failed:", error);
  }, [error]);

  return (
    <main id="main" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full grow py-8">
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <h1 className="text-3xl font-light tracking-tight text-primary">Something went wrong</h1>
        <p className="text-secondary text-sm">This page failed to load. Your file stays in your browser, so nothing of yours was lost.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-6 py-2.5 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-sm px-6 py-2.5 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
