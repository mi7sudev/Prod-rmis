"use client";

// ============================================================================
// RMIS — useFocusTrap (beui.dev/hooks/use-focus-trap, vendored 2026-10-21).
// Behavior contract (as consumed by motion/drawer.tsx): while `active`, focus
// moves into the container on mount (the container itself when it carries a
// tabindex — the drawer panel is tabIndex={-1} — else the first visible
// focusable descendant), Tab / Shift+Tab wrap within it, Escape invokes
// `onEscape`, and focus returns to the previously-focused element on release.
//
// Implementation notes (learned the hard way): `onEscape` is mirrored into a
// ref so the effect only re-runs on [active] — the Drawer passes an inline
// opts object, and a deps-included callback would tear down/restore focus on
// every parent render. Focus restore only fires when focus is still inside
// the container, so a drawer that closes into the detail modal never yanks
// focus back to the opener mid-handoff.
// ============================================================================

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  opts: { onEscape?: () => void } = {},
) {
  const onEscapeRef = useRef(opts.onEscape);
  useEffect(() => {
    onEscapeRef.current = opts.onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const isVisible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
        isVisible(el),
      );

    const initial =
      container.matches("[tabindex]") ? container : (focusables()[0] ?? container);
    initial.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !(current instanceof Node) || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !(current instanceof Node) || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (container.contains(document.activeElement)) previouslyFocused?.focus();
    };
  }, [active, containerRef]);
}
