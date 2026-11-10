import { describe, it, expect } from "vitest";
import { leavesPageInApp, type LinkClick } from "@/lib/leave-guard";

const click = (overrides: Partial<LinkClick> = {}): LinkClick => ({
	button: 0,
	metaKey: false,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	defaultPrevented: false,
	href: "https://srt.example/clean",
	target: "",
	download: false,
	currentHref: "https://srt.example/translate",
	...overrides,
});

describe("leavesPageInApp", () => {
	it("catches a plain click on a link to another page of the site", () => {
		expect(leavesPageInApp(click())).toBe(true);
		expect(leavesPageInApp(click({ target: "_self" }))).toBe(true);
	});

	it("counts a change of query string as leaving", () => {
		expect(leavesPageInApp(click({ href: "https://srt.example/translate?lang=French" }))).toBe(true);
	});

	it("lets through clicks that open the link somewhere else", () => {
		expect(leavesPageInApp(click({ metaKey: true }))).toBe(false);
		expect(leavesPageInApp(click({ ctrlKey: true }))).toBe(false);
		expect(leavesPageInApp(click({ shiftKey: true }))).toBe(false);
		expect(leavesPageInApp(click({ altKey: true }))).toBe(false);
		expect(leavesPageInApp(click({ button: 1 }))).toBe(false);
		expect(leavesPageInApp(click({ target: "_blank" }))).toBe(false);
		expect(leavesPageInApp(click({ download: true }))).toBe(false);
	});

	it("lets through a click another handler already cancelled", () => {
		expect(leavesPageInApp(click({ defaultPrevented: true }))).toBe(false);
	});

	it("lets through a jump within the page", () => {
		expect(leavesPageInApp(click({ href: "https://srt.example/translate#faq" }))).toBe(false);
	});

	it("leaves other sites to the browser's own prompt", () => {
		expect(leavesPageInApp(click({ href: "https://ko-fi.com/someone" }))).toBe(false);
	});

	it("lets through a link it cannot parse", () => {
		expect(leavesPageInApp(click({ href: "not a url" }))).toBe(false);
	});
});
