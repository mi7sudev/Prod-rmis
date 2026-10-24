// ============================================================================
// RMIS — GET /api/health (spec §6.7, public): SELECT 1 database probe + the
// email-provider configuration check. 200 { status:"healthy", checks:{ app,
// database, email } } or 503 (unhealthy | degraded).
// Audit 2026-10-22 — EMAIL_PROVIDER=middleware with a missing relay URL used
// to downgrade SILENTLY to the mock provider (OTP mail vanishing with no
// error anywhere). The health probe now surfaces that misconfiguration so the
// deployment runbook's health curl catches it before staff rely on the relay.
// ============================================================================

import { db } from "@/lib/db";
import { handleApi, ok, err } from "@/lib/api";
import { getEmailProviderId } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** "ok" when the selected provider can actually deliver in this environment. */
function emailCheck(): string {
  const provider = getEmailProviderId();
  if (provider === "middleware") {
    return process.env.EMAIL_MIDDLEWARE_URL ? "ok" : "misconfigured (no EMAIL_MIDDLEWARE_URL — sends would silently drop to mock)";
  }
  if (provider === "mock") {
    return process.env.NODE_ENV === "production" ? "degraded (mock provider in production)" : "ok (mock provider — development)";
  }
  return "ok";
}

export const GET = handleApi(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    const email = emailCheck();
    if (email !== "ok" && !email.startsWith("ok ")) {
      return err("Health check degraded: email provider misconfigured", 503, {
        status: "degraded",
        checks: { app: "ok", database: "ok", email },
      });
    }
    return ok({ status: "healthy", checks: { app: "ok", database: "ok", email } });
  } catch {
    return err("Health check failed", 503, {
      status: "unhealthy",
      checks: { app: "ok", database: "error", email: emailCheck() },
    });
  }
});
