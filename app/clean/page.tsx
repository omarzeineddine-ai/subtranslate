import CleanClient from "@/components/CleanClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SRT Cleaner — Strip Formatting, Brackets, Speaker Labels",
  description:
    "Clean SRT subtitle files in your browser. Remove HTML tags, ASS overrides, bracketed annotations, speaker labels, and watermarks. Nothing leaves your device.",
  alternates: {
    canonical: "/clean",
  },
};

export default function CleanPage() {
  return <CleanClient />;
}
