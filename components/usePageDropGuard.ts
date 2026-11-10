"use client";

import { useEffect } from "react";

/** Whether a drag carries files, as against text or a link dragged from
 * the page itself. */
export const dragHasFiles = (transfer: DataTransfer | null): boolean =>
	transfer !== null && Array.from(transfer.types).includes("Files");

/**
 * Keeps a file dropped beside the drop zone from replacing the page. The
 * browser's default for a dropped file is to open it in the tab, so a drop
 * that missed the zone by a few pixels took the user off the form. Both
 * events are cancelled only for a drag that carries files, so text can
 * still be dragged into the context box and the review fields.
 */
export function usePageDropGuard(): void {
	useEffect(() => {
		const guard = (e: DragEvent) => {
			if (dragHasFiles(e.dataTransfer)) e.preventDefault();
		};
		window.addEventListener("dragover", guard);
		window.addEventListener("drop", guard);
		return () => {
			window.removeEventListener("dragover", guard);
			window.removeEventListener("drop", guard);
		};
	}, []);
}
