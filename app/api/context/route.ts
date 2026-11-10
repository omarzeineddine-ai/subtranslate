import { validateContextRequest } from "@/lib/context-request";
import { formatTitleContext, mergeTitleInfo, type TitleInfo, type TitleQuery } from "@/lib/title-context";
import { lookupTitle as lookupTmdb } from "@/lib/tmdb";
import { lookupTitle as lookupWikipedia } from "@/lib/wikipedia";

export const dynamic = "force-dynamic";

export type ContextSource = "wikipedia" | "tmdb";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * How long one provider may take before it counts as failed. A lookup is
 * a few requests in a row (Wikipedia tries up to four candidate pages, TMDB
 * makes up to three calls), and each normally answers in well under a
 * second. Without a limit, an upstream that accepts the connection and then
 * hangs keeps the user's "Looking up…" spinning until the platform ends the
 * function minutes later, and the other provider's answer, long since in
 * hand, is never shown.
 */
const LOOKUP_TIME_LIMIT_MS = 8_000;

/**
 * Run one provider's lookup. A provider that throws, or runs out of time, is
 * logged and treated as having nothing, so one flaky upstream never blocks
 * the other. Its requests also end when the client gives up on the lookup
 * (`clientSignal` is the request's), so a superseded lookup stops costing
 * upstream calls.
 */
async function attempt(
	source: ContextSource,
	lookup: (signal: AbortSignal) => Promise<TitleInfo | null>,
	clientSignal: AbortSignal,
) {
	// A plain timer rather than AbortSignal.timeout, so it is cleared the
	// moment the lookup settles instead of lingering for the full limit.
	const timeLimit = new AbortController();
	const timer = setTimeout(
		() => timeLimit.abort(new Error(`no answer within ${LOOKUP_TIME_LIMIT_MS / 1000}s`)),
		LOOKUP_TIME_LIMIT_MS,
	);
	try {
		return { source, info: await lookup(AbortSignal.any([clientSignal, timeLimit.signal])), failed: false };
	} catch (error) {
		console.error(`[context] ${source} lookup failed:`, error);
		return { source, info: null, failed: true };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Resolve a movie or show title into a ready-to-use translation context
 * string. Wikipedia is always queried and needs no key; TMDB joins in when
 * `TMDB_API_KEY` is set and enriches the result with character genders and
 * whatever Wikipedia lacked.
 */
export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body" }, 400);
	}
	const validation = validateContextRequest(body);
	if (!validation.ok) return json({ error: validation.error }, 400);
	const query: TitleQuery = validation.query;

	const apiKey = process.env.TMDB_API_KEY;
	const lookups = [attempt("wikipedia", (signal) => lookupWikipedia(query, { signal }), request.signal)];
	if (apiKey) lookups.push(attempt("tmdb", (signal) => lookupTmdb(query, { apiKey, signal }), request.signal));
	const results = await Promise.all(lookups);

	const found = results.filter((r) => r.info);
	if (!found.length) {
		const allFailed = results.every((r) => r.failed);
		return allFailed ? json({ error: "Title lookup failed" }, 502) : json({ error: "No matching title found" }, 404);
	}

	const [primary, ...rest] = found.map((r) => r.info as TitleInfo);
	const info = rest.reduce(mergeTitleInfo, primary);
	return json({
		context: formatTitleContext(info),
		match: { title: info.title, mediaType: info.mediaType, year: info.year },
		sources: found.map((r) => r.source),
	});
}
