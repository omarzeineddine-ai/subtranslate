"use client";

import React, { useRef, useState, type ReactNode } from "react";
import {
	describeEncoding,
	formatFileSize,
	SUBTITLE_FILE_ACCEPT,
	type DecodedSubtitleFile,
} from "@/lib/subtitle-file";
import { dragHasFiles } from "./usePageDropGuard";

interface Props {
	/** The file in hand, or none. */
	file: File | null | undefined;
	/** Its decoded text, once read; drives the encoding note. */
	decoded: DecodedSubtitleFile | null | undefined;
	/** Why the last pick was rejected, shown in red under the zone. */
	fileError?: string | null;
	/** A file the user picked, by drop or by browsing. The input's value is
	 * reset after every pick, so the same file can be picked again after a
	 * rejection: a file input only fires change when its value changes. */
	onPick: (file: File) => void;
	/** The user let go of the file in hand. */
	onClear: () => void;
	/** An extra line under the empty zone's prompt. */
	hint?: ReactNode;
}

/**
 * The drop zone the translate form and the cleaner share: a dashed box that
 * takes a subtitle file by drop, by click or from the keyboard, and shows
 * the file in hand with its size and encoding note. The parent owns the
 * file; the zone owns only what is transient to it, the drag highlight and
 * the note about a drop that carried several files.
 */
export function DropZone({ file, decoded, fileError, onPick, onClear, hint }: Props) {
	const [dragging, setDragging] = useState(false);
	/** Set when a drop carried more than one file; the zone takes one. */
	const [dropNote, setDropNote] = useState<string>();
	const inputRef = useRef<HTMLInputElement>(null);

	const pick = (next: File) => {
		if (inputRef.current) inputRef.current.value = "";
		setDropNote(undefined);
		onPick(next);
	};

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setDragging(false);
		const dropped = e.dataTransfer.files;
		if (!dropped?.length) return;
		pick(dropped[0]);
		// After the pick, which clears the note: the zone takes one file at a
		// time, and a drop of several should say which one it took.
		if (dropped.length > 1) setDropNote(`Only the first of the ${dropped.length} dropped files was taken.`);
	};

	const encodingNote = decoded ? describeEncoding(decoded) : undefined;

	return (
		<div className="space-y-3">
			<p className="text-sm font-medium text-primary">Upload your subtitle file</p>
			<div
				role="button"
				tabIndex={0}
				aria-label={file ? `Selected: ${file.name}. Press Enter to change` : "Choose an SRT or VTT file"}
				// Only a drag that carries files lights the zone up; text dragged
				// from the page is nothing the zone can take.
				onDragOver={(e) => { if (!dragHasFiles(e.dataTransfer)) return; e.preventDefault(); setDragging(true); }}
				// dragleave also fires when the pointer crosses onto the icon or
				// text inside the zone; only leaving the zone itself ends the drag.
				onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
				onDrop={handleDrop}
				onClick={() => inputRef.current?.click()}
				onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
				className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
					dragging ? "border-blue-400 bg-blue-500/5"
					: file ? "border-emerald-500/50 bg-emerald-500/5"
					: "border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-card)]"
				}`}
			>
				<input
					ref={inputRef}
					type="file"
					accept={SUBTITLE_FILE_ACCEPT}
					onChange={(e) => { if (e.target.files?.[0]) pick(e.target.files[0]); }}
					className="hidden"
					tabIndex={-1}
					aria-hidden="true"
				/>
				<div className="flex flex-col items-center justify-center py-10 px-6">
					{file ? (
						<>
							<div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
								<svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
							</div>
							<p className="text-sm font-medium text-primary">{file.name}</p>
							<p className="text-xs text-muted mt-1 tabular-nums">{formatFileSize(file.size)}</p>
							{encodingNote && (
								<p className="text-xs text-amber-500 mt-2 max-w-xs text-center" role="status">{encodingNote}</p>
							)}
						</>
					) : (
						<>
							<div className="w-12 h-12 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mb-3">
								<svg className="w-5 h-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
							</div>
							<p className="text-sm text-primary">Drop your .srt or .vtt file here</p>
							<p className="text-xs text-muted mt-1">or browse for it</p>
							{hint && <p className="text-xs text-muted mt-2">{hint}</p>}
						</>
					)}
				</div>
			</div>
			{/* Under the zone, not inside it: a button inside a control that is
			    itself a button has no semantics of its own for a screen reader,
			    and its key presses had to be kept from reaching the zone's. */}
			{file && (
				<div className="text-center">
					<button
						type="button"
						onClick={onClear}
						className="text-xs text-muted hover:text-primary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
					>
						Choose a different file
					</button>
				</div>
			)}
			{fileError && (
				<p className="text-xs text-red-500" role="alert">{fileError}</p>
			)}
			{dropNote && (
				<p className="text-xs text-muted" role="status">{dropNote}</p>
			)}
		</div>
	);
}
