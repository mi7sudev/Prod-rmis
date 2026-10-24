"use client";

// ============================================================================
// RMIS — Shared enterprise auth furniture (sign-in, sign-up, reset password).
//
// QA pass (user: the auth pages read "too simple" — make them enterprise
// looking across the whole system). Reusable pieces, one anatomy used by
// EVERY auth page so the family can never drift apart:
//
//   · AuthSecureStrip — the government-portal trust strip that sits directly
//     under every auth card: authorized-use / audit notice (RA 8792
//     convention) and the RA 10173 data-privacy line. Hairline card, pale fog
//     fill, brand-blue shield — the same "surface is the elevation" language
//     as the rest of the shell.
//
//   · RMIS_FULL_NAME — the complete system name, one source of truth shared
//     by the shells' brand lockups.
//
// RETIRED (QA 2026-10-21, user directive): AuthMobileLockup — the compact
// seal + system-name lockup that headed the form column below lg. With the
// sticky PublicShell header on screen it printed the brand twice, so every
// auth view dropped it (the lg+ AuthBrandPanel letterhead stays).
//
// Presentation only — no state, no handlers.
// ============================================================================

import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** The complete system name — one source of truth for every lockup.
    Official form carries the acronym in parentheses (user QA). */
export const RMIS_FULL_NAME = "Recruitment Management Information System (RMIS)";

/**
 * Trust strip under an auth card. Variant picks the compliance copy:
 *   · "session" — authorized-use/audit notice (sign-in, reset password)
 *   · "privacy" — RA 10173 consent (registration). QA 2026-10 — carries the
 *     sign-up consent statement with the Act itself as the highlighted link:
 *     "Data Privacy Act of 2012 (RA 10173)" (user QA naming) linking to the
 *     official MIRDC Privacy Policy Statement PDF.
 */
export function AuthSecureStrip({
  variant = "session",
  className,
}: {
  variant?: "session" | "privacy";
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border border-border/70 bg-fog/60 px-4 py-3",
        className,
      )}
    >
      <ShieldCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-metric-blue"
        aria-hidden="true"
      />
      {variant === "session" ? (
        <p className="text-[11px] leading-relaxed text-stone">
          Official government information system. Authorized use only — access is
          recorded and audited for security.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-stone">
          I have read and accept the{" "}
          <a
            href="https://mirdc.dost.gov.ph/wp-content/uploads/2024/09/MIRDC_Privacy_Policy_Statement_rev_2.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring font-medium text-metric-blue underline underline-offset-2 transition-colors hover:text-ink"
          >
            Data Privacy Act of 2012 (RA 10173)
          </a>
          .
        </p>
      )}
    </div>
  );
}
