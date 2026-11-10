import { createOpenAITranslator } from "@/lib/openai-translator";
import { parseSrt, serializeCue } from "@/lib/srt-codec";
import { encodeBlockFrame, encodeStatusFrame } from "@/lib/stream-protocol";
import { runTranslationSession, type SessionEvent } from "@/lib/translate-session";
import { validateTranslationRequest } from "@/lib/translation-request";

export const dynamic = "force-dynamic";

// How long a translation may stream before the platform ends the function.
// A long film at the model's pace can take minutes, and the platform's
// default has changed before, so the limit is written down here rather than
// inherited. 300 s is the most every Vercel plan allows; on Pro or
// Enterprise it can go up to 800 s for longer files. When the limit cuts a
// run off, the client sees fewer cues than it sent and labels the download
// partial. Self-hosted (Docker) runs ignore this.
export const maxDuration = 300;

/** Response header carrying the request's reference. The client shows it
 * beside retry and failure messages, so a user's screenshot leads straight to
 * this request's lines in the Vercel logs (searchable by request ID). */
const REF_HEADER = "X-Request-Ref";

/** Vercel's own request ID when deployed; a random one elsewhere, which
 * still ties the client's message to the log line printed below. */
function requestRef(request: Request): string {
	return request.headers.get("x-vercel-id") ?? crypto.randomUUID().slice(0, 8);
}

/** Sent with the 401 that asks for a key, so the client can tell "bring your
 * own key" apart from every other rejection without matching on wording. */
const KEY_REQUIRED_CODE = "key_required";

/** Whether a visitor has to bring their own OpenAI key: true when the server
 * was deployed without one. The form asks before the first upload instead of
 * failing the request afterwards. */
export async function GET() {
	return Response.json(
		{ keyRequired: !process.env.OPENAI_API_KEY },
		{ headers: { "Cache-Control": "no-store" } },
	);
}

function json(body: unknown, status: number, ref: string) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", [REF_HEADER]: ref },
	});
}

/** The provider's own words for a refusal, for the log. The error object is
 * not logged whole: it carries the request it was made with. */
function refusalCause(error: unknown): string {
	const cause = (error as { cause?: unknown } | null)?.cause;
	return cause instanceof Error ? cause.message : "unknown";
}

function logEvent(event: SessionEvent) {
	if (
		event.event === "split_detected" ||
		event.event === "merge_detected" ||
		event.event === "empty_detected" ||
		event.event === "untranslated_detected" ||
		event.event === "language_drift_detected"
	) {
		console.error(`[translate] ${event.event} at indices: ${event.indices.join(", ")}`);
	}
	if (event.event === "per_segment_fallback") {
		console.error(`[translate] Per-segment fallback for ${event.indices.length} cues`);
	}
	if (event.event === "left_untranslated") {
		console.error(`[translate] Left untranslated at indices: ${event.indices.join(", ")}`);
	}
}

export async function POST(request: Request) {
	const ref = requestRef(request);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request body" }, 400, ref);
	}

	try {
		const validation = validateTranslationRequest(body);
		if (!validation.ok) {
			return json({ error: validation.error }, 400, ref);
		}
		const { content, language, netflixFormat, context } = validation.request;

		// The user's own key pays for the request when they sent one; the
		// server's is the fallback and may not be set at all. The provider only
		// reads the key when the first call goes out, and the session answers a
		// failed call by keeping the original text — so without this check a
		// keyless request streams the source file back as a finished translation.
		const ownKey = validation.request.apiKey;
		const apiKey = ownKey ?? process.env.OPENAI_API_KEY;
		if (!apiKey) {
			return json({ error: "An OpenAI API key is needed to translate", code: KEY_REQUIRED_CODE }, 401, ref);
		}

		const cues = parseSrt(content).filter((cue) => cue.text.trim());
		// Which key, never the key itself.
		console.log(`[translate] ref=${ref} ${cues.length} cues → ${language} (${ownKey ? "user" : "server"} key)`);

		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			async start(controller) {
				const adapter = createOpenAITranslator({ apiKey, language, netflixFormat, context });

				let refused = false;
				const onEvent = (event: SessionEvent) => {
					logEvent(event);
					if (event.event === "refused") refused = true;
					controller.enqueue(encoder.encode(encodeStatusFrame(event)));
				};

				let emitted = 0;
				const session = runTranslationSession(cues, adapter, {
					targetLanguage: language,
					signal: request.signal,
					onEvent,
				});
				try {
					for await (const cue of session) {
						controller.enqueue(encoder.encode(encodeBlockFrame(serializeCue(cue, ++emitted))));
					}
				} catch (error) {
					// The client cancelled: the request signal is aborted, the
					// session stops between batches, and the stream is already
					// gone, so an enqueue on it is expected to throw.
					if (request.signal.aborted) {
						console.log(`[translate] ref=${ref} Cancelled by client after ${emitted}/${cues.length} cues.`);
						return;
					}
					// The provider refused the key. The client has the reason in a
					// status frame, and erroring the stream would throw away any
					// frame not yet read, so end it cleanly: the cue count tells
					// the client the run stopped short.
					if (refused) {
						console.error(`[translate] ref=${ref} Refused after ${emitted}/${cues.length} cues (${ownKey ? "user" : "server"} key):`, refusalCause(error));
						controller.close();
						return;
					}
					// Fail the stream explicitly so the client sees a read error
					// instead of a stream that never closes.
					console.error(`[translate] ref=${ref} Failed after ${emitted}/${cues.length} cues:`, error);
					controller.error(error);
					return;
				}

				console.log(`[translate] ref=${ref} Done. Emitted ${emitted}/${cues.length} cues.`);
				controller.close();
			},
		});

		return new Response(stream, { headers: { [REF_HEADER]: ref } });
	} catch (error) {
		// This is the app's only real endpoint: a swallowed throw here (a
		// validator or parser bug, adapter construction failure) is otherwise
		// invisible in production logs.
		console.error("[translate] request failed:", error);
		return json({ error: "Error during translation" }, 500, ref);
	}
}
