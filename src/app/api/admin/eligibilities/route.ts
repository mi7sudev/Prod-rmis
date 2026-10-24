// ============================================================================
// RMIS — /api/admin/eligibilities (ADMIN, spec §6.6)
// GET:  the eligibility reference vocabulary, sorted by index then name.
// POST: create { name 1–200 }; published immediately. 201 → the row.
// Task 72 — canonical find-or-create (the same contract the applicant-side
// resolver in lib/eligibility-ref.ts enforces): "cs career", "  CS Career "
// and "CS CAREER" all land on ONE stored row instead of spawning
// case-variant near-duplicates in every eligibility datalist. 200 → the
// existing row matched canonically; 201 → freshly created.
// ============================================================================

import { z } from "zod";
import { db } from "@/lib/db";
import { handleApi, ok } from "@/lib/api";
import { requireRouteAccess } from "@/lib/role-policy";
import { canonicalEligibilityName } from "@/lib/constants";

export const dynamic = "force-dynamic";

const nameSchema = z.object({ name: z.string().trim().min(1).max(200) });

export const GET = handleApi(async (req: Request) => {
  await requireRouteAccess(req, "admin/eligibilities", "GET");
  const rows = await db.eligibilityRef.findMany({
    orderBy: [{ index: "asc" }, { name: "asc" }],
  });
  return ok(rows);
});

export const POST = handleApi(async (req: Request) => {
  await requireRouteAccess(req, "admin/eligibilities", "POST");
  const body = (await req.json().catch(() => null)) as unknown;
  const { name } = nameSchema.parse(body);

  const key = canonicalEligibilityName(name);
  const rows = await db.eligibilityRef.findMany();
  const existing = rows.find((r) => canonicalEligibilityName(r.name) === key);
  if (existing) return ok(existing, 200);

  try {
    const row = await db.eligibilityRef.create({ data: { name } });
    return ok(row, 201);
  } catch (e) {
    // Concurrent add raced past the canonical check — the unique name
    // constraint fired; the winner's row is the answer.
    if ((e as { code?: string }).code !== "P2002") throw e;
    const winner = await db.eligibilityRef.findUnique({ where: { name } });
    if (!winner) throw e;
    return ok(winner, 200);
  }
});
