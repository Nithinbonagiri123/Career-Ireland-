import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import {
  candidateMatches,
  jobApplications,
  placements,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { cleanupDb, e2eAdminId, seedJob, seedPeople } from '@/test/db-fixtures';

/** R6 — the Pipeline Wall query: one card per person, latest stage wins. */

const session = { user: { id: '', role: 'ADMIN', isOwner: false, email: '', name: '' } };
vi.mock('@/lib/auth/session', () => ({
  requireInternalStaff: vi.fn(async () => session),
  requirePermission: vi.fn(async () => session),
}));

const { fetchRequisitionPipeline } = await import('./service');
const STAMP = `vitest-pipe-${Date.now()}`;
const ids = { jobId: '', employerId: '', people: [] as string[] };

beforeAll(async () => {
  session.user.id = await e2eAdminId();
  Object.assign(ids, await seedJob(STAMP));
  ids.people = await seedPeople(STAMP, [
    'Sug',
    'Rev',
    'Short',
    'App',
    'Int',
    'Off',
    'Placed',
    'Rej',
  ]);
  const [sug, rev, short, app, int, off, placed, rej] = ids.people as string[];
  // Matches for everyone except the rejected candidate.
  await db.insert(candidateMatches).values(
    [sug, rev, short, app, int, off, placed].map((p, i) => ({
      jobRequisitionId: ids.jobId,
      personId: p as string,
      score: 90 - i,
      scoreBucket: 'HIGH' as const,
      status:
        p === rev
          ? ('REVIEWED' as const)
          : p === sug
            ? ('SUGGESTED' as const)
            : ('SHORTLISTED' as const),
    })),
  );
  // Shortlisted: short, app, int (later stages must win for app / int).
  await db
    .insert(shortlistEntries)
    .values([short, app, int].map((p) => ({ jobRequisitionId: ids.jobId, personId: p as string })));
  await db.insert(jobApplications).values([
    { personId: app as string, jobRequisitionId: ids.jobId, status: 'APPLIED' },
    { personId: int as string, jobRequisitionId: ids.jobId, status: 'INTERVIEW' },
    { personId: off as string, jobRequisitionId: ids.jobId, status: 'OFFER' },
    { personId: placed as string, jobRequisitionId: ids.jobId, status: 'ACCEPTED' },
    { personId: rej as string, jobRequisitionId: ids.jobId, status: 'REJECTED' },
  ]);
  await db.insert(placements).values({
    personId: placed as string,
    employerId: ids.employerId,
    jobRequisitionId: ids.jobId,
    status: 'CONFIRMED',
  });
});
afterAll(() => cleanupDb([ids.jobId], ids.people, [ids.employerId]));

describe('fetchRequisitionPipeline', () => {
  it('puts each person in exactly one band, the latest stage winning', async () => {
    const data = await fetchRequisitionPipeline(ids.jobId);
    const [sug, rev, short, app, int, off, placed, rej] = ids.people as string[];
    const band = (k: keyof typeof data) => data[k].map((e) => e.personId);
    expect(band('source')).toEqual([sug]);
    expect(band('review')).toEqual([rev]);
    expect(band('shortlist')).toEqual([short]);
    expect(band('apply')).toEqual([app]);
    expect(band('interview')).toEqual([int]);
    expect(band('offer')).toEqual([off]);
    expect(band('placed')).toEqual([placed]);
    const all = Object.values(data)
      .flat()
      .map((e) => e.personId);
    expect(new Set(all).size).toBe(all.length); // no duplicate cards
    expect(all).not.toContain(rej); // rejected is not on the wall
  });

  it('carries the match score onto the card', async () => {
    const data = await fetchRequisitionPipeline(ids.jobId);
    expect(data.source[0]?.matchScore).toBe(90);
  });
});
