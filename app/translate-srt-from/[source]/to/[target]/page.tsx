import { SITE_URL } from "@/lib/site";
import { slugToLanguage, languageToSlug, LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import { LANGUAGE_PAIRS, pairToSlugs } from "@/lib/languages";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { jsonLdHtml } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CtaSection } from "@/components/CtaSection";

interface Props {
  params: Promise<{ source: string; target: string }>;
}

export function generateStaticParams() {
  return LANGUAGE_PAIRS.map((pair) => pairToSlugs(pair));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const source = slugToLanguage(params.source);
  const target = slugToLanguage(params.target);
  if (!source || !target) return {};

  const title = `Translate ${source} SRT Subtitles to ${target} | Online`;
  const description = `Translate ${source} subtitle files to ${target}. AI-powered SRT translation from ${source} to ${target} with preserved timestamps.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${SITE_URL}/translate-srt-from/${params.source}/to/${params.target}`,
      siteName: "Subtranslate",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: `/translate-srt-from/${params.source}/to/${params.target}`,
    },
  };
}

export default async function LanguagePairPage(props: Props) {
  const params = await props.params;
  const source = slugToLanguage(params.source);
  const target = slugToLanguage(params.target);
  if (!source || !target) notFound();

  const isValid = LANGUAGE_PAIRS.some(
    (p) => p.source === source && p.target === target
  );
  if (!isValid) notFound();

  const hasReverse = LANGUAGE_PAIRS.some(
    (p) => p.source === target && p.target === source
  );

  const relatedPairs = LANGUAGE_PAIRS.filter(
    (p) =>
      (p.source === source || p.target === target) &&
      !(p.source === source && p.target === target)
  ).slice(0, 8);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Translate ${source} SRT Subtitles to ${target}`,
    description: `Online tool to translate ${source} SRT subtitle files to ${target} using AI.`,
    url: `${SITE_URL}/translate-srt-from/${params.source}/to/${params.target}`,
    isPartOf: {
      "@type": "WebApplication",
      name: "Subtranslate",
      url: SITE_URL,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Subtranslate", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: `${source} to ${target}`, item: `${SITE_URL}/translate-srt-from/${params.source}/to/${params.target}` },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to Translate ${source} Subtitles to ${target}`,
    description: `Translate ${source} SRT subtitle files to ${target}.`,
    totalTime: "PT5M",
    step: [
      {
        "@type": "HowToStep",
        name: `Upload your ${source} SRT file`,
        text: `Drag and drop your ${source} .srt or .vtt subtitle file into the upload area.`,
        position: 1,
      },
      {
        "@type": "HowToStep",
        name: `Select ${target}`,
        text: `${target} is already chosen when you arrive from this page; change it in the language picker if you need another.`,
        position: 2,
      },
      {
        "@type": "HowToStep",
        name: `Download ${target} subtitles`,
        text: `Select Translate. Your ${target} SRT file downloads automatically when complete.`,
        position: 3,
      },
    ],
    tool: { "@type": "HowToTool", name: "Subtranslate" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(howToJsonLd) }} />

      <main id="main" className="w-full grow">
        <section>
          <div className="mx-auto max-w-5xl pt-12 lg:pt-20 px-4 sm:px-6 lg:px-8 w-full">
            <Breadcrumbs
              centered
              items={[
                { label: "Home", href: "/" },
                { label: "Languages", href: "/languages" },
                {
                  label: `${source} to ${target}`,
                  display: <>{source} <span aria-hidden="true">&rarr;</span><span className="sr-only">to</span> {target}</>,
                },
              ]}
            />

            <div className="lg:text-center max-w-2xl lg:mx-auto mt-8">
              <span className="animate-fade-in-up anim-delay-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm leading-6 text-primary ring-1 ring-[var(--ring)]">
                <span className="tabular-nums">{source}</span>
                <span aria-hidden="true" className="text-muted">&rarr;</span>
                <span className="tabular-nums">{target}</span>
              </span>
              <h1 className="animate-fade-in-up anim-delay-2 text-4xl mt-6 tracking-tight font-light lg:text-6xl text-primary">
                Translate {source} subtitles{" "}
                <span className="block text-secondary">to {target}</span>
              </h1>
              <p className="animate-fade-in-up anim-delay-3 mt-4 text-base text-secondary text-balance">
                Upload a {source} .srt or .vtt file and get {target} subtitles in minutes. Context-aware AI
                translation that preserves timestamps.
              </p>
              <div className="animate-fade-in-up anim-delay-3 mt-8">
                <Link
                  href={`/translate?to=${params.target}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-8 py-3 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Translate {source} to {target} <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-12 lg:py-16">
          <div className="space-y-12 lg:space-y-16">
            {/* How it works */}
            <section className="animate-fade-in-up anim-delay-4">
              <div className="max-w-xl mx-auto text-center">
                <span className="text-blue-400 text-sm">How it works</span>
                <h2 className="text-3xl mt-2 tracking-tight font-light lg:text-4xl text-primary">
                  {source} to {target}{" "}
                  <span className="block text-secondary">in three steps</span>
                </h2>
              </div>
              <div className="mt-12 grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
                {[
                  { n: "1", title: `Upload ${source}`, desc: `Drag and drop your ${source} .srt or .vtt file or browse for it.` },
                  { n: "2", title: `Confirm ${target}`, desc: `${target} is already chosen when you arrive from this page. Change it in the picker if you need another.` },
                  { n: "3", title: "Download", desc: "Translated file downloads automatically with timestamps intact." },
                ].map((s) => (
                  <div key={s.n} className="text-center space-y-3">
                    <div className="w-10 h-10 mx-auto rounded-full ring-1 ring-[var(--ring)] flex items-center justify-center text-primary font-light text-lg tabular-nums">
                      {s.n}
                    </div>
                    <h3 className="font-medium text-primary">{s.title}</h3>
                    <p className="text-sm text-secondary">{s.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* About this pair */}
            <section className="rounded-4xl bg-gradientdown ring-1 ring-[var(--ring)] p-8 lg:p-16">
              <div className="pb-10 border-b border-[var(--border)]">
                <span className="text-blue-400 text-sm">About this pair</span>
                <h2 className="text-3xl mt-4 tracking-tight font-light lg:text-4xl text-primary">
                  {source} to {target}{" "}
                  <span className="block text-secondary">subtitle translation</span>
                </h2>
              </div>
              <div className="mt-10 space-y-4 text-base text-secondary leading-relaxed">
                <p>
                  Translating subtitles from {source} to {target} requires more than word-for-word
                  conversion. {source} and {target} often have different sentence structures,
                  grammar rules, and ways of expressing the same idea. Our AI reads each subtitle
                  line in the context of the surrounding dialogue, producing {target} translations
                  that sound natural and match the tone of the original.
                </p>
                <p>
                  All timestamps in your SRT file stay exactly as they are. Only the text content
                  is translated, so your {target} subtitles sync perfectly with the video without
                  any manual timing adjustments.
                </p>
              </div>
            </section>

            {/* Features */}
            <section>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Context-aware", sub: `Reads ${source} dialogue context` },
                  { label: "Preserved timing", sub: "Timestamps unchanged" },
                  { label: "Unlimited", sub: `As many ${source} files as you like` },
                ].map((b) => (
                  <div key={b.label} className="text-center p-5 rounded-2xl ring-1 ring-[var(--ring)] bg-card">
                    <div className="text-base font-medium text-primary">{b.label}</div>
                    <p className="text-xs text-muted mt-1">{b.sub}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Reverse */}
            {hasReverse && (
              <section className="text-center">
                <div className="inline-flex flex-col sm:flex-row items-center gap-3 rounded-2xl ring-1 ring-[var(--ring)] bg-card px-6 py-4">
                  <span className="text-sm text-secondary">Need the other direction?</span>
                  <Link
                    href={`/translate-srt-from/${languageToSlug(target)}/to/${languageToSlug(source)}`}
                    className="inline-flex items-center gap-2 text-sm text-primary hover:opacity-70 transition-opacity"
                  >
                    {target} <span aria-hidden="true">&rarr;</span> {source}
                  </Link>
                </div>
              </section>
            )}

            {/* CTA */}
            <CtaSection
              title="Ready to translate?"
              text="No watermarks. Every cue keeps its timing."
              href={`/translate?to=${params.target}`}
              label={`Translate ${source} to ${target}`}
            />

            {/* Related pairs */}
            {relatedPairs.length > 0 && (
              <section className="pt-8 border-t border-[var(--border)]">
                <div className="flex items-baseline justify-between mb-6">
                  <div>
                    <span className="text-blue-400 text-sm">Related</span>
                    <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                      Other subtitle translations
                    </h2>
                  </div>
                  <Link
                    href="/languages"
                    className="hidden sm:inline-flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
                  >
                    All {LANGUAGE_COUNT_LABEL} <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {relatedPairs.map((pair) => {
                    const slugs = pairToSlugs(pair);
                    return (
                      <Link
                        key={`${slugs.source}-${slugs.target}`}
                        href={`/translate-srt-from/${slugs.source}/to/${slugs.target}`}
                        className="group flex items-center justify-between gap-3 p-4 rounded-2xl ring-1 ring-[var(--ring)] bg-card hover:ring-[var(--border-hover)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                      >
                        <span className="text-sm text-primary truncate">
                          <span className="font-medium">{pair.source}</span>
                          <span aria-hidden="true" className="text-muted mx-1.5">&rarr;</span>
                          <span className="font-medium">{pair.target}</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-secondary text-sm opacity-0 -translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:translate-x-0 group-focus-visible:translate-x-0 transition-[opacity,transform] flex-shrink-0"
                        >
                          &rarr;
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-6 text-center sm:hidden">
                  <Link
                    href="/languages"
                    className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
                  >
                    All {LANGUAGE_COUNT_LABEL} languages <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

    </>
  );
}
