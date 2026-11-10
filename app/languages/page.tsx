import { SITE_URL } from "@/lib/site";
import { LANGUAGES, POPULAR_LANGUAGES, languageToSlug, LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import type { Metadata } from "next";
import Link from "next/link";
import { jsonLdHtml } from "@/lib/json-ld";
import { CtaSection } from "@/components/CtaSection";

export const metadata: Metadata = {
  title: `Supported Languages | Subtranslate - ${LANGUAGE_COUNT_LABEL} Languages`,
  description:
    `View all ${LANGUAGE_COUNT_LABEL} languages supported by Subtranslate. Translate SRT subtitle files to Spanish, French, Japanese, Arabic, Portuguese, Korean, German, and many more languages.`,
  openGraph: {
    title: `Supported Languages | Subtranslate - ${LANGUAGE_COUNT_LABEL} Languages`,
    description:
      `View all ${LANGUAGE_COUNT_LABEL} languages supported by Subtranslate. Translate subtitle files to any language.`,
    type: "website",
    url: `${SITE_URL}/languages`,
    siteName: "Subtranslate",
  },
  alternates: {
    canonical: "/languages",
  },
};

const POPULAR = POPULAR_LANGUAGES;

export default function LanguagesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Subtranslate Supported Languages",
    description:
      "All languages supported by Subtranslate for subtitle translation.",
    url: `${SITE_URL}/languages`,
    isPartOf: {
      "@type": "WebApplication",
      name: "Subtranslate",
      url: SITE_URL,
    },
  };

  const popularSet = new Set(POPULAR);
  const rest = LANGUAGES.filter((l) => !popularSet.has(l));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />

      <main id="main" className="w-full grow">
        <section>
          <div className="mx-auto max-w-5xl py-12 lg:py-20 px-4 sm:px-6 lg:px-8 items-center relative w-full">
            <div className="lg:text-center max-w-2xl lg:mx-auto">
              <span className="animate-fade-in-up relative rounded-full px-3 py-1 text-sm leading-6 text-primary ring-1 ring-[var(--ring)]">
                {LANGUAGE_COUNT_LABEL} supported languages
              </span>
              <h1 className="animate-fade-in-up anim-delay-1 text-4xl mt-6 tracking-tight font-light lg:text-6xl text-primary">
                Translate subtitles{" "}
                <span className="block text-secondary">to any language</span>
              </h1>
              <p className="animate-fade-in-up anim-delay-2 mt-4 text-base text-secondary text-balance">
                Pick a target language below and translate your SRT file in minutes.
                Natural, context-aware AI translations.
              </p>
              <div className="animate-fade-in-up anim-delay-3 mt-8">
                <Link
                  href="/translate"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-8 py-3 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Start translating <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-16">
          <div className="space-y-12 lg:space-y-16">
            {/* Popular */}
            <section className="animate-fade-in-up anim-delay-4">
              <div className="mb-6 flex items-baseline justify-between">
                <div>
                  <span className="text-blue-400 text-sm">Most popular</span>
                  <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">Top picks</h2>
                </div>
                <span className="text-xs text-muted tabular-nums">{POPULAR.length} of {LANGUAGES.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {POPULAR.map((language) => (
                  <Link
                    key={language}
                    href={`/translate-srt-to/${languageToSlug(language)}`}
                    className="group flex items-center justify-between gap-3 p-4 rounded-2xl ring-1 ring-[var(--ring)] bg-card hover:ring-[var(--border-hover)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <span className="text-sm font-medium text-primary truncate">{language}</span>
                    <span
                      aria-hidden="true"
                      className="text-secondary text-sm opacity-0 -translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:translate-x-0 group-focus-visible:translate-x-0 transition-[opacity,transform]"
                    >
                      &rarr;
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* All languages */}
            <section className="animate-fade-in-up anim-delay-5">
              <div className="mb-6">
                <span className="text-blue-400 text-sm">All languages</span>
                <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                  Every language we support
                </h2>
              </div>
              <div className="rounded-3xl ring-1 ring-[var(--ring)] bg-card shadow-inset p-4 sm:p-6">
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-1">
                  {rest.map((language) => (
                    <li key={language}>
                      <Link
                        href={`/translate-srt-to/${languageToSlug(language)}`}
                        className="group flex items-center gap-2 py-2 text-sm text-secondary hover:text-primary transition-colors"
                      >
                        <span className="truncate">{language}</span>
                        <span
                          aria-hidden="true"
                          className="text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:translate-x-0 group-focus-visible:translate-x-0 transition-[opacity,transform]"
                        >
                          &rarr;
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* CTA */}
            <CtaSection
              title="Can't find your language?"
              text="This is every language the translator offers today; new ones are added from time to time."
              href="/translate"
              label="Open translator"
            />
          </div>
        </div>
      </main>

    </>
  );
}
