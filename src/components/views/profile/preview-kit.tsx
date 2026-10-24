"use client";

// ============================================================================
// RMIS — Profile builder · Read-only PREVIEW KIT (shared visual language).
//
// The read-only preview used to render bare label/value text pairs with a
// lonely "—" dash for empty fields — structurally invisible on the white
// panel, no hierarchy, and it read as broken rather than "quiet". This kit
// gives every section's preview ONE designed language:
//
//   • PreviewGrid  — hairline spec-sheet: cells sit on a 1px-gap grid so the
//     wrapper's border color shows through the gaps as perfect hairlines
//     (no divide-x math, no doubled borders). Desktop = 2 columns, phones =
//     a single divided column.
//   • PreviewField — uppercase micro label over a readable value; empty
//     fields say "Not provided" in a muted italic instead of a stray dash.
//     (Task 23 — the optional leading icon chip is RETIRED: the user asked
//     for icon-free tables, so cells are pure label + value.)
//   • PreviewYesNo — Yes/No answers as compact badges (ok-green check vs
//     neutral dash) instead of raw text.
//   • EntryTile    — the list-section entry row (Education, Work Experience,
//     Training, Eligibility, Awards) on the SAME reui Item anatomy as the
//     Supporting Documents rows (outline Item + ItemContent/ItemActions):
//     title plus a dot-separated fact line (the documents rows' separator
//     dots). The per-row icon chip the rows used to anchor with was RETIRED
//     (user request 2026-10-21, Task 23: "remove the icons on the table" —
//     the section header already carries the glyph). Shared by edit and
//     preview modes so sections never shape-shift.
//
// Everything is token-driven (bg-card / bg-cloud / border-border / text-ok /
// .chip tones) so dark mode inherits automatically.
// ============================================================================

import type { ReactNode } from "react";
import { Check, Minus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { iconBtnBad } from "@/components/ui/buttons";
import { cn } from "@/lib/utils";

// ── Spec-sheet grid ─────────────────────────────────────────────────────────

/** Hairline field grid. Cells carry their own border-b (last row's bottom
 *  edge is the wrapper border, so `last:border-b-0` keeps it single); the
 *  wrapper rounds/clips. `verticalDividers` draws the column split on
 *  left-column cells — ONLY safe on grids without full-width cells (a
 *  spanning cell shifts the odd/even column parity, so those grids pass
 *  false and read as clean stacked rows instead). Phones collapse to one
 *  column either way. */
export function PreviewGrid({
  children,
  className,
  verticalDividers = true,
}: {
  children: ReactNode;
  className?: string;
  verticalDividers?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card",
        "shadow-[0_1px_2px_rgba(14,28,38,0.05)]",
        "sm:grid-cols-2",
        verticalDividers && "pg-divided",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One cell of the spec sheet — bottom divider on every cell except the
 *  last (the wrapper border closes the sheet there). */
export function PreviewCell({
  children,
  full,
  className,
}: {
  children: ReactNode;
  /** Span both columns (long values like Present Address). */
  full?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border bg-card p-3.5 last:border-b-0 sm:p-4", full && "sm:col-span-2", className)}>
      {children}
    </div>
  );
}

/** Cell label — the micro eyebrow used across the kit. */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone">{children}</p>
  );
}

// ── Field cells ─────────────────────────────────────────────────────────────

/** Read-only field: label eyebrow + value. Empty renders a calm "Not
 *  provided" (screen readers get the same, plus the label for context).
 *  Task 23 — pure text: the leading icon chip the key fields used to carry
 *  is retired (icon-free tables). */
export function PreviewField({
  label,
  value,
  full,
}: {
  label: string;
  value: string | null | undefined;
  full?: boolean;
}) {
  const text = (value ?? "").trim();
  const empty = text === "";
  return (
    <PreviewCell full={full}>
      <FieldLabel>{label}</FieldLabel>
      {empty ? (
        <p className="mt-1.5 text-sm italic leading-relaxed text-stone/60">
          Not provided<span className="sr-only"> — {label} has no value yet</span>
        </p>
      ) : (
        <p className="mt-1.5 min-w-0 break-words text-[15px] font-medium leading-relaxed text-ink">{text}</p>
      )}
    </PreviewCell>
  );
}

/** Yes/No answer as a badge: ok-green check chip for Yes, neutral dash chip
 *  for No — scannable without reading. */
export function PreviewYesNo({ label, value }: { label: string; value: boolean }) {
  return (
    <PreviewCell>
      <FieldLabel>{label}</FieldLabel>
      <span
        className={cn(
          "mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          value ? "bg-ok-bg text-ok" : "bg-cloud text-stone",
        )}
      >
        {value ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {value ? "Yes" : "No"}
      </span>
    </PreviewCell>
  );
}

/** Quiet inline note (e.g. "No character references added yet") with an
 *  accent bar — softer than a warning, louder than body text. */
export function PreviewNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-cloud/50 px-4 py-3.5">
      <p className="text-sm leading-relaxed text-stone">{children}</p>
    </div>
  );
}

