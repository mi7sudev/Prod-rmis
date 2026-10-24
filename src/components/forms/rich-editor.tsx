"use client";

// ============================================================================
// RMIS glue — Key Competency rich text editor (Task 25).
// NOT a vendored block: the registry has no rich-text field and the unused
// @mdxeditor/editor dep is MDX-markdown shaped, not form-field shaped. This
// is RMIS glue that mirrors the official Input/Textarea field anatomy:
//   • identical label classes (px-1 text-sm font-medium text-foreground)
//   • identical border/focus tokens (border-border, ring-foreground/40 +
//     ring-ring/40 focus) and the white field box (bg-white) the job form
//     paints onto every control
//   • identical value contract: onChange receives the STRING (the field's
//     HTML), not the event
// The toolbar covers the posting's needs — bold, italic, underline,
// strikethrough, bullet/numbered lists, clear formatting — backed by
// document.execCommand (deprecated but the only cross-browser contentEditable
// command surface; every lightweight RTE in production uses it). The editor
// pane is a page-tall scrollable surface because Key Competency content runs
// long. Output is HTML; the jobs API sanitizes it server-side (spec §12.4)
// before it ever reaches the Position master or the public page.
// Selection state: toolbar buttons use onMouseDown preventDefault so the
// caret/selection survives the click, and queryCommandState drives the
// active-button tint via the document selectionchange event.
// ============================================================================

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Bold, Eraser, Italic, List, ListOrdered, Strikethrough, Underline,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** One toolbar command. */
type RichCommand = "bold" | "italic" | "underline" | "strikeThrough" | "insertUnorderedList" | "insertOrderedList";

const COMMANDS: { cmd: RichCommand; icon: LucideIcon; label: string }[] = [
  { cmd: "bold", icon: Bold, label: "Bold (Ctrl+B)" },
  { cmd: "italic", icon: Italic, label: "Italic (Ctrl+I)" },
  { cmd: "underline", icon: Underline, label: "Underline (Ctrl+U)" },
  { cmd: "strikeThrough", icon: Strikethrough, label: "Strikethrough" },
  { cmd: "insertUnorderedList", icon: List, label: "Bullet list" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
];

/** True when the editor holds no user-visible content — covers "", "<br>",
    "<div><br></div>" and the whitespace-only states browsers produce when the
    last formatting is cleared, so the form submits null instead of debris. */
export function richEditorIsEmpty(html: string): boolean {
  const doc = new DOMParser().parseFromString(
    /<[a-z][\s\S]*>/i.test(html) ? html : `<body>${html}</body>`,
    "text/html",
  );
  return (doc.body.textContent ?? "").trim() === "" && !doc.body.querySelector("img,li");
}

export interface RichEditorProps {
  id?: string;
  label?: string;
  /** Controlled HTML value. */
  value: string;
  /** Receives the field's HTML on every input ("" when emptied). */
  onChange: (html: string) => void;
  disabled?: boolean;
  /** Field-box classes (the job form passes bg-white like every control). */
  classNames?: { root?: string; label?: string; field?: string; pane?: string };
  placeholder?: string;
}

export function RichEditor({
  id: idProp,
  label,
  value,
  onChange,
  disabled = false,
  classNames,
  placeholder,
}: RichEditorProps) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const paneRef = useRef<HTMLDivElement>(null);
  /** The last HTML this instance emitted — external value round-trips only
      when they genuinely differ (prefill/reset), never on our own echoes. */
  const emittedRef = useRef<string>("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});

  // External value → pane (prefill when the dialog opens / job switches).
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    if ((value ?? "") !== emittedRef.current) {
      pane.innerHTML = value ?? "";
      emittedRef.current = value ?? "";
    }
  }, [value]);

  // Toolbar active states follow the caret.
  useEffect(() => {
    if (disabled) return;
    const readState = () => {
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || !paneRef.current) return;
      if (!paneRef.current.contains(sel.anchorNode)) return;
      const next: Record<string, boolean> = {};
      for (const { cmd } of COMMANDS) {
        try {
          next[cmd] = document.queryCommandState(cmd);
        } catch {
          next[cmd] = false;
        }
      }
      setActive(next);
    };
    document.addEventListener("selectionchange", readState);
    return () => document.removeEventListener("selectionchange", readState);
  }, [disabled]);

  const emit = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const html = richEditorIsEmpty(pane.innerHTML) ? "" : pane.innerHTML;
    emittedRef.current = html;
    onChange(html);
  }, [onChange]);

  const run = (cmd: RichCommand) => {
    if (disabled) return;
    paneRef.current?.focus();
    document.execCommand(cmd, false);
    emit();
  };

  return (
    <div className={cn("flex flex-col gap-1.5", classNames?.root)}>
      {label ? (
        <label htmlFor={id} className={cn("px-1 text-sm font-medium text-foreground", classNames?.label)}>
          {label}
        </label>
      ) : null}

      <div
        data-state={focused ? "focused" : "idle"}
        className={cn(
          "overflow-hidden rounded-2xl border transition-colors duration-200",
          "border-border",
          focused && "border-foreground/40 ring-2 ring-ring/40",
          disabled && "opacity-60",
          classNames?.field,
        )}
      >
        {/* Toolbar — format buttons keep the selection via mousedown
            preventDefault; the divider separates inline marks from lists. */}
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-border bg-fog/60 px-2 py-1.5"
        >
          {COMMANDS.map(({ cmd, icon: Icon, label: tip }, i) => (
            <span key={cmd} className="flex items-center">
              {i === 4 && <span aria-hidden className="mx-1 h-4 w-px bg-divider" />}
              <button
                type="button"
                title={tip}
                aria-label={tip}
                aria-pressed={!!active[cmd]}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(cmd)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-md text-stone transition-colors",
                  "hover:bg-white hover:text-ink",
                  active[cmd] && "bg-white text-ink shadow-xs",
                  disabled && "cursor-not-allowed",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          ))}
          <span aria-hidden className="mx-1 h-4 w-px bg-divider" />
          <button
            type="button"
            title="Clear formatting"
            aria-label="Clear formatting"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (disabled) return;
              paneRef.current?.focus();
              document.execCommand("removeFormat");
              emit();
            }}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-md text-stone transition-colors",
              "hover:bg-white hover:text-ink",
              disabled && "cursor-not-allowed",
            )}
          >
            <Eraser className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* The pane — a page-tall scrollable writing surface. contentEditable
            is intentionally UNCONTROLLED: React-controlled contentEditable
            fights the caret. External values sync through the effect above. */}
        <div
          ref={paneRef}
          id={id}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label ?? "Rich text"}
          data-placeholder={placeholder}
          onInput={emit}
          onBlur={() => {
            setFocused(false);
            emit();
          }}
          onFocus={() => setFocused(true)}
          className={cn(
            "rich-editor-pane block w-full overflow-y-auto bg-white px-3.5 py-2.5 text-base leading-6 text-foreground outline-none scroll-thin",
            "min-h-[360px] max-h-[65vh]",
            disabled && "cursor-not-allowed",
            classNames?.pane,
          )}
        />
      </div>
    </div>
  );
}
