/**
 * Hands a text file the browser built to the user as a download. The
 * translator and the cleaner both produce their SRT in the page, so there is
 * no server URL to link to: the text goes into a Blob, a temporary object
 * URL points at it, and a throwaway <a download> is clicked.
 */
/** How long the object URL outlives the click; see triggerFileDownload. */
const REVOKE_DELAY_MS = 60_000;

export function triggerFileDownload(filename: string, content: string): void {
	const el = document.createElement("a");
	const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
	el.href = url;
	el.download = filename;
	document.body.appendChild(el);
	el.click();
	document.body.removeChild(el);
	// click() only starts the download; the browser reads the Blob after it
	// returns. Revoking the URL in the same tick has been seen to cancel the
	// download or save an empty file in some browsers (older Safari and
	// Firefox among them), so release it a little later instead. The Blob is
	// a single subtitle file, so holding it for a minute costs nothing.
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
