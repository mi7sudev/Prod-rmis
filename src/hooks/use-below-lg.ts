"use client";

// RMIS — media-query hook matching the app shell's own mobile boundary:
// Tailwind's `lg` (1024px). The shell renders its mobile chrome (top brand
// bar, bottom ExpandableTabs, PullToRefresh scroller) strictly below lg, so
// JS-side behavior must key on the SAME breakpoint. Delegates to the shared
// useMediaQuery engine (audit 2026-10-22 dedup) with its own constant — the
// two hooks differ ONLY in breakpoint, never in behavior.
import { useMediaQuery } from "./use-media-query";

const BELOW_LG_BREAKPOINT = 1024;

export function useIsBelowLg(): boolean {
  return useMediaQuery(BELOW_LG_BREAKPOINT);
}
