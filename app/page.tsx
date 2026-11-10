import { LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import Link from "next/link";
import { jsonLdHtml } from "@/lib/json-ld";
import { CtaSection } from "@/components/CtaSection";
import { FileWindow } from "@/components/FileWindow";

const FAQ_ITEMS = [
  {
    question: "What is an SRT file?",
    answer:
      "An SRT (SubRip Text) file is the most common subtitle format used for movies, TV shows, and videos. It contains numbered subtitle entries with timestamps and text, making it compatible with virtually every media player and video platform including VLC, YouTube, and Netflix.",
  },
  {
    question: "How do I translate an SRT subtitle file?",
    answer:
      `Upload your .srt or .vtt file, select your target language from ${LANGUAGE_COUNT_LABEL} options, and select Translate. Our AI processes each subtitle segment while preserving timestamps and formatting. The translated file downloads automatically when complete.`,
  },
  {
    question: "What languages can I translate subtitles to?",
    answer:
      `We support ${LANGUAGE_COUNT_LABEL} languages including Spanish, French, Portuguese, German, Italian, Japanese, Korean, Chinese (Traditional and Simplified), Arabic, Hindi, Russian, Turkish, Vietnamese, Thai, Indonesian, and many more.`,
  },
  {
    question: "How accurate is AI subtitle translation?",
    answer:
      "Our AI uses advanced language models that understand context, idioms, and nuance. Unlike word-by-word translators, it produces natural-sounding translations that preserve the original meaning and tone of the dialogue.",
  },
  {
    question: "Does it preserve subtitle timing?",
    answer:
      "Yes, all original timestamps are preserved exactly. Only the text content is translated, so your subtitles remain perfectly synchronized with the video.",
  },
  {
    question: "What subtitle formats are supported?",
    answer:
      "SRT (SubRip Text) and VTT (WebVTT) files. SRT is the most widely used subtitle format and works with nearly every media player and video platform; a VTT file is read the same way and translated into an SRT file.",
  },
  {
    question: "How long does translation take?",
    answer:
      "Most subtitle files translate in a few minutes. You can watch the real-time progress as each segment is translated.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Translate an SRT Subtitle File",
  description: `Translate SRT subtitle files to ${LANGUAGE_COUNT_LABEL} languages using AI-powered translation.`,
  totalTime: "PT5M",
  step: [
    { "@type": "HowToStep", name: "Upload your SRT file", text: "Drag and drop your .srt or .vtt subtitle file into the upload area, or browse for it.", position: 1 },
    { "@type": "HowToStep", name: "Select your target language", text: `Choose from ${LANGUAGE_COUNT_LABEL} supported languages.`, position: 2 },
    { "@type": "HowToStep", name: "Download translated subtitles", text: "Select Translate and your translated SRT file downloads automatically.", position: 3 },
  ],
  tool: { "@type": "HowToTool", name: "Subtranslate" },
};

export default function Home() {
  return (
    <>
      {/* Hero */}
      <main id="main" className="w-full grow">
        <section>
          <div className="mx-auto max-w-5xl py-12 lg:py-20 px-4 sm:px-6 lg:px-8 items-center relative w-full">
            <div className="lg:text-center max-w-2xl lg:mx-auto">
              <span className="animate-fade-in-up relative rounded-full px-3 py-1 text-sm leading-6 text-primary ring-1 ring-[var(--ring)]">
                AI-powered subtitle translation
              </span>
              <h1 className="animate-fade-in-up anim-delay-1 text-4xl mt-6 tracking-tight font-light lg:text-6xl text-primary">
                Translate SRT subtitles{" "}
                <span className="block text-secondary">to any language</span>
              </h1>
              <p className="animate-fade-in-up anim-delay-2 mt-4 text-base text-secondary text-balance">
                Stop spending hours on manual translation. Upload your subtitle file and get natural, context-aware translations to {LANGUAGE_COUNT_LABEL} languages in minutes.
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

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-8">
          <div className="space-y-12 lg:space-y-16">

            {/* Demo window */}
            <section className="animate-fade-in-up anim-delay-4">
              <FileWindow name="demo.srt">
                <div className="grid gap-px bg-elevated md:grid-cols-2">
                  <div className="bg-card p-6">
                    <div className="mb-4 text-xs font-medium uppercase tracking-widest text-muted">Original</div>
                    <div className="space-y-3">
                      <div className="rounded-xl bg-[var(--bg-elevated)]/30 p-4 font-mono text-sm">
                        <div className="text-muted text-xs mb-1 tabular-nums">00:00:01,000 &rarr; 00:00:04,000</div>
                        <div className="text-primary">Say hello to my little friend!</div>
                      </div>
                      <div className="rounded-xl bg-[var(--bg-elevated)]/30 p-4 font-mono text-sm">
                        <div className="text-muted text-xs mb-1 tabular-nums">00:00:04,500 &rarr; 00:00:08,000</div>
                        <div className="text-primary">Yeah, Science!</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-card p-6">
                    <div className="mb-4 text-xs font-medium uppercase tracking-widest text-emerald-400">Translated &rarr; Spanish</div>
                    <div className="space-y-3">
                      <div className="rounded-xl ring-1 ring-emerald-500/10 bg-emerald-500/5 p-4 font-mono text-sm">
                        <div className="text-muted text-xs mb-1 tabular-nums">00:00:01,000 &rarr; 00:00:04,000</div>
                        <div className="text-primary">&iexcl;Saluda a mi amiguito!</div>
                      </div>
                      <div className="rounded-xl ring-1 ring-emerald-500/10 bg-emerald-500/5 p-4 font-mono text-sm">
                        <div className="text-muted text-xs mb-1 tabular-nums">00:00:04,500 &rarr; 00:00:08,000</div>
                        <div className="text-primary">&iexcl;S&iacute;, Ciencia!</div>
                      </div>
                    </div>
                  </div>
                </div>
              </FileWindow>
            </section>

            {/* How it works */}
            <section id="how-it-works" className="animate-fade-in-up anim-delay-5">
              <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(howToJsonLd) }} />
              <div className="max-w-xl mx-auto text-center">
                <span className="text-blue-400 text-sm">How it works</span>
                <h2 className="text-3xl mt-4 tracking-tight font-light lg:text-4xl text-primary">
                  Three steps to{" "}
                  <span className="block text-secondary">translated subtitles</span>
                </h2>
              </div>
              <div className="mt-12 grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
                {[
                  { n: "1", title: "Upload", desc: "Drag and drop your .srt or .vtt file or browse for it. Works with any source." },
                  { n: "2", title: "Choose language", desc: `Pick from ${LANGUAGE_COUNT_LABEL} languages. Spanish, Japanese, Arabic, and many more.` },
                  { n: "3", title: "Download", desc: "Translated file downloads automatically. Timestamps stay perfectly synced." },
                ].map((s) => (
                  <div key={s.n} className="text-center space-y-3">
                    <div className="w-10 h-10 mx-auto rounded-full ring-1 ring-[var(--ring)] flex items-center justify-center text-primary font-light text-lg tabular-nums">{s.n}</div>
                    <h3 className="font-medium text-primary">{s.title}</h3>
                    <p className="text-sm text-secondary">{s.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Benefits strip */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Timing kept", sub: "Every cue stays in sync" },
                  { label: "Open source", sub: "MIT licensed" },
                  { label: "No watermark", sub: "Clean output" },
                  { label: "Unlimited", sub: "As many files as you like" },
                ].map((b) => (
                  <div key={b.label} className="text-center p-4 rounded-xl ring-1 ring-[var(--ring)] bg-card">
                    <div className="text-base font-medium text-primary">{b.label}</div>
                    <p className="text-xs text-muted mt-1">{b.sub}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA */}
            <CtaSection
              title="Ready to translate?"
              text="No watermarks. Every cue keeps its timing."
              href="/translate"
              label="Translate your subtitles"
            />

            {/* Features */}
            <section id="features" className="animate-fade-in-up anim-delay-6">
              <div className="rounded-4xl bg-gradientdown ring-1 ring-[var(--ring)] p-8 lg:p-16">
                <div className="pb-10 border-b border-[var(--border)]">
                  <span className="text-blue-400 text-sm">Why Subtranslate</span>
                  <h2 className="text-3xl mt-4 tracking-tight font-light lg:text-4xl text-primary">
                    Fast, accurate{" "}
                    <span className="block text-secondary">subtitle translation</span>
                  </h2>
                </div>
                <dl className="grid grid-cols-1 gap-10 mt-10 md:grid-cols-3">
                  {[
                    { title: `${LANGUAGE_COUNT_LABEL} Languages`, desc: "From Mandarin to Zulu. Translate subtitles to virtually every language in the world." },
                    { title: "Context-Aware AI", desc: "Understands idioms, slang, and cultural references. Natural results, not word-by-word." },
                    { title: "Instant Download", desc: "Your translated SRT file downloads automatically. All timestamps preserved perfectly." },
                  ].map((f) => (
                    <div key={f.title}>
                      <dt className="text-base font-medium text-primary">{f.title}</dt>
                      <dd className="mt-2 text-sm text-secondary">{f.desc}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            {/* FAQ */}
            <section id="faq">
              <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqJsonLd) }} />
              <div className="max-w-xl mx-auto text-center mb-10">
                <span className="text-blue-400 text-sm">FAQ</span>
                <h2 className="text-3xl mt-4 tracking-tight font-light lg:text-4xl text-primary">
                  Common questions{" "}
                  <span className="block text-secondary">and answers</span>
                </h2>
              </div>
              <div className="sm:bg-card sm:shadow-inset sm:p-12 lg:p-16 sm:rounded-[3rem]">
                <dl className="divide-y divide-[var(--border)]">
                  {FAQ_ITEMS.map((item) => (
                    <div key={item.question} className="pt-5 pb-6 md:grid md:grid-cols-12 md:gap-8">
                      <dt className="text-sm font-medium text-primary md:col-span-5">{item.question}</dt>
                      <dd className="mt-2 md:mt-0 md:col-span-7">
                        <p className="text-sm text-secondary">{item.answer}</p>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          </div>
        </div>
      </main>

    </>
  );
}
