import type { ReactNode } from "react";

/** A card drawn as a window with a file name in its title bar, for showing
 * a subtitle file's contents: the home page's demo and the guide's example. */
export function FileWindow({ name, className = "", children }: { name: string; className?: string; children: ReactNode }) {
	return (
		<div className={`rounded-3xl ring-1 ring-[var(--ring)] bg-card shadow-inset overflow-hidden ${className}`}>
			<div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
				<div className="flex gap-1.5" aria-hidden="true">
					<div className="h-2.5 w-2.5 rounded-full bg-elevated" />
					<div className="h-2.5 w-2.5 rounded-full bg-elevated" />
					<div className="h-2.5 w-2.5 rounded-full bg-elevated" />
				</div>
				<span className="ml-2 text-xs text-muted font-mono">{name}</span>
			</div>
			{children}
		</div>
	);
}