// ── Entry rows (list sections) ──────────────────────────────────────────────

/** List-section entry row — the reui Item anatomy used by the Supporting
 *  Documents rows, so every profile list reads as one system:
 *  ItemContent = title + optional subtitle + dot-separated fact line,
 *  ItemActions = the edit-session cluster. Task 23 — the rows are ICON-FREE
 *  (user request: "remove the icons on the table" — the tone-tinted chip
 *  that used to anchor each row repeated the section header's glyph on
 *  every entry and is retired).
 *  `meta` fragments render dot-separated (falsy entries filtered);
 *  `actions` hosts EntryTileActions (edit mode only); `children` render
 *  full-width beneath the row head (e.g. actual duties). */
export function EntryTile({
  title,
  subtitle,
  meta,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  /** Secondary line under the title (school, employer…). */
  subtitle?: ReactNode;
  /** Facts rendered dot-separated (the documents-row pattern) — falsy
   *  entries are filtered out. Wraps to two lines, then ellipsizes. */
  meta?: ReactNode[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const facts = (meta ?? []).filter(Boolean);
  return (
    <Item
      role="listitem"
      variant="outline"
      size="sm"
      className={cn(
        "rounded-xl border-border bg-white/80 transition-colors",
        "hover:bg-card hover:shadow-[0_1px_6px_rgba(14,28,38,0.06)]",
        className,
      )}
    >
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full text-[15px] font-semibold text-ink">{title}</ItemTitle>
        {subtitle != null && subtitle !== "" && (
          <ItemDescription className="max-w-full">
            <span className="block truncate">{subtitle}</span>
          </ItemDescription>
        )}
        {facts.length > 0 && (
          <ItemDescription className="max-w-full">
            {/* Each fact is an unbreakable group with its LEADING dot, so a
                wrapped line starts "· fact" (bullet-like) instead of leaving
                a stray dot dangling at the previous line's end. */}
            {facts.map((fact, i) => (
              <span key={i} className="inline-flex max-w-full items-center">
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className="bg-muted-foreground/40 mx-1.5 inline-block size-1 shrink-0 rounded-full"
                  />
                )}
                <span className="truncate">{fact}</span>
              </span>
            ))}
          </ItemDescription>
        )}
      </ItemContent>
      {actions && <ItemActions>{actions}</ItemActions>}
      {children && <div className="w-full basis-full">{children}</div>}
    </Item>
  );
}

// ── Edit-session row actions ────────────────────────────────────────────────

/** The per-entry Edit / Delete cluster shown while a list section is in
 *  edit mode — the documents-row action family (ghost pencil + destructive
 *  trash icon buttons). Sits in the EntryTile `actions` slot; invisible in
 *  preview. */
export function EntryTileActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  onEdit: () => void;
  onDelete: () => void;
  editLabel: string;
  deleteLabel: string;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onEdit}
        aria-label={editLabel}
        title={editLabel}
        className="text-stone hover:bg-cloud/70 hover:text-ink"
      >
        <Pencil aria-hidden="true" />
      </Button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
        className={iconBtnBad}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );
}
