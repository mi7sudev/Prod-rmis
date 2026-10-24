"use client";

// ============================================================================
// RMIS — ONE matchMedia hook (audit 2026-10-22: useIsMobile and
// useIsBelowLg were the identical module modulo one breakpoint constant).
// ============================================================================

import * as React from "react";

export function useMediaQuery(maxWidth: number): boolean {
  const [matches, setMatches] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    const onChange = () => {
      setMatches(window.innerWidth < maxWidth);
    };
    mql.addEventListener("change", onChange);
    setMatches(window.innerWidth < maxWidth);
    return () => mql.removeEventListener("change", onChange);
  }, [maxWidth]);

  return !!matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery(768); // shadcn `md` boundary
}
