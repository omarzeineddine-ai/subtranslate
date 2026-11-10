"use client";

import React, { createContext, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "theme";

/**
 * The stored theme is an external store, not React state: the inline script
 * in the document head reads the same key before first paint, and another tab
 * can change it. Subscribing to it means no post-mount setState just to catch
 * up with what localStorage already said.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // `storage` only fires for *other* tabs, so writes notify locally too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
  } catch {
    // Private windows and embedded contexts throw on access.
    return "system";
  }
}

/** What the server renders with, and what hydration starts from. */
function serverTheme(): Theme {
  return "system";
}

function writeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Persistence is a convenience; the in-page theme still changes.
  }
  for (const onChange of listeners) onChange();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  const [resolved, setResolved] = useState<"dark" | "light">("dark");

  // A layout effect, so the theme is applied before the first paint: as a
  // passive effect it ran after it, and on a light system the page showed
  // the dark default and the moon icon for a frame before switching.
  useLayoutEffect(() => {
    const root = document.documentElement;

    const apply = (isLight: boolean) => {
      if (isLight) {
        root.classList.add("light");
        setResolved("light");
      } else {
        root.classList.remove("light");
        setResolved("dark");
      }
      // The theme-color tags in the layout pick a colour by the system
      // scheme, so a site theme that differs from it left the browser's bar
      // in the other colour. Point both at the page background in use.
      const background = getComputedStyle(root).getPropertyValue("--bg").trim();
      if (background) {
        for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute("content", background);
      }
    };

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      apply(theme === "light");
    }
  }, [theme]);

  // One object per change, not per render, so consumers re-render only
  // when the theme does.
  const value = useMemo(() => ({ theme, setTheme: writeTheme, resolved }), [theme, resolved]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be within ThemeProvider");
  return ctx;
}
