"use client";

import {
	CLEAN_OPTION_META,
	cleanSrt,
	DEFAULT_CLEAN_OPTIONS,
	toggleCleanOption,
	type CleanOptionMeta,
	type CleanOptions,
	type CleanStats,
} from "@/lib/clean";
import { triggerFileDownload } from "@/lib/file-download";
import {
	hasSubtitleCues,
	isSubtitleFilename,
	NO_CUES_MESSAGE,
	readSubtitleFile,
	withoutSubtitleExtension,
	type DecodedSubtitleFile,
} from "@/lib/subtitle-file";
import React from "react";
import { CleanDoneScreen } from "./CleanDoneScreen";
import { DropZone } from "./DropZone";
import { usePageDropGuard } from "./usePageDropGuard";

type Status = "idle" | "done";

const PRIMARY_OPTIONS = CLEAN_OPTION_META.filter((o) => o.group === "rules");
const BRACKET_OPTIONS = CLEAN_OPTION_META.filter((o) => o.group === "brackets");
const CASE_OPTIONS = CLEAN_OPTION_META.filter((o) => o.group === "case");

function CheckRow({
	option,
	checked,
	onChange,
}: {
	option: CleanOptionMeta;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<label className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-elevated transition-colors cursor-pointer">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				// A native checkbox: without the forms plugin, rounded, border and text
				// colour classes do nothing to it, and accent-color is what sets the
				// tick's colour in both themes.
				className="mt-0.5 h-4 w-4 accent-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
			/>
			<span className="flex-1 min-w-0">
				<span className="block text-sm text-primary">{option.label}</span>
				{option.hint && (
					<span className="block text-xs text-muted mt-0.5">{option.hint}</span>
				)}
			</span>
		</label>
	);
}

export default function CleanClient() {
	const [status, setStatus] = React.useState<Status>("idle");
	const [file, setFile] = React.useState<File | null>(null);
	const [decoded, setDecoded] = React.useState<DecodedSubtitleFile | null>(null);
	const [options, setOptions] = React.useState<CleanOptions>(DEFAULT_CLEAN_OPTIONS);
	const [stats, setStats] = React.useState<CleanStats | null>(null);
	const [outputFilename, setOutputFilename] = React.useState("");
	const [cleanedContent, setCleanedContent] = React.useState("");
	/** Why the last picked file was rejected; shown under the drop zone. */
	const [fileError, setFileError] = React.useState<string | null>(null);
	/** The file whose decode is allowed to land; a faster second pick wins. */
	const pendingFile = React.useRef<File | null>(null);
	usePageDropGuard();

	const setOpt = (key: keyof CleanOptions, value: boolean) => {
		setOptions((prev) => toggleCleanOption(prev, key, value));
	};

	/** Back to an empty drop zone; a decode still in flight is dropped. */
	const clearFile = () => {
		pendingFile.current = null;
		setFile(null);
		setFileError(null);
		setDecoded(null);
	};

	const handleFile = async (f: File) => {
		if (!isSubtitleFilename(f.name)) {
			// Drop the previous pick too: left in place, it sat under the error
			// and was what "Clean & download" would then clean.
			clearFile();
			setFileError("Please choose a .srt or .vtt file.");
			return;
		}
		setFileError(null);
		pendingFile.current = f;
		setFile(f);
		setDecoded(null);
		const result = await readSubtitleFile(f);
		if (pendingFile.current !== f) return;
		// Same rule as the translator's form: a file with no cue text would
		// only clean to an empty download.
		if (!hasSubtitleCues(result.text)) {
			clearFile();
			setFileError(NO_CUES_MESSAGE);
			return;
		}
		setDecoded(result);
	};


	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!file || !decoded) return;
		const { cleaned, stats: s } = cleanSrt(decoded.text, options);
		const base = withoutSubtitleExtension(file.name);
		const fname = `${base}-cleaned.srt`;
		setOutputFilename(fname);
		setCleanedContent(cleaned);
		setStats(s);
		triggerFileDownload(fname, cleaned);
		setStatus("done");
	};

	/** Back to the form with the same file and options, to adjust a rule the
	 * preview showed was wrong and clean again without picking the file anew. */
	const changeOptions = () => {
		setStatus("idle");
		setStats(null);
		setOutputFilename("");
		setCleanedContent("");
	};

	const reset = () => {
		changeOptions();
		clearFile();
	};

	return (
		<main id="main" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full grow py-8">
				{status === "idle" && (
					<form onSubmit={handleSubmit} className="space-y-8 max-w-3xl mx-auto py-12">
						<div className="text-center space-y-3">
							<h1 className="text-3xl font-light tracking-tight text-primary">Clean your SRT</h1>
							<p className="text-secondary text-sm">
								Strip formatting tags, brackets, speaker labels, and more. Runs fully in your browser.
							</p>
						</div>

						<div className="rounded-3xl ring-1 ring-[var(--ring)] bg-card shadow-inset p-6 sm:p-8 space-y-8">
							<DropZone
								file={file}
								decoded={decoded}
								fileError={fileError}
								onPick={(f) => void handleFile(f)}
								onClear={clearFile}
								hint="Nothing is uploaded — cleaning runs in your browser."
							/>

							{/* Options */}
							<div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
								<div>
									<h2 className="text-xs uppercase tracking-wider text-muted mb-2">Cleanup rules</h2>
									{PRIMARY_OPTIONS.map((opt) => (
										<CheckRow
											key={opt.key}
											option={opt}
											checked={options[opt.key]}
											onChange={(v) => setOpt(opt.key, v)}
										/>
									))}
								</div>
								<div className="space-y-6">
									<div>
										<h2 className="text-xs uppercase tracking-wider text-muted mb-2">
											Remove text between
										</h2>
										{BRACKET_OPTIONS.map((opt) => (
											<CheckRow
												key={opt.key}
												option={opt}
												checked={options[opt.key]}
												onChange={(v) => setOpt(opt.key, v)}
											/>
										))}
									</div>
									<div>
										<h2 className="text-xs uppercase tracking-wider text-muted mb-2">Case</h2>
										{CASE_OPTIONS.map((opt) => (
											<CheckRow
												key={opt.key}
												option={opt}
												checked={options[opt.key]}
												onChange={(v) => setOpt(opt.key, v)}
											/>
										))}
									</div>
								</div>
							</div>

							<button
								type="submit"
								disabled={!file || !decoded}
								className={`w-full text-sm py-3 px-6 rounded-full font-medium transition-[background-color,color,opacity,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
									file && decoded
										? "bg-[var(--text)] text-[var(--bg)] hover:opacity-90 active:scale-[0.98]"
										: "bg-[var(--bg-elevated)] text-muted cursor-not-allowed ring-1 ring-[var(--ring)]"
								}`}
							>
								{file && !decoded ? "Reading file…" : file ? "Clean & download" : "Select a file to continue"}
							</button>
						</div>
					</form>
				)}

				{status === "done" && stats && (
					<CleanDoneScreen
						stats={stats}
						filename={outputFilename}
						content={cleanedContent}
						onChangeOptions={changeOptions}
						onReset={reset}
					/>
				)}
		</main>
	);
}
