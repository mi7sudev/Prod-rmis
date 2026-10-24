// ============================================================================
// RMIS — POST /api/auth/verify-otp (public, Task 30-b; QA 2026-10-22 widen).
// Body { identifier, code } or the legacy { email, code } — the identifier is
// an email OR a username (sign-in resends must work for username sign-ins
// too; the address is resolved server-side). Rate limit 10 / IP+identifier /
// 10 min → 429. The code is checked against the latest unconsumed EmailOtp
// row (see lib/otp.ts): locked → 400 "Too many incorrect attempts…"; invalid
// → 401 and expired → 400 share ONE message (no oracle between the two —
// only the status differs). On success the matching APPLICANT accounts are
// flipped to confirmed:true and the client continues into the pre-existing
// auto-login sequence.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok, ApiError, getClientIp } from "@/lib/api";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp";

const bodySchema = z
  .object({
    identifier: z.string().trim().min(3).max(200).optional(),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
    code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  })
  .refine((v) => Boolean(v.identifier || v.email), {
    message: "identifier or email is required",
  });

export const POST = handleApi(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.parse(body);
  const { code } = parsed;
  const id = (parsed.identifier ?? parsed.email ?? "").trim();
  const ip = getClientIp(req);

  const rl = consumeRateLimit(`otp-verify:${ip}:${id.toLowerCase()}`, 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    throw new ApiError(
      `Too many verification attempts. Please try again in ${rl.retryAfterMinutes ?? 10} minute(s).`,
      429
    );
  }

  // Resolve the identifier (email or username) to the APPLICANT account, the
  // same shape the login endpoint accepts. Enumeration stays safe: an unknown
  // identifier simply verifies nothing and returns the shared error.
  const user = await db.user.findFirst({
    where: { OR: [{ email: id.toLowerCase() }, { username: id }], role: "APPLICANT" },
    select: { email: true },
  });
  const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
  const purposeEmail = user?.email ?? (emailShape ? id.toLowerCase() : "");

  const result = await verifyOtp(purposeEmail, code, "SIGNUP");

  if (result === "locked") {
    throw new ApiError("Too many incorrect attempts. Request a new code.", 400);
  }
  if (result === "invalid" || result === "expired") {
    // Same message for invalid and expired — no oracle between the two
    // (only the HTTP status differs: 401 invalid / 400 expired).
    throw new ApiError(
      "That code is not valid or has expired. Request a new one if it keeps failing.",
      result === "invalid" ? 401 : 400
    );
  }

  if (purposeEmail) {
    await db.user.updateMany({
      where: { email: purposeEmail, role: "APPLICANT" },
      data: { confirmed: true },
    });
  }

  return ok({ verified: true });
});
