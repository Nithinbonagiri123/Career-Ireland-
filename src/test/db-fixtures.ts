import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';

/**
 * R6 — small helpers for DB-backed unit tests: a job on its own employer,
 * people, the e2e admin id, and a cleanup that removes the rows a test
 * file created (children first). Every name carries the file's stamp.
 */
export async function e2eAdminId(): Promise<string> {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  return admin.id;
}

export async function seedJob(stamp: string, status: 'OPEN' | 'CLOSED' = 'OPEN') {
  const [emp] = await db
    .insert(employers)
    .values({ legalName: `${stamp} Ltd` })
    .returning();
  if (!emp) throw new Error('seed failed');
  const [job] = await db
    .insert(jobRequisitions)
    .values({
      employerId: emp.id,
      title: `${stamp} job`,
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      status,
    })
    .returning();
  if (!job) throw new Error('seed failed');
  return { jobId: job.id, employerId: emp.id };
}

export async function seedPeople(stamp: string, names: string[]) {
  const rows = await db
    .insert(persons)
    .values(names.map((n) => ({ firstName: n, lastName: stamp, source: 'DIRECT' as const })))
    .returning({ id: persons.id });
  return rows.map((r) => r.id);
}

/** Remove everything hanging off these jobs / people (test rows only). */
export async function cleanupDb(jobIds: string[], personIds: string[], employerIds: string[]) {
  const j = jobIds.length ? jobIds : ['00000000-0000-0000-0000-000000000000'];
  const p = personIds.length ? personIds : ['00000000-0000-0000-0000-000000000000'];
  const list = (ids: string[]) =>
    sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    );
  await db.execute(sql`DELETE FROM audit_events WHERE entity_id IN (
      SELECT id::text FROM job_applications WHERE job_requisition_id IN (${list(j)}) OR person_id IN (${list(p)})
      UNION SELECT id::text FROM placements WHERE job_requisition_id IN (${list(j)})
      UNION SELECT id::text FROM shortlist_entries WHERE job_requisition_id IN (${list(j)})
      UNION SELECT id::text FROM candidate_matches WHERE job_requisition_id IN (${list(j)})
      UNION SELECT id::text FROM work_permit_checklists WHERE job_requisition_id IN (${list(j)}))
    OR entity_id IN (${list([...j, ...p, ...employerIds])})`);
  for (const t of [
    'work_permit_checklists',
    'placements',
    'shortlist_entries',
    'candidate_matches',
  ]) {
    await db.execute(
      sql`DELETE FROM ${sql.identifier(t)} WHERE job_requisition_id IN (${list(j)})`,
    );
  }
  await db.execute(
    sql`DELETE FROM job_applications WHERE job_requisition_id IN (${list(j)}) OR person_id IN (${list(p)})`,
  );
  await db.execute(sql`DELETE FROM candidate_profiles WHERE person_id IN (${list(p)})`);
  if (jobIds.length) await db.delete(jobRequisitions).where(inArray(jobRequisitions.id, jobIds));
  if (personIds.length) await db.delete(persons).where(inArray(persons.id, personIds));
  if (employerIds.length) await db.delete(employers).where(inArray(employers.id, employerIds));
}
