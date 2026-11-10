import { LANGUAGE_COUNT_LABEL } from "@/lib/languages";
import TranslateClient from "@/components/TranslateClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Translate SRT File | AI Subtitle Translator",
  description:
    `Upload your SRT subtitle file and translate it to ${LANGUAGE_COUNT_LABEL} languages. AI-powered, context-aware translation with perfect timing preservation.`,
  alternates: {
    canonical: "/translate",
  },
};

export default function TranslatePage() {
  return <TranslateClient />;
}
