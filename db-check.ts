import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const users = await p.user.count();
  const jobs = await p.jobPosting.count();
  const apps = await p.application.count();
  console.log('DB OK — users:', users, '| jobPostings:', jobs, '| applications:', apps);
  const roles = await p.user.groupBy({ by: ['role'], _count: true });
  console.log('roles:', JSON.stringify(roles));
}
main().then(() => process.exit(0)).catch((e) => { console.error('DBERR', e.message); process.exit(1); });
