/**
 * JSON for a <script type="application/ld+json"> block. JSON.stringify does
 * not escape HTML, so a `</script>` or `<!--` inside a string would end the
 * block early and let what follows run as markup. Every block here is built
 * from the catalog and from copy in the repository, so none can carry such a
 * string today; escaping at the one place they are made keeps that true for
 * whatever is added later. The escapes are JSON string escapes, so the
 * result parses to the same value.
 */
export function jsonLdHtml(data: unknown): string {
	return JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026");
}
