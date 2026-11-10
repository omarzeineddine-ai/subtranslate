import Link from "next/link";
import type { Metadata } from "next";

/** The layout's title is the home page's SEO headline; a 404 tab should say what it is. */
export const metadata: Metadata = {
  title: "Page not found | Subtranslate",
};

export default function NotFound() {
  return (
    <main id="main" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full grow py-8">
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <span className="inline-block rounded-full px-3 py-1 text-sm text-primary ring-1 ring-[var(--ring)]">404</span>
        <h1 className="text-3xl font-light tracking-tight text-primary">Page not found</h1>
        <p className="text-secondary text-sm">
          That page doesn&apos;t exist, or the language in the address isn&apos;t one we translate to yet.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/translate"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-6 py-2.5 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            Open translator <span aria-hidden="true">&rarr;</span>
          </Link>
          <Link
            href="/languages"
            className="text-sm px-6 py-2.5 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            All languages
          </Link>
        </div>
      </div>
    </main>
  );
}
