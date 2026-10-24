// ============================================================================
// RMIS — GET /api/reference (public, spec §6.3)
// Reference vocabulary for the profile builder and job forms:
// eligibilities (by index) and courses (by name). (Task 24 — the places of
// assignment registry is retired with the field.)
// ============================================================================

import { db } from "@/lib/db";
import { handleApi, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async () => {
  const [eligibilities, courses] = await Promise.all([
    db.eligibilityRef.findMany({ orderBy: [{ index: "asc" }, { name: "asc" }] }),
    db.course.findMany({ orderBy: { name: "asc" } }),
  ]);

  return ok({
    eligibilities: eligibilities.map((e) => ({ id: e.id, name: e.name })),
    courses: courses.map((c) => ({
      id: c.id,
      name: c.name,
      abbreviation: c.abbreviation,
      category: c.category,
      level: c.level,
    })),
  });
});
