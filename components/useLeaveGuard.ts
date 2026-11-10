"use client";

import { useEffect, useRef } from "react";
import { leavesPageInApp } from "@/lib/leave-guard";

/**
 * Asks before the page is left with work that would be lost: a translation
 * still running, or review edits not yet in a downloaded file.
 *
 * The browser's own leave prompt covers a refresh, a closed tab and a plain
 * link, but never fires for a Next.js <Link>: the nav, the footer and the
 * in-page links swap pages client-side, so a click on "Cleaner" would drop
 * unsaved review edits without a word. Those clicks are caught with a
 * capture-phase listener on window, which runs before React's own click
 * handling, where <Link> starts navigating; stopping the event there is
 * what keeps the page in place on "Cancel". A run in progress gets only
 * the browser prompt: the busy screen hides the nav and footer.
 */
export function useLeaveGuard({ busy, unsavedEdits, prompt }: { busy: boolean; unsavedEdits: boolean; prompt: string }) {
	/** Set when the user agreed to discard edits on a link click, so the
	 * unload that may follow does not ask again. */
	const leaveConfirmed = useRef(false);

	useEffect(() => {
		if (!busy && !unsavedEdits) return;
		const warn = (e: BeforeUnloadEvent) => {
			// The user already said yes to the link-click prompt below; a plain
			// same-site <a> then unloads the page, and asking twice is noise.
			if (leaveConfirmed.current) return;
			e.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [busy, unsavedEdits]);

	useEffect(() => {
		if (!unsavedEdits) return;
		leaveConfirmed.current = false;
		const guard = (e: MouseEvent) => {
			const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
			if (!(link instanceof HTMLAnchorElement)) return;
			const leaving = leavesPageInApp({
				button: e.button,
				metaKey: e.metaKey,
				ctrlKey: e.ctrlKey,
				shiftKey: e.shiftKey,
				altKey: e.altKey,
				defaultPrevented: e.defaultPrevented,
				href: link.href,
				target: link.target,
				download: link.hasAttribute("download"),
				currentHref: window.location.href,
			});
			if (!leaving) return;
			if (window.confirm(prompt)) {
				leaveConfirmed.current = true;
				return;
			}
			e.preventDefault();
			e.stopPropagation();
		};
		window.addEventListener("click", guard, true);
		return () => window.removeEventListener("click", guard, true);
	}, [unsavedEdits, prompt]);
}
