"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** `section` is the path the link stands for, when that is wider than its
 * own page: the Guide link opens one guide but is current on every guide. */
const LINKS: { href: string; label: string; section?: string }[] = [
  { href: "/translate", label: "Translate" },
  { href: "/clean", label: "Cleaner" },
  { href: "/languages", label: "Languages" },
  { href: "/guides/how-to-translate-srt-files", label: "Guide", section: "/guides" },
];

/** The header's page links, with the one for the current page marked: in
 * the text colour, and as the current page for screen readers. `className`
 * places the row: inside the header bar on wide screens, under it on narrow
 * ones, where the bar has no room beside the logo and theme button. */
export function SiteNavLinks({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={`flex items-center gap-6 text-xs text-secondary ${className}`}>
      {LINKS.map(({ href, label, section = href }) => {
        const current = pathname === section || pathname.startsWith(`${section}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : current ? "true" : undefined}
            className={`hover:text-primary transition-colors ${current ? "text-primary" : ""}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
