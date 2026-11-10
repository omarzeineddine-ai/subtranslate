import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAITranslatorConfig } from "@/lib/openai-translator";
import type { TranslatorAdapter } from "@/lib/translate-session";

/** The route's translator, replaced so no test reaches the network: each
 * test sets the adapter it wants and reads back the config the route built. */
const translator = vi.hoisted(() => ({
	configs: [] as unknown[],
	adapter: undefined as unknown,
}));

vi.mock("@/lib/openai-translator", () => ({
	createOpenAITranslator: (config: unknown) => {
		translator.configs.push(config);
		return translator.adapter;
	},
}));

import { GET, POST } from "@/app/api/route";

const SRT = "1\n00:00:01,000 --> 00:00:02,000\nHello there.\n";
const USER_KEY = "sk-user-key-1234567890";
const SERVER_KEY = "sk-server-key-1234567890";

const post = (body: unknown) =>
	POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) }));

const echoAdapter = (overrides: Partial<TranslatorAdapter> = {}): TranslatorAdapter => ({
	countTokens: (text) => text.split(/\s+/).length,
	translateBatch: async (segments) => segments.map((s) => `T:${s}`),
	translateSingle: async (segment) => `S:${segment}`,
	...overrides,
});

const lastConfig = () => translator.configs.at(-1) as OpenAITranslatorConfig;

describe("POST /api", () => {
	let logged: string[];

	beforeEach(() => {
		translator.configs.length = 0;
		translator.adapter = echoAdapter();
		logged = [];
		const record = (...args: unknown[]) => {
			logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" "));
		};
		vi.spyOn(console, "log").mockImplementation(record);
		vi.spyOn(console, "error").mockImplementation(record);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("asks for a key when the server has none and the request brings none", async () => {
		vi.stubEnv("OPENAI_API_KEY", "");

		const response = await post({ content: SRT, language: "Spanish" });

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "An OpenAI API key is needed to translate",
			code: "key_required",
		});
		expect(translator.configs).toHaveLength(0);
	});

	it("reports an invalid request before it looks at the key", async () => {
		vi.stubEnv("OPENAI_API_KEY", "");

		const response = await post({ content: SRT, language: "Klingon" });

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Unsupported language" });
	});

	it("translates with the user's own key when the server has none", async () => {
		vi.stubEnv("OPENAI_API_KEY", "");

		const response = await post({ content: SRT, language: "Spanish", apiKey: USER_KEY });

		expect(response.status).toBe(200);
		expect(await response.text()).toContain("T:Hello there.");
		expect(lastConfig().apiKey).toBe(USER_KEY);
	});

	it("prefers the user's key over the server's", async () => {
		vi.stubEnv("OPENAI_API_KEY", SERVER_KEY);

		const response = await post({ content: SRT, language: "Spanish", apiKey: USER_KEY });
		await response.text();

		expect(lastConfig().apiKey).toBe(USER_KEY);
	});

	it("falls back to the server's key when the request brings none", async () => {
		vi.stubEnv("OPENAI_API_KEY", SERVER_KEY);

		const response = await post({ content: SRT, language: "Spanish" });
		await response.text();

		expect(response.status).toBe(200);
		expect(lastConfig().apiKey).toBe(SERVER_KEY);
	});

	it("rejects a malformed key instead of spending the server's", async () => {
		vi.stubEnv("OPENAI_API_KEY", SERVER_KEY);

		const response = await post({ content: SRT, language: "Spanish", apiKey: "not a key at all" });

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "That does not look like an API key" });
		expect(translator.configs).toHaveLength(0);
	});

	it("never writes either key to the log", async () => {
		vi.stubEnv("OPENAI_API_KEY", SERVER_KEY);
		const refusal = new Error("Incorrect API key provided");
		translator.adapter = echoAdapter({
			classifyError: () => "refused",
			describeRefusal: () => "invalid_key",
			translateBatch: async () => { throw refusal; },
		});

		await (await post({ content: SRT, language: "Spanish", apiKey: USER_KEY })).text();
		translator.adapter = echoAdapter();
		await (await post({ content: SRT, language: "Spanish" })).text();

		expect(logged.length).toBeGreaterThan(0);
		for (const line of logged) {
			expect(line).not.toContain(USER_KEY);
			expect(line).not.toContain(SERVER_KEY);
		}
		// Which key paid is logged; that is what a support question needs.
		expect(logged.some((line) => line.includes("(user key)"))).toBe(true);
		expect(logged.some((line) => line.includes("(server key)"))).toBe(true);
	});

	it("ends a refused run cleanly, with the reason on the stream", async () => {
		vi.stubEnv("OPENAI_API_KEY", "");
		const refusal = new Error("You have no credits remaining");
		translator.adapter = echoAdapter({
			classifyError: () => "refused",
			describeRefusal: () => "no_credits",
			translateBatch: async () => { throw refusal; },
		});

		const response = await post({ content: SRT, language: "Spanish", apiKey: USER_KEY });

		// Reading to the end must not throw: an errored stream would drop the
		// frame that says why.
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toContain('__STATUS__:{"event":"refused","reason":"no_credits"}');
		expect(text).not.toContain("Hello there.");
	});
});

describe("GET /api", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("says a key is required when the server has none", async () => {
		vi.stubEnv("OPENAI_API_KEY", "");
		const response = await GET();
		expect(await response.json()).toEqual({ keyRequired: true });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("says no key is required when the server has its own", async () => {
		vi.stubEnv("OPENAI_API_KEY", "sk-server-key-1234567890");
		const response = await GET();
		expect(await response.json()).toEqual({ keyRequired: false });
	});
});
