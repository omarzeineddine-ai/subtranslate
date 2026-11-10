import { describe, it, expect } from "vitest";
import {
	LINEBREAK_SENTINEL,
	buildBatchSystemPrompt,
	buildSingleSystemPrompt,
	describeTargetLanguage,
} from "@/lib/prompts";

describe("buildBatchSystemPrompt", () => {
	it("names the target language and the exact segment count", () => {
		const prompt = buildBatchSystemPrompt(42, "Polish");
		expect(prompt).toContain("Polish");
		expect(prompt).toContain("42 numbered input segments");
		expect(prompt).toContain("EXACTLY 42 translations");
	});

	it("explains the line-break sentinel", () => {
		expect(buildBatchSystemPrompt(3, "French")).toContain(LINEBREAK_SENTINEL);
	});

	it("includes Netflix rules only when enabled", () => {
		expect(buildBatchSystemPrompt(3, "French", { netflixFormat: true })).toContain(
			"NETFLIX FORMATTING",
		);
		expect(buildBatchSystemPrompt(3, "French")).not.toContain(
			"NETFLIX FORMATTING",
		);
	});
});

describe("Netflix line length", () => {
	it("keeps a Latin-script language to 42 characters per line", () => {
		const prompt = buildBatchSystemPrompt(3, "French", { netflixFormat: true });
		expect(prompt).toContain("Max 42 characters per line");
		expect(prompt).toContain("exceeds 42 chars");
	});

	it("uses the shorter limits of wide-character scripts", () => {
		expect(buildBatchSystemPrompt(3, "Japanese", { netflixFormat: true })).toContain("Max 13 characters per line");
		expect(buildBatchSystemPrompt(3, "Korean", { netflixFormat: true })).toContain("Max 16 characters per line");
		expect(buildSingleSystemPrompt("Traditional Chinese", { netflixFormat: true })).toContain("exceeds 16 chars");
	});
});

describe("buildSingleSystemPrompt", () => {
	it("names the target language", () => {
		expect(buildSingleSystemPrompt("Japanese")).toContain("Japanese");
	});

	it("forbids commentary and merging", () => {
		const prompt = buildSingleSystemPrompt("Japanese");
		expect(prompt).toContain("ONLY the translation");
		expect(prompt).toContain("do not invent a continuation");
	});

	it("includes Netflix rules only when enabled", () => {
		expect(buildSingleSystemPrompt("Korean", { netflixFormat: true })).toContain(
			"NETFLIX FORMATTING",
		);
		expect(buildSingleSystemPrompt("Korean")).not.toContain("NETFLIX FORMATTING");
	});
});

describe("optional user context", () => {
	const CONTEXT = "Crime drama. Anna (woman, detective), Marek (man, suspect).";

	it("batch prompt embeds the context with usage instructions", () => {
		const prompt = buildBatchSystemPrompt(5, "Polish", { context: CONTEXT });
		expect(prompt).toContain("VIDEO CONTEXT");
		expect(prompt).toContain(CONTEXT);
		expect(prompt).toContain("speaker gender");
		expect(prompt).toContain("never content to translate");
	});

	it("single prompt embeds the context too", () => {
		const prompt = buildSingleSystemPrompt("Polish", { context: CONTEXT });
		expect(prompt).toContain("VIDEO CONTEXT");
		expect(prompt).toContain(CONTEXT);
	});

	it("omits the block entirely when context is missing or blank", () => {
		expect(buildBatchSystemPrompt(5, "Polish")).not.toContain("VIDEO CONTEXT");
		expect(buildBatchSystemPrompt(5, "Polish", { context: "   " })).not.toContain(
			"VIDEO CONTEXT",
		);
		expect(buildSingleSystemPrompt("Polish", { context: "" })).not.toContain(
			"VIDEO CONTEXT",
		);
	});

	it("trims surrounding whitespace from the context", () => {
		const prompt = buildBatchSystemPrompt(5, "Polish", {
			context: `\n  ${CONTEXT}  \n`,
		});
		expect(prompt).toContain(`\n${CONTEXT}`);
		expect(prompt.endsWith(CONTEXT)).toBe(true);
	});
});

describe("target-language fidelity rule", () => {
	it("batch prompt forbids leaving segments untranslated or in English", () => {
		const prompt = buildBatchSystemPrompt(10, "Polish");
		expect(prompt).toContain("TARGET LANGUAGE RULE");
		expect(prompt).toContain("must be written in Polish");
		expect(prompt).toContain("English is NOT the target");
	});

	it("single prompt forbids leaving the segment untranslated or in English", () => {
		const prompt = buildSingleSystemPrompt("Polish");
		expect(prompt).toContain("must be written in Polish");
		expect(prompt).toContain("English is NOT the target");
	});

	it("does not disclaim English when English IS the target", () => {
		expect(buildBatchSystemPrompt(10, "English")).not.toContain(
			"English is NOT the target",
		);
		expect(buildSingleSystemPrompt("English")).not.toContain(
			"English is NOT the target",
		);
	});
});

describe("regional variant steering", () => {
	it("expands Portuguese (Portugal) into an explicit European Portuguese spec", () => {
		const spec = describeTargetLanguage("Portuguese (Portugal)");
		expect(spec).toContain("European Portuguese");
		expect(spec).toContain("NEVER use Brazilian Portuguese");
	});

	it("expands Spanish (Spain) into an explicit Castilian spec", () => {
		const spec = describeTargetLanguage("Spanish (Spain)");
		expect(spec).toContain("Castilian");
		expect(spec).toContain("NEVER use Latin American Spanish");
	});

	it("passes non-variant languages through untouched", () => {
		expect(describeTargetLanguage("Portuguese")).toBe("Portuguese");
		expect(describeTargetLanguage("Polish")).toBe("Polish");
	});

	it("both prompt builders carry the variant spec", () => {
		expect(buildBatchSystemPrompt(5, "Portuguese (Portugal)")).toContain(
			"NEVER use Brazilian Portuguese",
		);
		expect(buildSingleSystemPrompt("Portuguese (Portugal)")).toContain(
			"NEVER use Brazilian Portuguese",
		);
	});

	it("plain Portuguese prompts are not steered to a variant", () => {
		expect(buildBatchSystemPrompt(5, "Portuguese")).not.toContain(
			"European Portuguese",
		);
	});
});
