// ============================================================================
// One-off: seed the sandbox TEST accounts + minimal demo rows into the
// RESTORED production base (upload/production-data.db → db/production-data.db).
// Deliberately touches NO jobs/positions — the user's production job list is
// the point of the restore. Test rows are clearly labeled "Test"/"Demo".
// Run: DATABASE_URL='file:/home/z/my-project/db/production-data.db' bunx tsx prisma/restore-demo.ts
// ============================================================================

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("password123", 10);

  // ── Test accounts (same identities as the previous sandbox base) ─────────
  const accounts = [
    { username: "testadmin", email: "testadmin@mirdc.gov.ph", firstName: "Test", lastName: "Admin", role: "ADMIN" },
    { username: "testevaluator", email: "testevaluator@mirdc.gov.ph", firstName: "Test", lastName: "Evaluator", role: "EVALUATOR" },
    { username: "testapplicant", email: "testapplicant@mirdc.gov.ph", firstName: "Test", lastName: "Applicant", role: "APPLICANT" },
  ];
  const users: Record<string, string> = {};
  for (const a of accounts) {
    const user = await db.user.upsert({
      where: { username: a.username },
      update: { password: hash, role: a.role, blocked: false },
      create: { ...a, password: hash },
    });
    users[a.role] = user.id;
    if (a.role === "APPLICANT" && !(await db.applicant.findUnique({ where: { userId: user.id } }))) {
      await db.applicant.create({
        data: {
          userId: user.id,
          firstName: "Test",
          lastName: "Applicant",
          emailAddress: a.email,
          mobileNumber: "09171234567",
        },
      });
    }
  }

  // ── Two extra demo applicants so the Review Queue kanban shows cards ─────
  const demoPeople = [
    { username: "demojuan", email: "demo.juan@example.com", first: "Juan", last: "Dela Cruz" },
    { username: "demomaria", email: "demo.maria@example.com", first: "Maria", last: "Santos" },
  ];
  const demoApplicantIds: number[] = [];
  for (const p of demoPeople) {
    const user = await db.user.upsert({
      where: { username: p.username },
      update: { password: hash },
      create: { username: p.username, email: p.email, firstName: p.first, lastName: p.last, password: hash, role: "APPLICANT" },
    });
    let applicant = await db.applicant.findUnique({ where: { userId: user.id } });
    if (!applicant) {
      applicant = await db.applicant.create({
        data: { userId: user.id, firstName: p.first, lastName: p.last, emailAddress: p.email, mobileNumber: "09180000000" },
      });
    }
    demoApplicantIds.push(applicant.id);
  }

  const testApplicant = await db.applicant.findFirst({ where: { user: { username: "testapplicant" } } });
  if (testApplicant) demoApplicantIds.unshift(testApplicant.id);

  // ── Demo applications across the PRODUCTION postings (no new jobs) ───────
  const jobs = await db.jobPosting.findMany({ take: 4, orderBy: { id: "asc" }, select: { id: true } });
  const statuses = ["Applied", "Under Review", "Shortlisted", "Rejected"];
  let made = 0;
  for (let i = 0; i < jobs.length; i++) {
    const applicantId = demoApplicantIds[i % demoApplicantIds.length];
    const jobId = jobs[i].id;
    const exists = await db.application.findFirst({ where: { applicantId, jobId } });
    if (!exists) {
      await db.application.create({ data: { applicantId, jobId, status: statuses[i % statuses.length] } });
      made++;
    }
  }
  console.log(`demo applications created: ${made}`);

  // ── Two contact requests (one OPEN for the modal-width check, one RESOLVED)
  if ((await db.contactRequest.count()) === 0) {
    await db.contactRequest.create({
      data: {
        name: "Juan Dela Cruz",
        email: "demo.juan@example.com",
        subject: "Cannot upload PDF documents",
        message:
          "Good day! I am trying to upload my PDF credentials on the Supporting Documents step but the page keeps spinning. I have tried Chrome and Edge. Please advise. Thank you!",
        status: "OPEN",
      },
    });
    await db.contactRequest.create({
      data: {
        name: "Maria Santos",
        email: "demo.maria@example.com",
        subject: "Account verification email not received",
        message: "Hi, I signed up last week but never received the verification code. Kindly resend or verify my account manually.",
        status: "RESOLVED",
        handledById: users["EVALUATOR"],
        resolvedAt: new Date(),
      },
    });
    console.log("demo contact requests created: 2");
  }

  console.log("restore-demo done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
