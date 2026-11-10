import { SITE_HOST, SITE_URL } from "@/lib/site";
import { LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import type { Metadata } from "next";
import Link from "next/link";
import { jsonLdHtml } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "How to Translate SRT Files | Step-by-Step Guide",
  description:
    "Learn how to translate SRT subtitle files to any language. Step-by-step guide covering online tools, AI translation, and tips for accurate subtitle translation.",
  openGraph: {
    title: "How to Translate SRT Files | Step-by-Step Guide",
    description:
      "Learn how to translate SRT subtitle files to any language. Step-by-step guide covering online tools and AI translation.",
    type: "article",
    url: `${SITE_URL}/guides/how-to-translate-srt-files`,
    siteName: "Subtranslate",
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Translate SRT Files | Step-by-Step Guide",
    description: "Learn how to translate SRT subtitle files to any language.",
  },
  alternates: {
    canonical: "/guides/how-to-translate-srt-files",
  },
};

const STEPS = [
  {
    title: "Get your SRT file ready",
    desc: "Find the .srt file you want to translate. You can download SRT files from OpenSubtitles, extract them from video files with VLC or HandBrake, or export them from YouTube Studio.",
  },
  {
    title: "Upload to Subtranslate",
    desc: "Drag your .srt or .vtt file into the upload area.",
  },
  {
    title: "Select your target language",
    desc: `Pick from ${LANGUAGE_COUNT_LABEL} languages. The most popular are Spanish, French, Japanese, Portuguese, and German.`,
  },
  {
    title: "Add context (optional)",
    desc: "Type the movie or show's name and select Look up to fill the context box with its synopsis and cast, or write a line yourself: the genre, who the main characters are and their genders, how formal the dialogue is. The translator uses it to settle what a line on its own leaves open, such as who is speaking to whom.",
  },
  {
    title: "Translate and download",
    desc: "Select Translate. Watch each subtitle render in real time. The translated .srt downloads automatically — timestamps unchanged.",
  },
  {
    title: "Review and download again",
    desc: "Every cue opens for editing under the finished translation, with the ones the checks flagged marked for a look. Change any you like, then select Download SRT to get the file with your edits in it.",
  },
];

const TIPS = [
  {
    title: "Start with clean source files.",
    desc: "Make sure your original SRT has correct timestamps and properly formatted text. Garbage in, garbage out.",
  },
  {
    title: "Review the first few subtitles.",
    desc: "Spot-check the beginning of your translation in the editor under the result to make sure the tone and style match what you expect; a wrong register at the start usually runs through the whole file.",
  },
  {
    title: "Watch with the translated subtitles.",
    desc: "Load the translated SRT into VLC or your video player and watch a few minutes to check timing and readability.",
  },
  {
    title: "Character names stay as-is.",
    desc: "AI translators keep proper nouns and character names untranslated, which is usually the right behavior for subtitles.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Translate SRT Subtitle Files",
  description:
    "Translate SRT subtitle files to any language using an online AI translator.",
  totalTime: "PT5M",
  step: STEPS.map((s, i) => ({
    "@type": "HowToStep",
    name: s.title,
    text: s.desc,
    position: i + 1,
  })),
  tool: { "@type": "HowToTool", name: `Subtranslate (${SITE_HOST})` },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Subtranslate", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides/how-to-translate-srt-files` },
    { "@type": "ListItem", position: 3, name: "How to Translate SRT Files", item: `${SITE_URL}/guides/how-to-translate-srt-files` },
  ],
};

