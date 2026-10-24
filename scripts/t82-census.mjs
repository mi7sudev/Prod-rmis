// Read-only census of db/production-data.db against the Task 81-integrity contract.
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const CONTRACT = { users: 7, applicants: 5, postings: 7, positions: 7, applications: 0, documents: 0, audit: 53, email: 5, otp: 4, sms: 0, notif: 0, contact: 0 };
async function main() {
  const c = {
    users: await p.user.count(),
    applicants: await p.applicant.count(),
    postings: await p.jobPosting.count(),
    positions: await p.position.count(),
    applications: await p.application.count(),
    documents: await p.document.count(),
    audit: await p.auditLog.count(),
    email: await p.emailLog.count(),
    otp: await p.emailOtp.count(),
    sms: await p.smsLog.count(),
    notif: await p.notification.count(),
    contact: await p.contactRequest.count(),
  };
  console.log(JSON.stringify(c));
  const ok = JSON.stringify(c) === JSON.stringify(CONTRACT);
  console.log(ok ? 'CENSUS OK (matches contract)' : 'CENSUS MISMATCH vs contract ' + JSON.stringify(CONTRACT));
  const users = await p.user.findMany({ select: { id: true, email: true, role: true }, orderBy: { id: 'asc' } });
  console.log('users:', JSON.stringify(users));
  process.exit(ok ? 0 : 2);
}
main().catch((e) => { console.error('DBERR', e.message); process.exit(1); });
