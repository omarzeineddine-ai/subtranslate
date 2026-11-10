/**
 * Hands a file the cleaner just produced to the translate form, so "Translate
 * this cleaned file" opens the form with that file already selected instead
 * of making the user find the download and upload it again.
 *
 * The file rides in session storage: it survives the navigation, stays in
 * this tab, and is gone when the tab closes. Taking it removes it, so a later
 * visit to the form starts empty. The functions take a `Storage`-like object
 * so they can be tested without a DOM and so every access is wrapped: storage
 * throws in private windows and when a large file exceeds the quota, and the
 * handoff is a convenience that must never break either page.
 */

export const CLEAN_HANDOFF_KEY = "srt:cleaned-file";

export interface CleanedFile {
	name: string;
	content: string;
}

/** The minimal slice of the Web Storage interface the helpers need. */
export interface HandoffStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** Leave a cleaned file for the translate form. Storage failures are ignored:
 * the form then simply opens empty. */
export function offerCleanedFile(store: HandoffStore | undefined, file: CleanedFile): void {
	try {
		store?.setItem(CLEAN_HANDOFF_KEY, JSON.stringify(file));
	} catch {
		// Over quota or storage unavailable; never let it surface as an error.
	}
}

/** Collect the file the cleaner left, if any. One-shot: the file is removed
 * whether or not it could be read. */
export function takeCleanedFile(store: HandoffStore | undefined): CleanedFile | undefined {
	try {
		const raw = store?.getItem(CLEAN_HANDOFF_KEY);
		if (!raw) return undefined;
		store?.removeItem(CLEAN_HANDOFF_KEY);
		const { name, content } = JSON.parse(raw) as Partial<CleanedFile>;
		if (typeof name !== "string" || !name || typeof content !== "string" || !content) return undefined;
		return { name, content };
	} catch {
		return undefined;
	}
}
