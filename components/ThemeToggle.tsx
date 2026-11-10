"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-[var(--ring)] hover:ring-[var(--border-hover)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {/* Sun */}
      <svg
        className={`h-4 w-4 transition-transform duration-200 ${resolved === "dark" ? "scale-0 rotate-90 absolute" : "scale-100 rotate-0"}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
      {/* Moon */}
      <svg
        className={`h-4 w-4 transition-transform duration-200 ${resolved === "dark" ? "scale-100 rotate-0" : "scale-0 -rotate-90 absolute"}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
