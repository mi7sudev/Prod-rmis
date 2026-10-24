"use client";

// ============================================================================
// RMIS — collapsible posting section (Task 26, user direction).
// Key Competency runs a full page long, so on the public posting surfaces it
// renders as a DROPDOWN instead of an always-open block that pushes the rest
// of the description off-screen. Native <details>/<summary> — free keyboard
// and screen-reader semantics, no state to manage; the chevron rotates via
// the group-open variant. Closed by default everywhere.
// ============================================================================

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className,
  headingClassName,
}: {
  title: string;
  children: React.ReactNode;
  /** Very much closed by default — the whole point is keeping the long
      content out of the way until the reader asks for it. */
  defaultOpen?: boolean;
  className?: string;
  headingClassName?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group overflow-hidden rounded-xl border border-border bg-card", className)}
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-cloud/50 [&::-webkit-details-marker]:hidden">
        <h2 className={cn("text-base font-bold text-ink", headingClassName)}>{title}</h2>
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-stone transition-transform duration-200 group-open:rotate-180"
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </summary>
      <div className="border-t border-divider px-4 py-3.5">{children}</div>
    </details>
  );
}
