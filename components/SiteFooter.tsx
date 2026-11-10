import Link from "next/link";
import { SITE_HOST } from "@/lib/site";
import { POPULAR_LANGUAGES, languageToSlug, LANGUAGE_COUNT_LABEL } from "@/lib/languages";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] mt-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div>
            <Link
              href="/"
              className="text-primary hover:opacity-70 items-center font-semibold gap-2 inline-flex text-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                />
              </svg>
              Subtranslate
            </Link>
            <p className="mt-3 text-xs text-muted leading-relaxed max-w-xs">
              AI-powered subtitle translation to {LANGUAGE_COUNT_LABEL} languages.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 xl:col-span-2 mt-8 xl:mt-0 text-secondary text-xs">
            <nav aria-label="Popular languages">
              <h2 className="text-primary text-sm">Languages</h2>
              <ul role="list" className="mt-4 space-y-2">
                {POPULAR_LANGUAGES.map((l) => (
                  <li key={l}>
                    <Link
                      href={`/translate-srt-to/${languageToSlug(l)}`}
                      className="hover:text-primary transition-colors"
                    >
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Resources">
              <h2 className="text-primary text-sm">Resources</h2>
              <ul role="list" className="mt-4 space-y-2">
                <li>
                  <Link href="/translate" className="hover:text-primary transition-colors">
                    Translate
                  </Link>
                </li>
                <li>
                  <Link href="/clean" className="hover:text-primary transition-colors">
                    SRT Cleaner
                  </Link>
                </li>
                <li>
                  <Link href="/languages" className="hover:text-primary transition-colors">
                    All {LANGUAGE_COUNT_LABEL} languages
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides/how-to-translate-srt-files"
                    className="hover:text-primary transition-colors"
                  >
                    Translation guide
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides/what-is-srt"
                    className="hover:text-primary transition-colors"
                  >
                    What is SRT?
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-[var(--border)] text-xs text-muted">
          &copy; {new Date().getFullYear()} {SITE_HOST}
        </div>
      </div>
    </footer>
  );
}
