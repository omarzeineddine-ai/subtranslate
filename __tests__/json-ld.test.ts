import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "@/lib/json-ld";

describe("jsonLdHtml", () => {
	it("keeps a script-ending string from ending the block", () => {
		const html = jsonLdHtml({ name: "a </script><script>alert(1)</script> b & c" });
		expect(html).not.toContain("<");
		expect(html).not.toContain(">");
		expect(html).not.toContain("&");
	});

	it("parses back to the same value", () => {
		const data = { name: "a </script> & <!-- b", n: 1, list: ["<", ">", "&"] };
		expect(JSON.parse(jsonLdHtml(data))).toEqual(data);
	});
});
