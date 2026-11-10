/**
 * Subtitle file decoding — turns the bytes of an uploaded file into text.
 *
 * SRT files in the wild are frequently not UTF-8: older files, and most
 * non-English files from subtitle sites, are saved in a Windows code page.
 * Reading those as UTF-8 silently replaces every accented character with
 * U+FFFD, and the translator then works from garbage. This module sniffs a
 * BOM, tries strict UTF-8, and falls back to a Windows code page: 1251 when
 * the bytes read as Cyrillic, 1250 when they read as Central European,
 * otherwise 1252 so the text is at least intact for Western European
 * languages. The caller is told which encoding won so it
 * can say so in the UI.
 */

import { parseSrt } from "@/lib/srt-codec";

export type SubtitleEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1250" | "windows-1251" | "windows-1252";

export interface DecodedSubtitleFile {
	text: string;
	encoding: SubtitleEncoding;
	/** True when the bytes were not valid UTF-8 and a legacy code page was
	 * assumed — worth surfacing, because the guess can be wrong for files in
	 * Central European and other code pages. */
	fallback: boolean;
}

function sniffBom(bytes: Uint8Array): SubtitleEncoding | undefined {
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
	return undefined;
}

const isAsciiLetter = (byte: number) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);

/**
 * Whether the bytes of a non-UTF-8 file read as Cyrillic. In Windows-1251
 * every Cyrillic letter is a byte from 0xC0 up, so most letters of a Russian,
 * Ukrainian or Bulgarian file are high bytes and they sit side by side in
 * words; a Western European file is ASCII letters with an occasional
 * accented one between them.
 */
function looksCyrillic(bytes: Uint8Array): boolean {
	let high = 0;
	let ascii = 0;
	let adjacent = false;
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] >= 0xc0) {
			high++;
			if (i > 0 && bytes[i - 1] >= 0xc0) adjacent = true;
		} else if (isAsciiLetter(bytes[i])) {
			ascii++;
		}
	}
	return adjacent && high > ascii;
}

/** Bytes Windows-1252 leaves undefined and Windows-1250 uses for Ť, Ź and ť. */
const UNDEFINED_IN_1252 = new Set([0x8d, 0x8f, 0x9d]);

/** Bytes that are a symbol in Windows-1252 (£ ¥ ¯ ³ ¹ ¼ ¾ ¿) and a letter in
 * Windows-1250 (Ł Ą Ż ł ą Ľ ľ ż). */
const SYMBOL_IN_1252 = new Set([0xa3, 0xa5, 0xaf, 0xb3, 0xb9, 0xbc, 0xbe, 0xbf]);

/**
 * Whether the bytes of a non-UTF-8 file read as Central European. Polish,
 * Czech and Slovak put letters on bytes that Windows-1252 either leaves
 * undefined or uses for symbols, and a symbol with a letter on both sides
 * ("by³o" for "było") is a letter read through the wrong code page. A symbol
 * at a word's edge proves nothing: Spanish opens a question with ¿ and a
 * measurement ends in ³.
 */
function looksCentralEuropean(bytes: Uint8Array): boolean {
	for (let i = 0; i < bytes.length; i++) {
		if (UNDEFINED_IN_1252.has(bytes[i])) return true;
		if (SYMBOL_IN_1252.has(bytes[i]) && isAsciiLetter(bytes[i - 1]) && isAsciiLetter(bytes[i + 1])) return true;
	}
	return false;
}

function guessCodePage(bytes: Uint8Array): SubtitleEncoding {
	if (looksCyrillic(bytes)) return "windows-1251";
	if (looksCentralEuropean(bytes)) return "windows-1250";
	return "windows-1252";
}

const ENCODING_LABELS: Record<SubtitleEncoding, string> = {
	"utf-8": "UTF-8",
	"utf-16le": "UTF-16",
	"utf-16be": "UTF-16",
	"windows-1250": "Windows-1250 (Central European)",
	"windows-1251": "Windows-1251 (Cyrillic)",
	"windows-1252": "Windows-1252",
};

/** Decode subtitle bytes. Never throws; the fallback decoder accepts any byte. */
export function decodeSubtitleBytes(input: ArrayBuffer | Uint8Array): DecodedSubtitleFile {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

	const bom = sniffBom(bytes);
	if (bom) {
		return { text: new TextDecoder(bom).decode(bytes), encoding: bom, fallback: false };
	}

	try {
		return {
			text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
			encoding: "utf-8",
			fallback: false,
		};
	} catch {
		const encoding = guessCodePage(bytes);
		return { text: new TextDecoder(encoding).decode(bytes), encoding, fallback: true };
	}
}

/** What the file pickers take. A WebVTT file is read into SRT cues, and
 * every download is SRT. */
export const SUBTITLE_FILE_ACCEPT = ".srt,.vtt";

const SUBTITLE_EXTENSION_RE = /\.(?:srt|vtt)$/i;

export const isSubtitleFilename = (name: string): boolean => SUBTITLE_EXTENSION_RE.test(name);

/** "movie.en.vtt" → "movie.en", ready for a new extension. */
export const withoutSubtitleExtension = (name: string): string => name.replace(SUBTITLE_EXTENSION_RE, "");

/** Whether the text holds at least one cue with text, by the same parse the
 * translator and the cleaner run. A file without one is rejected at pick time:
 * there is nothing to translate, and cleaning it gives an empty download. */
export const hasSubtitleCues = (text: string): boolean => parseSrt(text).some((cue) => cue.text.trim());

/** Why a file failed hasSubtitleCues, shown under the drop zone. */
export const NO_CUES_MESSAGE = "No subtitle cues were found in this file. Check that it is a valid SRT or VTT file.";

/** Read an uploaded file with the encoding detection above. */
export async function readSubtitleFile(file: File): Promise<DecodedSubtitleFile> {
	return decodeSubtitleBytes(await file.arrayBuffer());
}

/** A file's size as the drop zone shows it: "1.5 KB" up to a megabyte,
 * "2.0 MB" above. The space is a no-break one, so the number and its unit
 * never end up on different lines under a filename. */
export function formatFileSize(bytes: number): string {
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)}\u00a0KB`;
	return `${(kb / 1024).toFixed(1)}\u00a0MB`;
}

/** The note shown under a selected file that was not UTF-8, or undefined
 * when there is nothing to say. */
export function describeEncoding(decoded: DecodedSubtitleFile): string | undefined {
	if (!decoded.fallback) return undefined;
	return `This file isn't UTF-8, so it was read as ${ENCODING_LABELS[decoded.encoding]}. If the letters look wrong, re-save it as UTF-8 first.`;
}
