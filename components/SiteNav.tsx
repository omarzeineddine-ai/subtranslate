import { SiteNavLinks } from "@/components/SiteNavLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between bg-[var(--bg)]/70 border border-[var(--border)] shadow-thick backdrop-blur-xl rounded-full px-5 py-2.5">
          <Link
            href="/"
            className="text-primary hover:opacity-70 items-center font-semibold gap-2 inline-flex text-sm"
            aria-label="Subtranslate home"
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
          <div className="flex items-center gap-4">
            <SiteNavLinks className="hidden md:flex" />
            <ThemeToggle />
          </div>
        </div>
        {/* On a phone the bar holds only the logo and the theme button, so the
            page links sit in a row under it; without one, the cleaner, the
            languages and the guide were reachable only from the footer. */}
        <SiteNavLinks className="md:hidden justify-center mt-3" />
      </div>
    </header>
  );
}
