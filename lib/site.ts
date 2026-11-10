/**
 * Where this deployment lives. Nothing here names a particular domain, so a
 * fork's canonicals, sitemap and outgoing requests point at the fork.
 *
 * `SITE_URL` wins when set. On Vercel the project's production domain is the
 * fallback, so a deployment there needs no configuration. Anywhere else the
 * fallback is localhost, which is right for development and visibly wrong in
 * production rather than silently someone else's address.
 *
 * Most pages are prerendered, so the value is read at build time: set it
 * before `next build` (or as a Docker build argument), not only at run time.
 */
function resolveSiteUrl(): string {
	const configured = process.env.SITE_URL?.trim();
	if (configured) return configured;
	const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
	if (vercelDomain) return `https://${vercelDomain}`;
	return "http://localhost:3000";
}

/** The canonical origin, for absolute URLs in metadata, structured data, the
 * sitemap, and robots. Relative canonicals resolve against it through
 * `metadataBase` in the root layout. No trailing slash. */
export const SITE_URL = new URL(resolveSiteUrl()).origin;

/** The origin without its scheme ("example.com"), for showing in text. */
export const SITE_HOST = new URL(SITE_URL).host;
