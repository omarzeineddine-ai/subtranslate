import { SITE_URL } from "@/lib/site";
import { LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import type { Metadata } from "next";
import Link from "next/link";
import { jsonLdHtml } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FileWindow } from "@/components/FileWindow";

export const metadata: Metadata = {
  title: "What is an SRT File? | SRT Subtitle Format Explained",
  description:
    "Learn what SRT (SubRip Text) files are, how the format works, and where SRT subtitles are used. Covers the SRT structure, timestamps, and compatibility with video players.",
  openGraph: {
    title: "What is an SRT File? | SRT Subtitle Format Explained",
    description:
      "Learn what SRT files are, how the format works, and where SRT subtitles are used.",
    type: "article",
    url: `${SITE_URL}/guides/what-is-srt`,
    siteName: "Subtranslate",
  },
  twitter: {
    card: "summary_large_image",
    title: "What is an SRT File? | SRT Subtitle Format Explained",
    description:
      "Learn what SRT files are, how the format works, and where SRT subtitles are used.",
  },
  alternates: {
    canonical: "/guides/what-is-srt",
  },
};

const FAQ_ITEMS = [
  {
    question: "What does SRT stand for?",
    answer:
      "SRT stands for SubRip Text. It was originally created by the SubRip software, which extracted (ripped) subtitles from DVDs.",
  },
  {
    question: "Can I open an SRT file in a text editor?",
    answer:
      "Yes. SRT files are plain text files. You can open and edit them in any text editor like Notepad, TextEdit, VS Code, or Sublime Text.",
  },
  {
    question: "What video players support SRT files?",
    answer:
      "Nearly all modern video players support SRT files, including VLC, Windows Media Player, QuickTime, MX Player, Plex, Kodi, and most smart TV media players.",
  },
  {
    question: "What is the difference between SRT and VTT?",
    answer:
      "Both are text-based subtitle formats. VTT (WebVTT) is designed for web browsers and supports styling (colors, positioning). SRT is simpler, more universal, and works with virtually every video player and platform.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((i) => ({
    "@type": "Question",
    name: i.question,
    acceptedAnswer: { "@type": "Answer", text: i.answer },
  })),
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Subtranslate", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides/what-is-srt` },
    { "@type": "ListItem", position: 3, name: "What is an SRT File?", item: `${SITE_URL}/guides/what-is-srt` },
  ],
};

const FORMATS = [
  { name: "SRT", ext: ".srt", best: "General use. Works everywhere." },
  { name: "VTT", ext: ".vtt", best: "Web video. Supports styling and positioning." },
  { name: "ASS / SSA", ext: ".ass / .ssa", best: "Anime fansubs. Advanced styling and effects." },
  { name: "SBV", ext: ".sbv", best: "YouTube. Similar to SRT, different timestamp format." },
];

