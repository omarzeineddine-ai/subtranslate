import { describe, expect, it } from "vitest";
import { formatFileSize } from "@/lib/subtitle-file";

describe("formatFileSize", () => {
	it("shows kilobytes with one decimal below a megabyte", () => {
		expect(formatFileSize(0)).toBe("0.0\u00a0KB");
		expect(formatFileSize(1536)).toBe("1.5\u00a0KB");
		expect(formatFileSize(1024 * 1024 - 1)).toBe("1024.0\u00a0KB");
	});

	it("switches to megabytes from a megabyte up", () => {
		expect(formatFileSize(1024 * 1024)).toBe("1.0\u00a0MB");
		expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0\u00a0MB");
		expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5\u00a0MB");
	});
});
