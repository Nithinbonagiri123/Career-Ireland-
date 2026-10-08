import { describe, expect, it } from 'vitest';
import { computeEmployerNextAction } from './next-action';

const EMPLOYER_ID = '00000000-0000-0000-0000-000000000010';
const NOW = new Date('2026-10-07T12:00:00Z');

function req(opts: {
  id: string;
  title: string;
  status: string;
  positionsRequired: number;
  positionsFilled: number;
}) {
  return opts;
}

function placement(opts: {
  id: string;
  personName: string;
  jobRequisitionId: string;
  invoice?: { number: string; outstanding: string; issuedDaysAgo: number };
}) {
  return {
    id: opts.id,
    personName: opts.personName,
    jobRequisitionId: opts.jobRequisitionId,
    latestInvoice: opts.invoice
      ? {
          number: opts.invoice.number,
          outstandingAmount: opts.invoice.outstanding,
          issuedAt: new Date(NOW.getTime() - opts.invoice.issuedDaysAgo * 24 * 60 * 60 * 1000),
        }
      : null,
  };
}

describe('computeEmployerNextAction', () => {
  it('returns null when the employer has no reqs and no placements', () => {
    expect(
      computeEmployerNextAction({
        employerId: EMPLOYER_ID,
        requisitions: [],
        placements: [],
        now: NOW,
      }),
    ).not.toBeNull();
  });

  it('prompts to create the first requisition when none exist', () => {
    const result = computeEmployerNextAction({
      employerId: EMPLOYER_ID,
      requisitions: [],
      placements: [],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/create the first requisition/i);
    expect(result?.primary.label).toBe('New requisition');
  });

  it('prompts to raise a placement fee when a placement has no invoice', () => {
    const result = computeEmployerNextAction({
      employerId: EMPLOYER_ID,
      requisitions: [
        req({
          id: 'r1',
          title: 'Chef',
          status: 'FILLED',
          positionsRequired: 1,
          positionsFilled: 1,
        }),
      ],
      placements: [placement({ id: 'p1', personName: 'Niamh Byrne', jobRequisitionId: 'r1' })],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/raise the placement fee invoice for niamh byrne/i);
    expect(result?.primary.href).toBe(`/employers/${EMPLOYER_ID}?raisePlacement=p1`);
    expect(result?.tone).toBe('default');
  });

  it('escalates to urgent when a placement-fee invoice is overdue', () => {
    const result = computeEmployerNextAction({
      employerId: EMPLOYER_ID,
      requisitions: [
        req({
          id: 'r1',
          title: 'Chef',
          status: 'FILLED',
          positionsRequired: 1,
          positionsFilled: 1,
        }),
      ],
      placements: [
        placement({
          id: 'p1',
          personName: 'Niamh Byrne',
          jobRequisitionId: 'r1',
          invoice: { number: 'INV-0010', outstanding: '2500.00', issuedDaysAgo: 30 },
        }),
      ],
      now: NOW,
    });
    expect(result?.tone).toBe('urgent');
    expect(result?.dueHint).toBe('overdue');
    expect(result?.sentence).toContain('INV-0010');
  });

  it('skips placement states when the invoice is fully paid', () => {
    const result = computeEmployerNextAction({
      employerId: EMPLOYER_ID,
      requisitions: [
        req({
          id: 'r1',
          title: 'Chef',
          status: 'FILLED',
          positionsRequired: 1,
          positionsFilled: 1,
        }),
      ],
      placements: [
        placement({
          id: 'p1',
          personName: 'Niamh Byrne',
          jobRequisitionId: 'r1',
          invoice: { number: 'INV-0010', outstanding: '0.00', issuedDaysAgo: 30 },
        }),
      ],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it('prompts to add candidates to an open requisition with 0 filled', () => {
    const result = computeEmployerNextAction({
      employerId: EMPLOYER_ID,
      requisitions: [
        req({
          id: 'r1',
          title: 'Welder',
          status: 'OPEN',
          positionsRequired: 2,
          positionsFilled: 0,
        }),
      ],
      placements: [],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/add candidates to welder/i);
    expect(result?.primary.href).toBe('/requisitions/r1');
  });

  it('prompts to keep filling a partially-filled requisition', () => {
    const result = computeEmployerNextAction({
      employerId: EMPLOYER_ID,
      requisitions: [
        req({
          id: 'r1',
          title: 'Care Assistant',
          status: 'PARTIALLY_FILLED',
          positionsRequired: 5,
          positionsFilled: 2,
        }),
      ],
      placements: [],
      now: NOW,
    });
    expect(result?.sentence).toMatch(/3 positions to go/i);
    expect(result?.primary.href).toBe('/requisitions/r1');
  });

  it('urgency wins — overdue placement beats pending requisition work', () => {
    const result = computeEmployerNextAction({
      employerId: EMPLOYER_ID,
      requisitions: [
        req({
          id: 'r1',
          title: 'Welder',
          status: 'OPEN',
          positionsRequired: 2,
          positionsFilled: 0,
        }),
      ],
      placements: [
        placement({
          id: 'p1',
          personName: 'A B',
          jobRequisitionId: 'r1',
          invoice: { number: 'INV-OLD', outstanding: '2500.00', issuedDaysAgo: 60 },
        }),
      ],
      now: NOW,
    });
    expect(result?.tone).toBe('urgent');
    expect(result?.sentence).toContain('INV-OLD');
  });
});