export default function WhatIsSrtPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbJsonLd) }} />

      <main id="main" className="w-full grow">
        <section>
          <div className="mx-auto max-w-3xl pt-12 lg:pt-20 px-4 sm:px-6 lg:px-8 w-full">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Guides" }, { label: "What is an SRT file?" }]} />
            <div className="mt-8 max-w-2xl">
              <span className="animate-fade-in-up anim-delay-1 relative rounded-full px-3 py-1 text-sm leading-6 text-primary ring-1 ring-[var(--ring)]">
                Guide
              </span>
              <h1 className="animate-fade-in-up anim-delay-2 text-4xl mt-6 tracking-tight font-light lg:text-5xl text-primary">
                What is an SRT file?
              </h1>
              <p className="animate-fade-in-up anim-delay-3 mt-4 text-base text-secondary text-balance">
                An SRT file is a plain text file that contains subtitles for a video. SRT stands for
                SubRip Text — the most widely used subtitle format in the world.
              </p>
            </div>
          </div>
        </section>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-12 lg:py-16">
          <article className="space-y-16">
            {/* Format structure */}
            <section className="animate-fade-in-up anim-delay-4">
              <span className="text-blue-400 text-sm">Format</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                How the SRT format works
              </h2>
              <p className="mt-4 text-secondary leading-relaxed">
                An SRT file is just a text file with the <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-elevated text-primary">.srt</code> extension.
                You can open it in any text editor. Each subtitle entry has three parts:
              </p>

              <ol className="mt-6 space-y-3 text-secondary">
                {[
                  ["A sequence number", "1, 2, 3 — identifies the subtitle order."],
                  ["A timestamp line", "When the subtitle appears and disappears."],
                  ["The subtitle text", "One or two lines of dialogue."],
                ].map(([title, desc], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="w-6 h-6 mt-0.5 rounded-full ring-1 ring-[var(--ring)] flex items-center justify-center text-primary text-xs tabular-nums flex-shrink-0">
                      {i + 1}
                    </span>
                    <span>
                      <strong className="text-primary font-medium">{title}.</strong>{" "}
                      {desc}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mt-6 text-secondary leading-relaxed">Entries are separated by a blank line. Here&apos;s a real SRT file:</p>

              <FileWindow name="example.srt" className="mt-6">
                <pre className="p-6 text-sm font-mono text-primary overflow-x-auto leading-relaxed">
{`1
00:00:01,000 --> 00:00:04,000
Say hello to my little friend!

2
00:00:04,500 --> 00:00:08,000
Yeah, Science!

3
00:00:10,200 --> 00:00:13,800
I'm going to make him an offer
he can't refuse.`}
                </pre>
              </FileWindow>

              <p className="mt-6 text-secondary leading-relaxed">
                The simplicity of SRT is its strength. No complicated markup, no binary encoding,
                nothing proprietary. Any program that reads text can read an SRT file.
              </p>
            </section>

            {/* Where SRT files are used */}
            <section>
              <span className="text-blue-400 text-sm">Compatibility</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Where SRT files are used
              </h2>
              <p className="mt-4 text-secondary leading-relaxed">
                SRT is the default subtitle format for most video workflows:
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                {[
                  { title: "Video players", desc: "VLC, MX Player, QuickTime, Plex, Kodi, Infuse — all support SRT natively." },
                  { title: "Streaming platforms", desc: "YouTube, Vimeo, and Facebook accept SRT uploads for captioning." },
                  { title: "Video editing", desc: "Premiere Pro, DaVinci Resolve, Final Cut Pro, and CapCut import and export SRT." },
                  { title: "Subtitle communities", desc: "OpenSubtitles and fan subtitle sites distribute SRT files for movies and TV." },
                ].map((item) => (
                  <div key={item.title} className="p-5 rounded-2xl ring-1 ring-[var(--ring)] bg-card">
                    <div className="text-primary text-sm font-medium">{item.title}</div>
                    <p className="text-xs text-secondary mt-1.5 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-secondary leading-relaxed">
                If you have a video and need subtitles in a different language, the SRT file is what you translate.
              </p>
            </section>

            {/* SRT vs other formats */}
            <section>
              <span className="text-blue-400 text-sm">Comparison</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                SRT vs. other subtitle formats
              </h2>
              <div className="mt-6 rounded-3xl ring-1 ring-[var(--ring)] bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-4 px-5 font-medium text-primary text-xs uppercase tracking-widest">Format</th>
                        <th className="text-left py-4 px-5 font-medium text-primary text-xs uppercase tracking-widest">Extension</th>
                        <th className="text-left py-4 px-5 font-medium text-primary text-xs uppercase tracking-widest">Best for</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FORMATS.map((row, i) => (
                        <tr
                          key={row.name}
                          className={i < FORMATS.length - 1 ? "border-b border-[var(--border)]" : ""}
                        >
                          <td className="py-4 px-5 font-medium text-primary">{row.name}</td>
                          <td className="py-4 px-5 font-mono text-xs text-secondary">{row.ext}</td>
                          <td className="py-4 px-5 text-secondary">{row.best}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-6 text-secondary leading-relaxed">
                SRT is the safest choice when you need subtitles to work across players and platforms.
                If a tool supports subtitles, it almost certainly supports SRT.
              </p>
            </section>

            {/* How to create SRT */}
            <section>
              <span className="text-blue-400 text-sm">Authoring</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                How to create an SRT file
              </h2>
              <div className="mt-8 grid sm:grid-cols-3 gap-8">
                {[
                  { n: "1", title: "Write by hand", desc: "In any text editor. Follow the format above, save with the .srt extension." },
                  { n: "2", title: "Use subtitle software", desc: "Subtitle Edit, Aegisub, or Kapwing — type while watching, timestamps auto-set." },
                  { n: "3", title: "Generate from audio", desc: "Whisper, Descript, or YouTube auto-captions create SRT from your video audio." },
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

            {/* FAQ */}
            <section id="faq">
              <span className="text-blue-400 text-sm">FAQ</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Frequently asked questions
              </h2>
              <div className="mt-6 sm:bg-card sm:shadow-inset sm:p-8 lg:p-10 sm:rounded-3xl">
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

            {/* CTA */}
            <section className="rounded-4xl bg-gradientdown ring-1 ring-[var(--ring)] p-8 lg:p-12 text-center">
              <span className="text-blue-400 text-sm">Translate</span>
              <h2 className="text-2xl mt-2 tracking-tight font-light lg:text-3xl text-primary">
                Need to translate an SRT file?
              </h2>
              <p className="mt-3 text-sm text-secondary max-w-md mx-auto">
                Translate SRT subtitles to {LANGUAGE_COUNT_LABEL} languages.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/translate"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-8 py-3 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Translate your SRT <span aria-hidden="true">&rarr;</span>
                </Link>
                <Link
                  href="/guides/how-to-translate-srt-files"
                  className="text-sm text-secondary hover:text-primary transition-colors"
                >
                  Read the step-by-step guide
                </Link>
              </div>
            </section>
          </article>
        </div>
      </main>

    </>
  );
}
