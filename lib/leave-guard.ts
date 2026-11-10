/**
 * Leave guard — decides whether a link click is about to take the user off
 * the current page without the browser noticing.
 *
 * The browser's "leave this page?" prompt (beforeunload) only fires when the
 * document unloads. A Next.js <Link> swaps pages client-side, so nothing
 * unloads and the prompt never shows: clicking "Cleaner" in the nav would
 * silently drop whatever the page was holding. A page with something to lose
 * listens for clicks and asks this module whether the click is one of those.
 *
 * Kept free of the DOM (the click is described as plain data) so the rules
 * can be tested without a browser.
 */

export interface LinkClick {
	/** MouseEvent.button: 0 is the primary button. */
	button: number;
	/** Any modifier opens the link elsewhere (new tab, new window, download). */
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	/** Another handler already cancelled the click, so nothing will happen. */
	defaultPrevented: boolean;
	/** The clicked link's resolved href. */
	href: string;
	/** The link's target attribute ("" when absent). */
	target: string;
	/** Whether the link has a download attribute. */
	download: boolean;
	/** The page the user is on (location.href). */
	currentHref: string;
}

/**
 * True when the click navigates this tab to another page of this site — the
 * case beforeunload misses. Clicks that open a new tab or window, save a file,
 * jump within the page, or go to another site are left alone: the first three
 * keep the page, and leaving for another site unloads it, so the browser's
 * own prompt already covers that.
 */
export function leavesPageInApp(click: LinkClick): boolean {
	if (click.defaultPrevented || click.button !== 0) return false;
	if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
	if (click.download) return false;
	if (click.target && click.target !== "_self") return false;

	let next: URL;
	let current: URL;
	try {
		next = new URL(click.href);
		current = new URL(click.currentHref);
	} catch {
		return false;
	}
	if (next.origin !== current.origin) return false;
	// Only the fragment changes: the browser scrolls, the page stays.
	return next.pathname !== current.pathname || next.search !== current.search;
}
