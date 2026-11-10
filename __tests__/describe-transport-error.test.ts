import { describe, it, expect } from "vitest";
import { describeTransportError } from "@/lib/translate-session";

const withStatus = (statusCode: number) => Object.assign(new Error("The server had an error"), { statusCode });

describe("describeTransportError", () => {
	it("names the HTTP status of an API failure", () => {
		expect(describeTransportError(withStatus(503), 30_000)).toBe("server returned 503");
	});

	it("unwraps the SDK's retry wrapper", () => {
		const wrapped = Object.assign(new Error("Failed after 3 attempts"), { lastError: withStatus(500) });
		expect(describeTransportError(wrapped, 30_000)).toBe("server returned 500");
	});

	it("reports a timeout with the limit that was hit", () => {
		const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
		expect(describeTransportError(timeout, 30_000)).toBe("no reply within 30s");
	});

	it("tells a malformed reply and a dropped connection apart", () => {
		expect(describeTransportError(new Error("No object generated: could not parse"), 30_000)).toBe("unusable response");
		expect(describeTransportError(new Error("fetch failed"), 30_000)).toBe("connection dropped");
	});

	it("falls back to a generic label", () => {
		expect(describeTransportError(new Error("something odd"), 30_000)).toBe("unexpected error");
		expect(describeTransportError("not an error", 30_000)).toBe("unknown error");
	});
});