export default function HowToTranslateSrtPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd) }} />

      <main id="main" className="w-full grow">
        <section>
          <div className="mx-auto max-w-3xl pt-12 lg:pt-20 px-4 sm:px-6 lg:px-8 w-full">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Guides" }, { label: "How to translate SRT files" }]} />
            <div className="mt-8 max-w-2xl">
              <span className="animate-fade-in-up anim-delay-1 relative rounded-full px-3 py-1 text-sm leading-6 text-primary ring-1 ring-[var(--ring)]">
                Step-by-step guide
              </span>
              <h1 className="animate-fade-in-up anim-delay-2 text-4xl mt-6 tracking-tight font-light lg:text-5xl text-primary">
                How to translate{" "}
                <span className="block text-secondary">SRT subtitle files</span>
              </h1>
              <p className="animate-fade-in-up anim-delay-3 mt-4 text-base text-secondary text-balance">
                SRT is the standard format for movie and video subtitles. Translating them opens
                your content to new audiences — here&apos;s how to do it in under a minute.
              </p>
            </div>
          </div>
        </section>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-12 lg:py-16">
          <article className="space-y-16">
            {/* Fast method */}
            <section className="animate-fade-in-up anim-delay-4">
              <span className="text-blue-400 text-sm">Fastest method</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Use an online SRT translator
              </h2>
              <p className="mt-4 text-secondary leading-relaxed">
                An online SRT translator handles the entire process for you. Upload, pick a language,
                download. No software to install, no manual copy-pasting.
              </p>

              <ol className="mt-8 space-y-4">
                {STEPS.map((s, i) => (
                  <li
                    key={s.title}
                    className="flex gap-5 p-5 rounded-2xl ring-1 ring-[var(--ring)] bg-card"
                  >
                    <div className="w-9 h-9 flex-shrink-0 rounded-full ring-1 ring-[var(--ring)] flex items-center justify-center text-primary font-light tabular-nums">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-primary">{s.title}</h3>
                      <p className="text-sm text-secondary mt-1.5 leading-relaxed">
                        {i === 1 ? (
                          <>
                            Go to{" "}
                            <Link href="/translate" className="text-primary hover:opacity-70 underline underline-offset-4 decoration-[var(--border)]">
                              {SITE_HOST}
                            </Link>{" "}
                            and drag your .srt or .vtt file into the upload area.
                          </>
                        ) : i === 2 ? (
                          <>
                            Pick from {LANGUAGE_COUNT_LABEL} languages. The most popular choices are{" "}
                            {["spanish", "french", "japanese", "portuguese", "german"].map(
                              (slug, idx, arr) => (
                                <span key={slug}>
                                  <Link
                                    href={`/translate-srt-to/${slug}`}
                                    className="text-primary hover:opacity-70 underline underline-offset-4 decoration-[var(--border)] capitalize"
                                  >
                                    {slug}
                                  </Link>
                                  {idx < arr.length - 2 ? ", " : idx === arr.length - 2 ? ", and " : "."}
                                </span>
                              )
                            )}
                          </>
                        ) : (
                          s.desc
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-8 text-center">
                <Link
                  href="/translate"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-8 py-3 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Try Subtranslate <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </section>

            {/* Manual method */}
            <section>
              <span className="text-blue-400 text-sm">Manual method</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Copy-paste into Google Translate
              </h2>
              <p className="mt-4 text-secondary leading-relaxed">
                You can translate SRT files manually by opening the file in a text editor, copying the
                subtitle text (not the timestamps or segment numbers), pasting it into Google
                Translate, and then putting the translated text back into the SRT structure.
              </p>
              <p className="mt-4 text-secondary leading-relaxed">
                This works for short files but has problems. Google Translate processes each line
                independently without dialogue context. You lose meaning in conversations where one
                line references another. And it&apos;s easy to break the SRT format by shifting timestamps
                or segment numbers.
              </p>
              <p className="mt-4 text-secondary leading-relaxed">
                For files with more than 20–30 subtitles, a dedicated SRT translator saves time and
                produces better results.
              </p>
            </section>

            {/* AI vs Traditional */}
            <section>
              <span className="text-blue-400 text-sm">Quality</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                AI translation vs. traditional
              </h2>
              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                <div className="p-5 rounded-2xl ring-1 ring-[var(--ring)] bg-card">
                  <div className="text-primary text-sm font-medium">Traditional MT</div>
                  <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                    Translates individual sentences without broader context. Idioms become literal nonsense,
                    and pronouns lose their reference.
                  </p>
                </div>
                <div className="p-5 rounded-2xl ring-1 ring-[var(--ring)] bg-card">
                  <div className="text-primary text-sm font-medium">AI translation</div>
                  <p className="text-xs text-secondary mt-1.5 leading-relaxed">
                    Reads surrounding dialogue. Handles pronouns, character voice, and idioms naturally.
                    &quot;That is sick!&quot; becomes excitement, not illness.
                  </p>
                </div>
              </div>
              <p className="mt-6 text-secondary leading-relaxed">
                For subtitles, context awareness matters. AI picks up on dialogue cues from
                surrounding lines so translations feel natural, not robotic.
              </p>
            </section>

            {/* Tips */}
            <section>
              <span className="text-blue-400 text-sm">Pro tips</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Tips for better translations
              </h2>
              <ul className="mt-6 space-y-3">
                {TIPS.map((tip) => (
                  <li
                    key={tip.title}
                    className="flex items-start gap-4 p-5 rounded-2xl ring-1 ring-[var(--ring)] bg-card"
                  >
                    <svg
                      className="w-4 h-4 text-blue-400 mt-1 flex-shrink-0"
                      aria-hidden="true"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm">
                      <strong className="text-primary font-medium">{tip.title}</strong>{" "}
                      <span className="text-secondary">{tip.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Where to get SRT files */}
            <section>
              <span className="text-blue-400 text-sm">Sources</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Where to get SRT files
              </h2>
              <p className="mt-4 text-secondary leading-relaxed">
                SRT files are available from several sources. OpenSubtitles.org has a large
                community-contributed library. YouTube lets you download auto-generated or manually
                created subtitles through YouTube Studio. Video editors like Premiere Pro and DaVinci
                Resolve can export SRT files. VLC can extract subtitle tracks from video files.
              </p>
              <p className="mt-4 text-secondary leading-relaxed">
                If your video doesn&apos;t have subtitles yet, transcribe them first. Tools like Whisper,
                Descript, or YouTube auto-captions generate SRT files directly from audio.
              </p>
            </section>

            {/* CTA */}
            <section className="rounded-4xl bg-gradientdown ring-1 ring-[var(--ring)] p-8 lg:p-12 text-center">
              <span className="text-blue-400 text-sm">Ready?</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Translate your subtitles
              </h2>
              <p className="mt-3 text-sm text-secondary max-w-md mx-auto">
                Supports {LANGUAGE_COUNT_LABEL} languages.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/translate"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-8 py-3 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Open Subtranslate <span aria-hidden="true">&rarr;</span>
                </Link>
                <Link
                  href="/guides/what-is-srt"
                  className="text-sm text-secondary hover:text-primary transition-colors"
                >
                  What is an SRT file?
                </Link>
              </div>
            </section>
          </article>
        </div>
      </main>

    </>
  );
}
