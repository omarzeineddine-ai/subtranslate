import { SITE_URL } from "@/lib/site";
import { LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { ThemeProvider } from "@/components/ThemeProvider";
import { inter, mono } from "@/fonts";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";

import "./globals.css";
import { jsonLdHtml } from "@/lib/json-ld";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
  // Search Console ownership belongs to a deployment, not to the code.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
  title: `SRT Translator Online | Translate Subtitles to ${LANGUAGE_COUNT_LABEL} Languages`,
  description:
    `Translate SRT subtitle files online. AI-powered translation to ${LANGUAGE_COUNT_LABEL} languages including Spanish, French, Portuguese, Arabic, Japanese and more.`,
  keywords: [
    "SRT translator",
    "subtitle translator",
    "translate SRT file",
    "SRT translation online",
    "translate subtitles",
    "subtitle translation",
    "SRT file translator",
    "AI subtitle translation",
    "translate SRT to Spanish",
    "translate SRT to French",
    "translate SRT to Portuguese",
    "translate SRT to Arabic",
    "translate SRT to Japanese",
    "online subtitle translator",
    "SRT subtitle translation",
    "movie subtitle translator",
    "subtitle file translator",
    "translate subtitles online",
  ],
  openGraph: {
    title: `SRT Translator Online | Translate Subtitles to ${LANGUAGE_COUNT_LABEL} Languages`,
    description:
      `Translate SRT subtitle files online. AI-powered translation to ${LANGUAGE_COUNT_LABEL} languages including Spanish, French, Portuguese, Arabic, Japanese and more.`,
    type: "website",
    url: SITE_URL,
    siteName: "Subtranslate",
  },
  twitter: {
    card: "summary_large_image",
    title: `SRT Translator Online | Translate Subtitles to ${LANGUAGE_COUNT_LABEL} Languages`,
    description:
      `Translate SRT subtitle files online. AI-powered translation to ${LANGUAGE_COUNT_LABEL} languages.`,
  },
  alternates: {
    canonical: "/",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Subtranslate",
  url: SITE_URL,
  applicationCategory: "UtilityApplication",
  operatingSystem: "Web",
  description:
    `Online AI-powered SRT subtitle file translator supporting ${LANGUAGE_COUNT_LABEL} languages. Upload your SRT file and get accurate, context-aware translations in minutes.`,
  featureList: [
    `${LANGUAGE_COUNT_LABEL} language support`,
    "AI-powered context-aware translation",
    "Real-time translation progress",
    "Automatic file download",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f1014" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||(t==="system"||!t)&&window.matchMedia("(prefers-color-scheme: light)").matches)document.documentElement.classList.add("light")}catch(e){}})()`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} ${mono.variable} font-sans flex flex-col min-h-svh`}
      >
        <ThemeProvider>
          <a href="#main" className="skip-link">Skip to content</a>
          <SiteNav />
          {children}
          <SiteFooter />
        </ThemeProvider>
        {/* Vercel Web Analytics only exists on Vercel; elsewhere its script 404s. */}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
