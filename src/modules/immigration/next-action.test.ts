import { describe, expect, it } from 'vitest';
import { computeImmigrationNextAction } from './next-action';

const CASE_ID = '00000000-0000-0000-0000-000000000030';
const NOW = new Date('2026-10-08T12:00:00Z');
const TODAY_YMD = '2026-10-08';
const YESTERDAY_YMD = '2026-10-07';
const FUTURE_YMD = '2027-01-01';

const BASE = {
  caseId: CASE_ID,
  reminderOn: null as string | null,
  expiresOn: null as string | null,
  decisionAt: null as string | null,
  submittedAt: null as string | null,
  requirements: { total: 0, missing: 0 },
  now: NOW,
};

describe('computeImmigrationNextAction', () => {
  it('returns null when the case is CLOSED', () => {
    expect(computeImmigrationNextAction({ ...BASE, status: 'CLOSED' })).toBeNull();
  });

  it('escalates to urgent when the permit is expired', () => {
    const result = computeImmigrationNextAction({
      ...BASE,
      status: 'APPROVED',
      expiresOn: YESTERDAY_YMD,
    });
    expect(result?.tone).toBe('urgent');
    expect(result?.dueHint).toBe('expired');
    expect(result?.sentence).toMatch(/permit has expired/i);
  });

  it('escalates to urgent when the reminder date is today or earlier', () => {
    const result = computeImmigrationNextAction({
      ...BASE,
      status: 'SUBMITTED',
      reminderOn: TODAY_YMD,
    });
    expect(result?.tone).toBe('urgent');
    expect(result?.dueHint).toBe('reminder today');
  });

  it('prompts to request documents when status is OPEN', () => {
    const result = computeImmigrationNextAction({ ...BASE, status: 'OPEN' });
    expect(result?.sentence).toMatch(/request the required documents/i);
    expect(result?.primary.href).toContain('tab=documents');
  });

  it('prompts to chase missing documents when still DOCUMENTS_PENDING', () => {
    const result = computeImmigrationNextAction({
      ...BASE,
      status: 'DOCUMENTS_PENDING',
      requirements: { total: 5, missing: 2 },
    });
    expect(result?.sentence).toMatch(/chase the 2 missing documents/i);
  });

  it('prompts to submit when DOCUMENTS_PENDING with all documents in', () => {
    const result = computeImmigrationNextAction({
      ...BASE,
      status: 'DOCUMENTS_PENDING',
      requirements: { total: 5, missing: 0 },
    });
    expect(result?.sentence).toMatch(/submit the case/i);
  });

  it('prompts to set a reminder when SUBMITTED and no reminder set', () => {
    const result = computeImmigrationNextAction({ ...BASE, status: 'SUBMITTED' });
    expect(result?.sentence).toMatch(/set a reminder/i);
  });

  it('prompts to archive after decision', () => {
    for (const status of ['APPROVED', 'REJECTED']) {
      const result = computeImmigrationNextAction({
        ...BASE,
        status,
        expiresOn: FUTURE_YMD,
      });
      expect(result?.sentence).toMatch(/archive the case/i);
    }
  });

  it('ignores a future reminder date', () => {
    const result = computeImmigrationNextAction({
      ...BASE,
      status: 'SUBMITTED',
      reminderOn: FUTURE_YMD,
    });
    expect(result?.tone).toBe('default');
    expect(result?.dueHint).toBeNull();
  });
});
