/**
 * Which target language the form starts on. Someone translating a whole
 * season picks the same language every time, so the form restores the last
 * choice; a visitor arriving from a "Translate to French" landing page has
 * already chosen, so the URL can name the language outright.
 *
 * The storage-facing functions take a `Storage`-like object so they can be
 * tested without a DOM and so every access is wrapped: localStorage throws in
 * private windows and some embedded contexts, and a missing or stale value
 * must never break the form.
 */

import { LANGUAGES, slugToLanguage } from "@/lib/languages";

export const PREFERRED_LANGUAGE_KEY = "srt:target-language";

/** Query parameter the language and language-pair pages use to hand the
 * form a target language: `/translate?to=spanish-spain`. */
export const REQUESTED_LANGUAGE_PARAM = "to";

/** The minimal slice of the Web Storage interface the helpers need. */
export interface LanguageStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The remembered language, or undefined if none was saved or the saved
 * value is no longer in the catalog. */
export function readPreferredLanguage(store: LanguageStore | undefined): string | undefined {
	try {
		const stored = store?.getItem(PREFERRED_LANGUAGE_KEY);
		return stored && LANGUAGES.includes(stored) ? stored : undefined;
	} catch {
		return undefined;
	}
}

/** The language a `?to=<slug>` query asks for, or undefined when the query
 * is missing or names nothing in the catalog. */
export function readRequestedLanguage(search: string): string | undefined {
	const slug = new URLSearchParams(search).get(REQUESTED_LANGUAGE_PARAM);
	return slug ? slugToLanguage(slug) : undefined;
}

/** The language the form should start on: an explicit request in the URL
 * wins over the remembered choice, which wins over nothing. */
export function initialLanguage(search: string, store: LanguageStore | undefined): string | undefined {
	return readRequestedLanguage(search) ?? readPreferredLanguage(store);
}

/** Persist a choice. Unknown languages and storage failures are ignored. */
export function writePreferredLanguage(store: LanguageStore | undefined, language: string): void {
	if (!LANGUAGES.includes(language)) return;
	try {
		store?.setItem(PREFERRED_LANGUAGE_KEY, language);
	} catch {
		// Storage is a convenience; never let it surface as an error.
	}
}
