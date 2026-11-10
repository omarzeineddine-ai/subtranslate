import { SITE_URL } from "@/lib/site";
import { LANGUAGES, POPULAR_LANGUAGES, languageToSlug, slugToLanguage, LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import { LANGUAGE_DATA, RELATED_LANGUAGES } from "@/lib/language-data";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { jsonLdHtml } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CtaSection } from "@/components/CtaSection";

interface Props {
  params: Promise<{ language: string }>;
}

export function generateStaticParams() {
  return LANGUAGES.map((lang) => ({
    language: languageToSlug(lang),
  }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const language = slugToLanguage(params.language);
  if (!language) return {};

  const langData = LANGUAGE_DATA[language];
  const title = `Translate SRT Subtitles to ${language} | AI Translator`;
  const description = langData
    ? `Translate SRT subtitle files to ${language} (${langData.nativeName}) online. AI-powered ${language} subtitle translation for ${langData.speakers}.`
    : `Translate SRT subtitle files to ${language} online. AI-powered ${language} subtitle translation with perfect timing preservation.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${SITE_URL}/translate-srt-to/${params.language}`,
      siteName: "Subtranslate",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: `/translate-srt-to/${params.language}`,
    },
  };
}

export default async function LanguagePage(props: Props) {
  const params = await props.params;
  const language = slugToLanguage(params.language);
  if (!language) notFound();

  const langData = LANGUAGE_DATA[language];
  const relatedLangs = RELATED_LANGUAGES[language];
  const otherLanguages = relatedLangs
    ? relatedLangs.filter((l) => LANGUAGES.includes(l))
    : POPULAR_LANGUAGES.filter((l) => l !== language);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Translate SRT Subtitles to ${language}`,
    description: `Online tool to translate SRT subtitle files to ${language} using AI.`,
    url: `${SITE_URL}/translate-srt-to/${params.language}`,
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
      { "@type": "ListItem", position: 2, name: "Languages", item: `${SITE_URL}/languages` },
      { "@type": "ListItem", position: 3, name: language, item: `${SITE_URL}/translate-srt-to/${params.language}` },
    ],
  };

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to Translate SRT Subtitles to ${language}`,
    description: `Translate SRT subtitle files to ${language} using AI-powered translation.`,
    totalTime: "PT5M",
    step: [
      {
        "@type": "HowToStep",
        name: "Upload your SRT file",
        text: "Drag and drop your .srt or .vtt subtitle file into the upload area, or browse for it.",
        position: 1,
      },
      {
        "@type": "HowToStep",
        name: `Select ${language} as your target language`,
        text: `${language} is already chosen when you arrive from this page; change it in the language picker if you need another.`,
        position: 2,
      },
      {
        "@type": "HowToStep",
        name: `Download your ${language} subtitles`,
        text: `Select Translate and your ${language} SRT file downloads automatically when complete. All timestamps are preserved.`,
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

      {/* Hero */}
      <main id="main" className="w-full grow">
        <section>
          <div className="mx-auto max-w-5xl pt-12 lg:pt-20 px-4 sm:px-6 lg:px-8 w-full">
            <Breadcrumbs centered items={[{ label: "Home", href: "/" }, { label: "Languages", href: "/languages" }, { label: language }]} />

            <div className="lg:text-center max-w-2xl lg:mx-auto mt-8">
              <span className="animate-fade-in-up anim-delay-1 relative rounded-full px-3 py-1 text-sm leading-6 text-primary ring-1 ring-[var(--ring)]">
                {langData ? langData.nativeName : `${language} translation`}
              </span>
              <h1 className="animate-fade-in-up anim-delay-2 text-4xl mt-6 tracking-tight font-light lg:text-6xl text-primary">
                Translate SRT subtitles{" "}
                <span className="block text-secondary">to {language}</span>
              </h1>
              <p className="animate-fade-in-up anim-delay-3 mt-4 text-base text-secondary text-balance">
                Upload your subtitle file and get natural, context-aware {language} translations
                in minutes. Timestamps preserved.
              </p>
              <div className="animate-fade-in-up anim-delay-3 mt-8">
                <Link
                  href={`/translate?to=${params.language}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-8 py-3 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Translate to {language} <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-12 lg:py-16">
          <div className="space-y-12 lg:space-y-16">
            {/* Language info card */}
            {langData && (
              <section className="animate-fade-in-up anim-delay-4">
                <div className="rounded-3xl ring-1 ring-[var(--ring)] bg-card shadow-inset p-6 lg:p-8">
                  <div className="grid sm:grid-cols-3 gap-6 text-sm">
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted">Native name</span>
                      <p className="mt-1 text-primary font-medium text-lg">{langData.nativeName}</p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted">Speakers</span>
                      <p className="mt-1 text-primary font-medium text-lg">{langData.speakers}</p>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-widest text-muted">Writing system</span>
                      <p className="mt-1 text-primary font-medium text-lg">{langData.writingSystem}</p>
                    </div>
                  </div>
                  {langData.regions.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-[var(--border)]">
                      <span className="text-xs uppercase tracking-widest text-muted">Major regions</span>
                      <p className="mt-2 text-sm text-secondary">{langData.regions.join(", ")}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Features */}
            <section>
              <div className="max-w-xl mx-auto text-center mb-10">
                <span className="text-blue-400 text-sm">Why translate with us</span>
                <h2 className="text-3xl mt-2 tracking-tight font-light lg:text-4xl text-primary">
                  Built for {language}{" "}
                  <span className="block text-secondary">subtitle translation</span>
                </h2>
              </div>
              <div className="grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
                {[
                  {
                    title: `AI-powered ${language}`,
                    desc: `Context-aware translation that understands ${language} nuance, idioms, and cultural references.`,
                  },
                  {
                    title: "Perfect timing",
                    desc: `All timestamps preserved exactly. ${language} subtitles stay synced to your video.`,
                  },
                  {
                    title: "Instant download",
                    desc: `Your translated ${language} SRT file downloads automatically when complete.`,
                  },
                ].map((f) => (
                  <div key={f.title} className="text-center space-y-3">
                    <h3 className="font-medium text-primary">{f.title}</h3>
                    <p className="text-sm text-secondary">{f.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* How it works */}
            <section>
              <div className="max-w-xl mx-auto text-center">
                <span className="text-blue-400 text-sm">How it works</span>
                <h2 className="text-3xl mt-2 tracking-tight font-light lg:text-4xl text-primary">
                  Three steps to{" "}
                  <span className="block text-secondary">{language} subtitles</span>
                </h2>
              </div>
              <div className="mt-12 grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
                {[
                  { n: "1", title: "Upload", desc: "Drag and drop your .srt or .vtt file or browse for it." },
                  { n: "2", title: `Confirm ${language}`, desc: `${language} is already chosen when you arrive from this page. Change it in the picker if you need another.` },
                  { n: "3", title: "Download", desc: `Your ${language} file downloads automatically with timestamps intact.` },
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

            {/* About this language */}
            {langData && (
              <section className="rounded-4xl bg-gradientdown ring-1 ring-[var(--ring)] p-8 lg:p-16">
                <div className="pb-10 border-b border-[var(--border)]">
                  <span className="text-blue-400 text-sm">About {language}</span>
                  <h2 className="text-3xl mt-4 tracking-tight font-light lg:text-4xl text-primary">
                    Why {language} translation{" "}
                    <span className="block text-secondary">needs context</span>
                  </h2>
                </div>
                <p className="mt-10 text-base text-secondary leading-relaxed">
                  {langData.translationNotes}
                </p>
                {langData.commonUseCases.length > 0 && (
                  <div className="mt-10 pt-10 border-t border-[var(--border)]">
                    <h3 className="text-primary text-sm font-medium mb-6">Common uses</h3>
                    <ul className="grid sm:grid-cols-2 gap-3">
                      {langData.commonUseCases.map((useCase) => (
                        <li
                          key={useCase}
                          className="flex items-start gap-3 text-sm text-secondary"
                        >
                          <svg
                            className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                            aria-hidden="true"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{useCase}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* CTA */}
            <CtaSection
              title="Ready to translate?"
              text="No watermarks. Every cue keeps its timing."
              href={`/translate?to=${params.language}`}
              label={`Translate to ${language}`}
            />

            {/* Other languages */}
            <section className="pt-8 border-t border-[var(--border)]">
              <div className="flex items-baseline justify-between mb-6">
                <div>
                  <span className="text-blue-400 text-sm">Other languages</span>
                  <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                    {relatedLangs ? `Related to ${language}` : "Translate to other languages"}
                  </h2>
                </div>
                <Link
                  href="/languages"
                  className="hidden sm:inline-flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
                >
                  View all {LANGUAGE_COUNT_LABEL} <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {otherLanguages.map((lang) => (
                  <Link
                    key={lang}
                    href={`/translate-srt-to/${languageToSlug(lang)}`}
                    className="group flex items-center justify-between gap-3 p-4 rounded-2xl ring-1 ring-[var(--ring)] bg-card hover:ring-[var(--border-hover)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    <span className="text-sm font-medium text-primary truncate">{lang}</span>
                    <span
                      aria-hidden="true"
                      className="text-secondary text-sm opacity-0 -translate-x-1 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:translate-x-0 group-focus-visible:translate-x-0 transition-[opacity,transform]"
                    >
                      &rarr;
                    </span>
                  </Link>
                ))}
              </div>
              <div className="mt-6 text-center sm:hidden">
                <Link
                  href="/languages"
                  className="inline-flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
                >
                  View all {LANGUAGE_COUNT_LABEL} languages <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>

    </>
  );
}
