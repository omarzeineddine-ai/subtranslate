"use client";

import { previewCleanedSrt, type CleanStats } from "@/lib/clean";
import { offerCleanedFile } from "@/lib/clean-handoff";
import { triggerFileDownload } from "@/lib/file-download";
import Link from "next/link";

/** How much of the cleaned file the done screen shows. */
const PREVIEW_CHARS = 4000;

interface Props {
	stats: CleanStats;
	/** The name the file was downloaded as. */
	filename: string;
	/** The cleaned file, for a second download and for the translate handoff. */
	content: string;
	/** Back to the form with the same file, to adjust a rule the preview
	 * showed was wrong and clean again without picking the file anew. */
	onChangeOptions: () => void;
	/** Back to an empty form. */
	onReset: () => void;
}

/** What the cleaner shows after a download: what changed, the actions,
 * and a preview of the cleaned file. */
export function CleanDoneScreen({ stats, filename, content, onChangeOptions, onReset }: Props) {
	const preview = previewCleanedSrt(content, PREVIEW_CHARS);

	return (
		<div className="space-y-6 max-w-2xl mx-auto py-12">
			<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl ring-1 ring-emerald-500/20 bg-emerald-500/5 px-5 py-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
						<svg
							className="w-5 h-5 text-emerald-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<div>
						<h1 className="text-sm font-medium text-primary">Cleaned &amp; downloaded</h1>
						<p className="text-xs text-secondary mt-0.5 tabular-nums">
							{stats.inputCues} → {stats.outputCues} {stats.outputCues === 1 ? "cue" : "cues"}
							{stats.removedCues > 0 && ` · removed ${stats.removedCues}`}
							{stats.modifiedCues > 0 && ` · modified ${stats.modifiedCues}`}
							{/* Say so when the rules touched nothing: the download is then
							    the uploaded file, and the fix is to turn on more rules. */}
							{stats.removedCues === 0 && stats.modifiedCues === 0 && " · nothing to change"}
						</p>
						<p className="text-xs text-secondary mt-0.5">
							Downloaded as <span className="font-mono text-primary break-all">{filename}</span>
						</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						onClick={onChangeOptions}
						className="text-xs px-4 py-2 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
					>
						Change options
					</button>
					<button
						onClick={() => triggerFileDownload(filename, content)}
						className="text-xs px-4 py-2 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
					>
						Download again
					</button>
					<button
						onClick={onReset}
						className="text-xs px-4 py-2 rounded-full ring-1 ring-[var(--ring)] text-secondary hover:text-primary hover:ring-[var(--border-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
					>
						Clean another
					</button>
					<Link
						href="/translate"
						onClick={() =>
							offerCleanedFile(typeof sessionStorage === "undefined" ? undefined : sessionStorage, {
								name: filename,
								content,
							})
						}
						className="inline-flex items-center gap-1 text-xs px-4 py-2 rounded-full bg-[var(--text)] text-[var(--bg)] font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
					>
						Translate it <span aria-hidden="true">&rarr;</span>
					</Link>
				</div>
			</div>

			<div className="space-y-2">
				<h2 className="text-xs uppercase tracking-wider text-muted">Preview</h2>
				{/* The preview scrolls inside a fixed height, so it is in the Tab
				    order: a scrolling box that cannot take focus cannot be scrolled
				    from the keyboard. */}
				<pre
					tabIndex={0}
					aria-label="Preview of the cleaned file"
					className="text-xs font-mono p-4 rounded-2xl ring-1 ring-[var(--ring)] bg-card text-secondary overflow-auto max-h-96 whitespace-pre-wrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
				>
					{preview.text}
					{preview.truncated && "\n\n… Preview ends here; the downloaded file is complete."}
				</pre>
			</div>
		</div>
	);
}
