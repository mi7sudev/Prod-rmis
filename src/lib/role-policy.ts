// ============================================================================
// RMIS — The Staff Role Policy (architecture candidate ⑤, Task 79 report;
// operator-approved "FIX EVERYTHING", Task 81-c).
//
// ONE declarative route→access matrix for every /api route, answering
// "who may touch what" without opening each route file. Before this module
// the matrix lived only as guard calls smeared across 40+ route files plus
// archaeology (spec §6.6 vs the QA 2026-02 exceptions — reverified end-to-end
// in Task 72). Now the matrix is data; the route files consume it through
// two guards; a policy debate edits one table.
//
// ── Gate vocabulary (access tiers, in ascending privilege) ──────────────────
//   PUBLIC             anonymous by design — NO guard runs; declared so the
//                      matrix is complete and drift stays visible.
//   OPTIONAL_SESSION   session is read if present, never required; the route
//                      decides what a session adds (session bootstrap,
//                      logout, the public job board's §8.7 visibility tiers).
//   ANY_SESSION        any signed-in role; 401 otherwise. Route-level
//                      ownership rules (files) still apply on top.
//   APPLICANT          APPLICANT session (401 anon / 403 other roles).
//   APPLICANT_PROFILE  APPLICANT session + the Applicant profile row
//                      (404 "Applicant profile not found" if the row is
//                      missing) — the profile-section and apply gates.
//   STAFF              EVALUATOR or ADMIN — the review-workforce tier; the
//                      §2.2 staff intranet tier is enforced inside lib/auth.
//   ADMIN              ADMIN only — settings + system records (spec §6.6).
//
// ── Error semantics (inherited verbatim from lib/auth — NOT reimplemented) ──
//   401 "Unauthorized"                        · no/blocked/deleted session
//   403 STAFF_INTRANET_MESSAGE                · staff session off-intranet
//   403 "Forbidden: insufficient role"        · role outside the gate
//   404 "Applicant profile not found"         · APPLICANT_PROFILE without row
// The guards below ONLY translate a matrix row into the corresponding lib/auth
// call — identical envelopes, statuses, and messages as before the extraction.
//
// ── Fail closed ─────────────────────────────────────────────────────────────
// A route/method pair without a declared rule throws 500 (a programming
// error, never a silent allow), and a guard invoked on a row it cannot
// enforce (PUBLIC / OPTIONAL_SESSION) or on APPLICANT_PROFILE through the
// wrong entry point throws 500 as well.
// ============================================================================

import { ApiError } from "@/lib/api";
import {
  requireAdminFromReq,
  requireApplicantFromReq,
  requireApplicantRow,
  requireAuth,
  requireEvaluatorFromReq,
  type AuthedUser,
} from "@/lib/auth";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteAccess =
  | "PUBLIC"
  | "OPTIONAL_SESSION"
  | "ANY_SESSION"
  | "APPLICANT"
  | "APPLICANT_PROFILE"
  | "STAFF"
  | "ADMIN";

type MethodRule = { readonly [M in HttpMethod]?: RouteAccess };
type RouteRule = RouteAccess | MethodRule;

// ── THE MATRIX ──────────────────────────────────────────────────────────────
// Key = route path under src/app/api (dynamic segments in brackets).
// A plain string gates EVERY method of the route; an object gates per method
// and is used exactly where the boundary intentionally diverges (each such
// row is commented). Rows are grouped by door/tier.

