import Link from "next/link";

/** The closing call to action on the home, languages and language pages: a
 * heading, a line under it, and one primary link. */
export function CtaSection({ title, text, href, label }: { title: string; text: string; href: string; label: string }) {
	return (
		<section className="text-center py-8">
			<h2 className="text-2xl font-light tracking-tight text-primary">{title}</h2>
			<p className="text-secondary text-sm mt-2">{text}</p>
			<div className="mt-6">
				<Link
					href={href}
					className="inline-flex items-center gap-2 rounded-full bg-[var(--text)] text-[var(--bg)] px-8 py-3 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-[opacity,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
				>
					{label} <span aria-hidden="true">&rarr;</span>
				</Link>
			</div>
		</section>
	);
}
