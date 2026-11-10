/**
 * The visitor's own OpenAI API key: remembering it between visits when they
 * ask for that, and saying what went wrong when OpenAI turns a key away.
 *
 * The key lives in the browser only. It is sent with each translation
 * request and handed to OpenAI; the server keeps no copy. Storage is opt-in
 * because a key is a secret that spends money: someone on a shared computer
 * should not leave theirs behind by default.
 *
 * The storage-facing functions take a `Storage`-like object so they can be
 * tested without a DOM and so every access is wrapped: localStorage throws in
 * private windows and some embedded contexts, and that must never break the
 * form.
 */

import type { RefusalReason } from "@/lib/translate-session";
import { normalizeApiKey } from "@/lib/translation-request";

export const STORED_API_KEY = "srt:openai-api-key";

/** Where a visitor creates a key. */
export const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";

/** The minimal slice of the Web Storage interface the helpers need. */
export interface KeyStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** The remembered key, or undefined if none was saved or the saved value
 * could not be a key. */
export function readStoredApiKey(store: KeyStore | undefined): string | undefined {
	try {
		return normalizeApiKey(store?.getItem(STORED_API_KEY));
	} catch {
		return undefined;
	}
}

/** Remember a key, or forget the remembered one when given anything that is
 * not a key (an emptied field, "remember" switched off). */
export function writeStoredApiKey(store: KeyStore | undefined, key: string | undefined): void {
	try {
		const normalized = normalizeApiKey(key);
		if (normalized) store?.setItem(STORED_API_KEY, normalized);
		else store?.removeItem(STORED_API_KEY);
	} catch {
		// Storage is a convenience; never let it surface as an error.
	}
}

/** What the key field holds: nothing, something that cannot be a key, or a
 * key worth sending. */
export function apiKeyState(value: string): "empty" | "invalid" | "ok" {
	if (!value.trim()) return "empty";
	return normalizeApiKey(value) ? "ok" : "invalid";
}

/**
 * What to tell the user when OpenAI refused the key. With their own key the
 * fix is theirs and the message says which one; with the site's key there is
 * nothing for them to fix except to bring their own.
 */
export function describeRefusal(reason: RefusalReason | "unknown", ownKey: boolean): string {
	if (!ownKey) {
		return "This site's translator is unavailable right now. Add your own OpenAI API key below to translate.";
	}
	switch (reason) {
		case "invalid_key":
			return "OpenAI rejected this API key. Check that you copied all of it and that it has not been revoked.";
		case "no_credits":
			return "This OpenAI API key has no credits left. Add credits in your OpenAI billing settings, or use another key.";
		case "no_access":
			return "This OpenAI API key is not allowed to use the translation model. Check the key's permissions and its project's model access.";
		default:
			return "OpenAI refused this API key. Check the key and try again.";
	}
}
