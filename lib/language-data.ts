export interface LanguageInfo {
  nativeName: string;
  speakers: string;
  regions: string[];
  writingSystem: string;
  translationNotes: string;
  commonUseCases: string[];
}

export const RELATED_LANGUAGES: Record<string, string[]> = {
  Spanish: ["Portuguese", "French", "Italian", "German", "English", "Arabic", "Japanese", "Korean", "Traditional Chinese", "Dutch", "Russian", "Turkish"],
  French: ["Spanish", "Italian", "Portuguese", "German", "English", "Arabic", "Dutch", "Romanian", "Greek", "Japanese", "Korean", "Turkish"],
  Portuguese: ["Spanish", "French", "Italian", "English", "German", "Japanese", "Korean", "Arabic", "Dutch", "Romanian", "Russian", "Turkish"],
  German: ["Dutch", "Swedish", "Norwegian", "Danish", "Finnish", "English", "French", "Spanish", "Polish", "Czech", "Italian", "Hungarian"],
  Italian: ["Spanish", "French", "Portuguese", "German", "English", "Romanian", "Greek", "Dutch", "Turkish", "Arabic", "Japanese", "Korean"],
  Japanese: ["Korean", "Traditional Chinese", "Simplified Chinese", "Thai", "Vietnamese", "Indonesian", "English", "Spanish", "French", "German", "Portuguese", "Arabic"],
  Korean: ["Japanese", "Traditional Chinese", "Simplified Chinese", "Thai", "Vietnamese", "Indonesian", "English", "Spanish", "French", "German", "Malay", "Arabic"],
  "Traditional Chinese": ["Simplified Chinese", "Japanese", "Korean", "Vietnamese", "Thai", "Indonesian", "Malay", "English", "Spanish", "French", "German", "Portuguese"],
  "Simplified Chinese": ["Traditional Chinese", "Japanese", "Korean", "Vietnamese", "Thai", "Indonesian", "Malay", "English", "Spanish", "French", "German", "Portuguese"],
  Arabic: ["Persian", "Turkish", "Urdu", "Hindi", "English", "French", "Spanish", "Indonesian", "Malay", "German", "Italian", "Portuguese"],
  Hindi: ["Urdu", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Punjabi", "Kannada", "Malayalam", "English", "Arabic", "Nepali"],
  Russian: ["Ukrainian", "Polish", "Czech", "Belarusian", "German", "English", "French", "Spanish", "Turkish", "Kazakh", "Finnish", "Hungarian"],
  Turkish: ["Azerbaijani", "Uzbek", "Kazakh", "Turkmen", "Arabic", "Persian", "Russian", "German", "English", "French", "Spanish", "Greek"],
  Vietnamese: ["Thai", "Japanese", "Korean", "Traditional Chinese", "Simplified Chinese", "Indonesian", "Khmer", "Malay", "English", "French", "Spanish", "German"],
  Thai: ["Vietnamese", "Japanese", "Korean", "Khmer", "Burmese", "Malay", "Indonesian", "Traditional Chinese", "Simplified Chinese", "English", "Spanish", "French"],
  Indonesian: ["Malay", "Tagalog", "Vietnamese", "Thai", "Japanese", "Korean", "English", "Dutch", "Arabic", "Simplified Chinese", "Spanish", "French"],
  Polish: ["Czech", "Russian", "Ukrainian", "German", "Hungarian", "Romanian", "Finnish", "Swedish", "English", "French", "Spanish", "Italian"],
  Dutch: ["German", "Swedish", "Norwegian", "Danish", "English", "French", "Spanish", "Indonesian", "Italian", "Portuguese", "Polish", "Finnish"],
  Swedish: ["Norwegian", "Danish", "Finnish", "German", "Dutch", "English", "Icelandic", "Polish", "French", "Spanish", "Estonian", "Italian"],
  English: ["Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Korean", "Arabic", "Hindi", "Russian", "Traditional Chinese", "Dutch"],
};

export const LANGUAGE_DATA: Record<string, LanguageInfo> = {
  Spanish: {
    nativeName: "Español",
    speakers: "550+ million native speakers",
    regions: ["Spain", "Mexico", "Colombia", "Argentina", "Peru", "Chile"],
    writingSystem: "Latin script",
    translationNotes:
      "Spanish subtitle translation needs to handle regional differences. Latin American Spanish and European Spanish use different vocabulary, pronoun forms (vosotros vs. ustedes), and colloquial expressions. Our AI produces neutral Spanish that works for broad audiences, while keeping dialogue natural and idiomatic.",
    commonUseCases: [
      "Adding Spanish subtitles to YouTube videos for Latin American viewers",
      "Translating English movie subtitles for Spanish-speaking audiences",
      "Making educational content accessible across Spanish-speaking countries",
    ],
  },
  French: {
    nativeName: "Français",
    speakers: "280+ million speakers worldwide",
    regions: ["France", "Canada", "Belgium", "Switzerland", "West Africa"],
    writingSystem: "Latin script",
    translationNotes:
      "French subtitle translation requires attention to formal vs. informal address (tu vs. vous), which changes based on character relationships. The AI preserves these social cues in dialogue. French also uses longer sentences than English, so translated subtitles may need slightly more reading time per line.",
    commonUseCases: [
      "Translating film subtitles for French-speaking audiences",
      "Adding French subtitles to online courses and tutorials",
      "Making documentary content available in Canadian French",
    ],
  },
  Portuguese: {
    nativeName: "Português",
    speakers: "260+ million native speakers",
    regions: ["Brazil", "Portugal", "Mozambique", "Angola"],
    writingSystem: "Latin script",
    translationNotes:
      "Brazilian Portuguese and European Portuguese differ significantly in vocabulary, grammar, and spelling. Most subtitle demand targets Brazilian Portuguese due to Brazil's large media market. The AI handles both variants and produces translations that read naturally in everyday Brazilian dialogue.",
    commonUseCases: [
      "Translating subtitles for the Brazilian YouTube and streaming market",
      "Adding Portuguese subtitles to corporate training videos",
      "Making English-language content accessible to Portuguese speakers",
    ],
  },
  German: {
    nativeName: "Deutsch",
    speakers: "130+ million speakers",
    regions: ["Germany", "Austria", "Switzerland"],
    writingSystem: "Latin script",
    translationNotes:
      "German compound words and longer sentence structures mean translated subtitles are often longer than the English original. The AI keeps translations concise enough to read comfortably at subtitle speed while preserving meaning. It also handles the formal Sie vs. informal du distinction based on dialogue context.",
    commonUseCases: [
      "Translating subtitles for the German-speaking European market",
      "Adding German subtitles to tech tutorials and presentations",
      "Making entertainment content accessible to German speakers",
    ],
  },
  Japanese: {
    nativeName: "日本語",
    speakers: "125+ million native speakers",
    regions: ["Japan"],
    writingSystem: "Kanji, Hiragana, Katakana",
    translationNotes:
      "Japanese subtitle translation involves converting between fundamentally different sentence structures (English is SVO, Japanese is SOV). The AI handles keigo (politeness levels) based on character relationships and scene context. Foreign names and terms are correctly rendered in katakana.",
    commonUseCases: [
      "Translating anime or drama subtitles to and from Japanese",
      "Adding Japanese subtitles to English-language YouTube content",
      "Making corporate and educational videos accessible to Japanese audiences",
    ],
  },
  Korean: {
    nativeName: "한국어",
    speakers: "80+ million native speakers",
    regions: ["South Korea", "North Korea"],
    writingSystem: "Hangul",
    translationNotes:
      "Korean honorifics and speech levels (formal, polite, casual) play a major role in dialogue. The AI matches the appropriate speech level based on context. Korean subtitles are typically shorter than English due to the efficiency of Hangul, so translations read cleanly on screen.",
    commonUseCases: [
      "Translating K-drama and K-pop video subtitles",
      "Adding Korean subtitles to English-language content for the Korean market",
      "Translating Korean subtitles to English for international audiences",
    ],
  },
  "Traditional Chinese": {
    nativeName: "繁體中文",
    speakers: "Used by 50+ million people",
    regions: ["Taiwan", "Hong Kong", "Macau"],
    writingSystem: "Traditional Chinese characters",
    translationNotes:
      "Traditional Chinese is used in Taiwan, Hong Kong, and Macau, while Simplified Chinese is used in mainland China. The AI produces proper Traditional Chinese characters with vocabulary and phrasing appropriate for Taiwanese and Hong Kong audiences, not simply converted from Simplified.",
    commonUseCases: [
      "Adding Traditional Chinese subtitles for Taiwanese and Hong Kong viewers",
      "Translating video content for the Taiwanese streaming market",
      "Making English-language educational content accessible in Traditional Chinese",
    ],
  },
  "Simplified Chinese": {
    nativeName: "简体中文",
    speakers: "1.1+ billion speakers",
    regions: ["Mainland China", "Singapore", "Malaysia"],
    writingSystem: "Simplified Chinese characters",
    translationNotes:
      "Simplified Chinese subtitle translation targets the world's largest internet audience. The AI uses mainland Chinese vocabulary, grammar patterns, and expressions rather than direct conversion from Traditional Chinese. Internet slang and modern expressions are handled naturally.",
    commonUseCases: [
      "Translating subtitles for the Chinese streaming market (Bilibili, Youku)",
      "Adding Chinese subtitles to international film and TV content",
      "Making educational and corporate videos accessible to Chinese-speaking audiences",
    ],
  },
  Arabic: {
    nativeName: "العربية",
    speakers: "420+ million speakers",
    regions: [
      "Middle East",
      "North Africa",
      "Saudi Arabia",
      "Egypt",
      "UAE",
    ],
    writingSystem: "Arabic script (right-to-left)",
    translationNotes:
      "Arabic is a right-to-left language with significant dialect variation across regions. The AI produces Modern Standard Arabic (MSA) for subtitles, which is universally understood across all Arabic-speaking countries. SRT files maintain correct RTL text direction so subtitles display properly in video players.",
    commonUseCases: [
      "Adding Arabic subtitles to English-language films and series",
      "Translating subtitles for Middle Eastern and North African audiences",
      "Making educational content accessible across the Arab world",
    ],
  },
  Hindi: {
    nativeName: "हिन्दी",
    speakers: "600+ million speakers",
    regions: ["India", "Nepal", "Fiji"],
    writingSystem: "Devanagari script",
    translationNotes:
      "Hindi subtitle translation serves one of the world's largest media markets. The AI uses standard Hindi (Khari Boli) with Devanagari script, avoiding excessive Sanskrit-derived or Urdu-derived vocabulary to keep translations accessible. Bollywood and regional film subtitles often mix Hindi and English (Hinglish), and the AI handles code-switching naturally.",
    commonUseCases: [
      "Translating English subtitles for Indian streaming platforms",
      "Adding Hindi subtitles to international content for the Indian market",
      "Making YouTube and educational content accessible to Hindi speakers",
    ],
  },
  Russian: {
    nativeName: "Русский",
    speakers: "260+ million speakers",
    regions: ["Russia", "Belarus", "Kazakhstan", "Ukraine"],
    writingSystem: "Cyrillic script",
    translationNotes:
      "Russian translations tend to be slightly longer than English due to grammatical case endings and lack of articles. The AI keeps subtitle text concise while sounding natural. Russian uses a flexible word order for emphasis, and the AI matches the tone of the original dialogue through appropriate word positioning.",
    commonUseCases: [
      "Translating subtitles for Russian-speaking audiences across the CIS region",
      "Adding Russian subtitles to English-language films and series",
      "Making tech tutorials and educational content available in Russian",
    ],
  },
  Italian: {
    nativeName: "Italiano",
    speakers: "85+ million speakers",
    regions: ["Italy", "Switzerland", "San Marino"],
    writingSystem: "Latin script",
    translationNotes:
      "Italian translations run about 15-20% longer than English, which can affect subtitle line length. The AI keeps translations readable at subtitle pace. Italian uses formal (Lei) and informal (tu) address, and the AI selects the appropriate form based on the dialogue context.",
    commonUseCases: [
      "Adding Italian subtitles to English-language entertainment",
      "Translating subtitles for the Italian film market",
      "Making online courses and tutorials accessible to Italian speakers",
    ],
  },
  Turkish: {
    nativeName: "Türkçe",
    speakers: "80+ million native speakers",
    regions: ["Turkey", "Cyprus", "Central Asia"],
    writingSystem: "Latin script",
    translationNotes:
      "Turkish is an agglutinative language where suffixes carry meaning that requires separate words in English. This can make Turkish subtitles shorter or longer depending on the sentence. The AI handles Turkish vowel harmony and suffix chains correctly, producing natural-sounding dialogue.",
    commonUseCases: [
      "Translating subtitles for the Turkish streaming market (growing rapidly)",
      "Adding Turkish subtitles to international series and films",
      "Making educational content accessible to Turkish-speaking audiences",
    ],
  },
  Vietnamese: {
    nativeName: "Tiếng Việt",
    speakers: "85+ million native speakers",
    regions: ["Vietnam"],
    writingSystem: "Latin script with diacritics",
    translationNotes:
      "Vietnamese uses tone marks (diacritics) that are essential for correct meaning. The AI produces properly accented text. Vietnamese subtitle lines tend to be similar in length to English. The AI handles Vietnamese pronoun choices (which depend on age and relationship between speakers) based on dialogue context.",
    commonUseCases: [
      "Adding Vietnamese subtitles to English-language content",
      "Translating subtitles for the Vietnamese streaming audience",
      "Making educational and corporate videos accessible to Vietnamese speakers",
    ],
  },
  Thai: {
    nativeName: "ภาษาไทย",
    speakers: "60+ million native speakers",
    regions: ["Thailand"],
    writingSystem: "Thai script",
    translationNotes:
      "Thai script does not use spaces between words, which can make subtitle text appear dense. The AI produces properly segmented Thai text that reads naturally on screen. Thai uses particles (kha/khrap) for politeness and gendered speech, and the AI includes these appropriately based on dialogue context.",
    commonUseCases: [
      "Adding Thai subtitles to international films and series",
      "Translating English-language educational content for Thai audiences",
      "Making YouTube videos accessible to Thai speakers",
    ],
  },
  Indonesian: {
    nativeName: "Bahasa Indonesia",
    speakers: "200+ million speakers",
    regions: ["Indonesia"],
    writingSystem: "Latin script",
    translationNotes:
      "Indonesian (Bahasa Indonesia) is one of the most accessible languages for subtitle translation. It uses Latin script, has straightforward grammar, and translated subtitles are typically close in length to the English original. The AI distinguishes between formal Indonesian and everyday conversational style based on dialogue tone.",
    commonUseCases: [
      "Adding Indonesian subtitles for one of Asia's largest online audiences",
      "Translating subtitles for the Indonesian streaming market",
      "Making educational and entertainment content accessible to Indonesian speakers",
    ],
  },
  Dutch: {
    nativeName: "Nederlands",
    speakers: "25+ million native speakers",
    regions: ["Netherlands", "Belgium", "Suriname"],
    writingSystem: "Latin script",
    translationNotes:
      "Dutch sits between English and German linguistically, and translated subtitles are usually close in length to the English source. The AI handles differences between Dutch (Netherlands) and Flemish (Belgium) usage. Dutch compound words can be long, so the AI keeps subtitle lines readable.",
    commonUseCases: [
      "Adding Dutch subtitles to English-language content",
      "Translating subtitles for the Dutch and Belgian markets",
      "Making corporate and educational videos accessible to Dutch speakers",
    ],
  },
  Polish: {
    nativeName: "Polski",
    speakers: "45+ million native speakers",
    regions: ["Poland"],
    writingSystem: "Latin script with diacritics",
    translationNotes:
      "Polish has seven grammatical cases, which means word endings change based on sentence role. Polish translations tend to be slightly longer than English. The AI handles the complex grammar system correctly and produces subtitle text that reads naturally for Polish viewers.",
    commonUseCases: [
      "Adding Polish subtitles to English-language entertainment",
      "Translating subtitles for the Polish streaming audience",
      "Making educational content accessible to Polish speakers",
    ],
  },
  Swedish: {
    nativeName: "Svenska",
    speakers: "10+ million native speakers",
    regions: ["Sweden", "Finland"],
    writingSystem: "Latin script",
    translationNotes:
      "Swedish subtitle translation produces clean, readable text. Swedish and English share many structural similarities, so translations stay close to the original length. The AI handles Swedish-specific features like the definite article suffix (-en/-et) and common compound words naturally.",
    commonUseCases: [
      "Adding Swedish subtitles to English-language content",
      "Translating subtitles for the Scandinavian streaming market",
      "Making educational and corporate videos accessible to Swedish speakers",
    ],
  },
  English: {
    nativeName: "English",
    speakers: "1.5+ billion speakers worldwide",
    regions: ["United States", "United Kingdom", "Australia", "Canada", "India"],
    writingSystem: "Latin script",
    translationNotes:
      "Translating subtitles to English is the most common use case globally. The AI produces clear, natural English that matches the tone of the original dialogue. It avoids overly literal translations and adapts idioms and cultural references so they make sense to English-speaking audiences.",
    commonUseCases: [
      "Translating anime, K-drama, and foreign film subtitles to English",
      "Adding English subtitles to non-English YouTube and social media content",
      "Making international content accessible to the global English-speaking audience",
    ],
  },
};
