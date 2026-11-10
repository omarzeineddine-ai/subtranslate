import Link from "next/link";
import { Fragment, type ReactNode } from "react";

export interface Crumb {
	/** The crumb's name; also its key, so one trail must not repeat a name. */
	label: string;
	/** Where the crumb leads. Left out for a crumb that only names a
	 * section with no page of its own, such as Guides. */
	href?: string;
	/** What to render instead of the label, when the label needs markup:
	 * the language pair's "Spanish → French" with "to" for screen readers. */
	display?: ReactNode;
}

/** The trail above a page's heading. The last crumb is the page itself and
 * is marked as the current one; the rest link where they say. `centered`
 * is for the language pages, whose heading is centred on wide screens. */
export function Breadcrumbs({ items, centered = false }: { items: Crumb[]; centered?: boolean }) {
	const last = items.length - 1;
	return (
		<nav aria-label="Breadcrumb" className={`animate-fade-in-up ${centered ? "lg:text-center" : ""}`}>
			<ol className={`flex items-center gap-1.5 text-xs text-muted ${centered ? "lg:justify-center" : ""}`}>
				{items.map((item, i) => {
					const content = item.display ?? item.label;
					return (
						<Fragment key={item.label}>
							{i > 0 && <li aria-hidden="true">/</li>}
							{i === last ? (
								<li className="text-primary" aria-current="page">{content}</li>
							) : item.href ? (
								<li><Link href={item.href} className="hover:text-primary transition-colors">{content}</Link></li>
							) : (
								<li className="text-secondary">{content}</li>
							)}
						</Fragment>
					);
				})}
			</ol>
		</nav>
	);
}
