import { SITE_URL } from "@/lib/site";
import { LANGUAGES, languageToSlug } from "@/lib/languages";
import { LANGUAGE_PAIRS, pairToSlugs } from "@/lib/languages";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const languagePairPages = LANGUAGE_PAIRS.map((pair) => {
    const slugs = pairToSlugs(pair);
    return {
      url: `${SITE_URL}/translate-srt-from/${slugs.source}/to/${slugs.target}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    };
  });

  const languagePages = LANGUAGES.map((language) => ({
    url: `${SITE_URL}/translate-srt-to/${languageToSlug(language)}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/translate`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/clean`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/languages`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/guides/how-to-translate-srt-files`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/guides/what-is-srt`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    ...languagePages,
    ...languagePairPages,
  ];
}