export const ROUTE_POLICY = {
  // ── Public door — anonymous by design (auth flows, health, contact) ──────
  "auth/captcha": "PUBLIC",
  "auth/login": "PUBLIC",
  "auth/register": "PUBLIC",
  "auth/verify-otp": "PUBLIC",
  "auth/resend-otp": "PUBLIC",
  "auth/forgot-password": "PUBLIC",
  "auth/reset-password": "PUBLIC",
  contact: "PUBLIC",
  health: "PUBLIC",
  reference: "PUBLIC",

  // ── Session-coupled surfaces — not role gates ─────────────────────────────
  // GET /api/session: public bootstrap (spec §3.2); a staff session resolved
  // from a non-intranet network is nulled + audited in-route (chokepoint 2).
  session: "OPTIONAL_SESSION",
  // POST /api/auth/logout: fire-and-forget; audits whoever is present.
  "auth/logout": "OPTIONAL_SESSION",
  // GET /api/jobs: public board; the session only personalizes (own
  // applications) and widens deadline visibility for staff (§8.7, in-route).
  // POST /api/jobs: staff create + publish (Task 72: evaluators post jobs).
  jobs: { GET: "OPTIONAL_SESSION", POST: "STAFF" },

  // ── Any signed-in role (401 without a session) ────────────────────────────
  // GET /api/files/**: APPLICANT → own directory only (403, in-route);
  // EVALUATOR/ADMIN → any. NOTE: the §2.2 staff intranet tier is NOT
  // re-enforced here — spec §2.2 defines exactly three chokepoints (login,
  // session, requireRole) and this route is none of them; behavior preserved.
  "files/[...path]": "ANY_SESSION",
  // POST /api/auth/change-password (Task 35): any signed-in role, own
  // credential only — same three-chokepoint note as files.
  "auth/change-password": "ANY_SESSION",

  // ── Applicant (session + role; ownership enforced in-route) ───────────────
  applications: "APPLICANT",
  "applications/[id]": "APPLICANT",
  "jobs/verify-mqr": "APPLICANT",

  // ── Applicant + profile row (404 when the profile row is missing) ─────────
  "jobs/apply": "APPLICANT_PROFILE",
  "applicant/profile": "APPLICANT_PROFILE",
  "applicant/profile/complete": "APPLICANT_PROFILE",
  "applicant/profile/clear": "APPLICANT_PROFILE",
  "applicant/profile/auto-apply": "APPLICANT_PROFILE",
  "applicant/documents": "APPLICANT_PROFILE",
  "applicant/documents/[id]": "APPLICANT_PROFILE",
  "applicant/documents/extract": "APPLICANT_PROFILE",
  "applicant/educations": "APPLICANT_PROFILE",
  "applicant/educations/[id]": "APPLICANT_PROFILE",
  "applicant/work-experiences": "APPLICANT_PROFILE",
  "applicant/work-experiences/[id]": "APPLICANT_PROFILE",
  "applicant/trainings": "APPLICANT_PROFILE",
  "applicant/trainings/[id]": "APPLICANT_PROFILE",
  "applicant/eligibilities": "APPLICANT_PROFILE",
  "applicant/eligibilities/[id]": "APPLICANT_PROFILE",
  "applicant/awards": "APPLICANT_PROFILE",
  "applicant/awards/[id]": "APPLICANT_PROFILE",

  // ── Staff — EVALUATOR or ADMIN (spec §6.5 review workforce) ───────────────
  "evaluator/queue": "STAFF",
  "evaluator/applications/[id]": "STAFF",
  "evaluator/applications/[id]/email": "STAFF",
  "evaluator/applications/[id]/notice": "STAFF",
  "evaluator/applications/invitations": "STAFF",
  "evaluator/applications/regrets": "STAFF",
  options: "STAFF",
  "jobs/[id]": "STAFF",

  // ── Admin namespace — spec §6.6 says ADMIN; QA 2026-02 (reverified Task 72)
  // admitted the EVALUATOR to four read/report surfaces. Those exceptions are
  // DECLARED here with their rationale instead of silently diverging.
  // EXCEPTION: the evaluator Candidates view reads applicant dossiers (§6.6
  // baseline: ADMIN; QA exception stands — tightening would break a
  // documented evaluator workflow).
  "admin/applicants": "STAFF",
  "admin/applicants/[id]": "STAFF",
  // EXCEPTION: the evaluator Analytics view (§6.6 baseline: ADMIN; QA
  // exception stands).
  "admin/stats": "STAFF",
  // EXCEPTION: contact-request triage + reply are shared staff work (spec §6.6
  // does not classify this route; QA 2026-02 admitted the evaluator).
  "admin/contact-requests": "STAFF",
  "admin/contact-requests/reply": "STAFF",
  // DIVERGENT BY DESIGN: GET is the Email Notices ledger — read-only for both
  // staff roles (QA 2026-02: "evaluators get the Email Notices view too,
  // read-only"); POST is the provider test-send → ADMIN only (spec §6.6).
  "admin/email": { GET: "STAFF", POST: "ADMIN" },

  // Admin-only — the §6.6 baseline, no exceptions:
  "admin/audit-logs": "ADMIN",
  "admin/eligibilities": "ADMIN",
  "admin/sms": "ADMIN",
  "admin/users": "ADMIN",
  "admin/users/[id]": "ADMIN",
} as const satisfies Readonly<Record<string, RouteRule>>;

export type RouteKey = keyof typeof ROUTE_POLICY;

// ── Resolution ──────────────────────────────────────────────────────────────

/** Resolve the declared access tier for a route/method pair. Throws 500 on an
 *  undeclared pair — fail closed, a policy gap must never look like consent. */
export function routeAccessFor(route: RouteKey, method: HttpMethod): RouteAccess {
  const rule: RouteRule | undefined = ROUTE_POLICY[route];
  if (!rule) throw new ApiError(`Role policy: no rule declared for "${route}".`, 500);
  if (typeof rule === "string") return rule;
  const gate = rule[method];
  if (!gate) {
    throw new ApiError(`Role policy: "${route}" declares no access rule for ${method}.`, 500);
  }
  return gate;
}

/**
 * THE staff-route guard — consults the matrix, then delegates to the lib/auth
 * chokepoint. Returns the AuthedUser for audit labels, exactly as the
 * requireEvaluatorFromReq / requireAdminFromReq / requireApplicantFromReq /
 * requireAuth calls it replaced did.
 */
export async function requireRouteAccess(
  req: Request,
  route: RouteKey,
  method: HttpMethod
): Promise<AuthedUser> {
  const gate = routeAccessFor(route, method);
  switch (gate) {
    case "ANY_SESSION":
      return requireAuth(req);
    case "APPLICANT":
      return requireApplicantFromReq(req);
    case "STAFF":
      return requireEvaluatorFromReq(req);
    case "ADMIN":
      return requireAdminFromReq(req);
    case "APPLICANT_PROFILE":
      // Enforceable, but the caller needs the profile row — wrong entry point.
      throw new ApiError(
        `Role policy: "${route}" is APPLICANT_PROFILE — call requireApplicantProfileAccess.`,
        500
      );
    default:
      // PUBLIC / OPTIONAL_SESSION are declarations, not enforceable gates.
      throw new ApiError(
        `Role policy: "${route}" (${gate}) takes no role guard.`,
        500
      );
  }
}

/**
 * APPLICANT_PROFILE entry point — the same matrix + the Applicant row
 * ({ user, applicant }) the profile-section, document, and apply routes
 * destructure, exactly as requireApplicantRow did.
 */
export async function requireApplicantProfileAccess(
  req: Request,
  route: RouteKey,
  method: HttpMethod
): Promise<Awaited<ReturnType<typeof requireApplicantRow>>> {
  const gate = routeAccessFor(route, method);
  if (gate !== "APPLICANT_PROFILE") {
    throw new ApiError(
      `Role policy: "${route}" is declared "${gate}", not APPLICANT_PROFILE.`,
      500
    );
  }
  return requireApplicantRow(req);
}
