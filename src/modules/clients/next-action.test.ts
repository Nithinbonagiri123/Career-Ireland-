import { describe, expect, it } from 'vitest';
import { type ClientNextActionInput, computeClientNextAction } from './next-action';

/**
 * The resolver is a pure function; this file is the authoritative state
 * matrix. Any change to the priority order of candidate activation vs.
 * payment confirmation vs. quote lifecycle MUST update this file.
 */

const PID = '11111111-1111-4111-a111-111111111111';
const LID = '22222222-2222-4222-a222-222222222222';
const PFID = '33333333-3333-4333-a333-333333333333';

function baseline(overrides: Partial<ClientNextActionInput> = {}): ClientNextActionInput {
  return {
    personId: PID,
    canVerifyPayments: false,
    hasCandidateProfile: false,
    availabilityStatus: null,
    leads: [],
    proFormas: [],
    payments: [],
    invoices: [],
    engagements: [],
    now: new Date('2026-10-17T00:00:00Z'),
    ...overrides,
  };
}

describe('computeClientNextAction — null states', () => {
  it('returns null for a person with no leads, no quotes, no money', () => {
    expect(computeClientNextAction(baseline())).toBeNull();
  });

  it('returns null when the only lead is terminal (LOST/REJECTED/EXPIRED)', () => {
    for (const status of ['LOST', 'REJECTED', 'EXPIRED', 'ARCHIVED'] as const) {
      expect(
        computeClientNextAction(
          baseline({
            leads: [{ id: LID, status, targetBusiness: 'CANDIDATE_SERVICES' }],
          }),
        ),
      ).toBeNull();
    }
  });

  it('returns null when candidate is activated + all engagements complete + available', () => {
    expect(
      computeClientNextAction(
        baseline({
          hasCandidateProfile: true,
          availabilityStatus: 'AVAILABLE',
          engagements: [{ id: 'e1', status: 'COMPLETED', archivedAt: null }],
        }),
      ),
    ).toBeNull();
  });
});

describe('computeClientNextAction — overdue invoice beats everything', () => {
  it('urgent tone + days-overdue in the sentence', () => {
    const issuedAt = new Date('2026-09-01T00:00:00Z');
    const r = computeClientNextAction(
      baseline({
        invoices: [
          { number: 'INV-2026-000001', status: 'ISSUED', outstandingAmount: '500.00', issuedAt },
        ],
      }),
    );
    expect(r?.tone).toBe('urgent');
    expect(r?.dueHint).toBe('overdue');
    expect(r?.sentence).toContain('46 days past due');
    expect(r?.primary).toMatchObject({ kind: 'link', label: 'View invoice' });
  });

  it('a VOIDED invoice never surfaces as outstanding', () => {
    const issuedAt = new Date('2026-09-01T00:00:00Z');
    expect(
      computeClientNextAction(
        baseline({
          invoices: [{ number: 'INV-X', status: 'VOIDED', outstandingAmount: '500.00', issuedAt }],
        }),
      ),
    ).toBeNull();
  });
});

describe('computeClientNextAction — unverified payment', () => {
  it('finance sees "Confirm payment received" linking to the pro-forma', () => {
    const r = computeClientNextAction(
      baseline({
        canVerifyPayments: true,
        proFormas: [
          { id: PFID, number: 'PROF-2026-000010', status: 'ACCEPTED', sourceLeadId: LID },
        ],
        payments: [{ status: 'PROOF_UPLOADED' }],
      }),
    );
    expect(r?.primary.kind).toBe('link');
    expect(r?.primary.label).toBe('Confirm payment received');
    if (!r) throw new Error('expected a next action');
    expect((r.primary as { href: string }).href).toContain(PFID);
  });

  it('non-finance sees muted "Awaiting finance confirmation" (disabled)', () => {
    const r = computeClientNextAction(
      baseline({
        canVerifyPayments: false,
        payments: [{ status: 'PENDING' }],
      }),
    );
    expect(r?.tone).toBe('muted');
    expect(r?.primary.kind).toBe('disabled');
    expect(r?.primary.label).toContain('Awaiting finance');
  });
});

describe('computeClientNextAction — the activate-candidate split', () => {
  it('verified payment + CS lead + no profile → Activate candidate', () => {
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'CONVERTED', targetBusiness: 'CANDIDATE_SERVICES' }],
        payments: [{ status: 'VERIFIED' }],
      }),
    );
    expect(r?.primary).toMatchObject({ kind: 'dialog', dialog: 'activate-candidate' });
    expect(r?.sentence).toContain('activate');
  });

  it('verified payment + profile already exists → NOT Activate (falls through)', () => {
    const r = computeClientNextAction(
      baseline({
        hasCandidateProfile: true,
        leads: [{ id: LID, status: 'CONVERTED', targetBusiness: 'CANDIDATE_SERVICES' }],
        payments: [{ status: 'VERIFIED' }],
      }),
    );
    // Falls through to engagement management or null — not the activate dialog.
    expect(r?.primary.kind).not.toBe('dialog');
  });

  it('verified payment + no CS lead (recruitment-only person) → no activation prompt', () => {
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'CONVERTED', targetBusiness: 'RECRUITMENT' }],
        payments: [{ status: 'VERIFIED' }],
      }),
    );
    // Does not propose candidate activation for non-CS leads.
    const isActivate =
      r?.primary.kind === 'dialog' &&
      (r.primary as { dialog?: string }).dialog === 'activate-candidate';
    expect(isActivate).toBe(false);
  });
});

describe('computeClientNextAction — quote lifecycle', () => {
  const futureIssuedAt = new Date('2026-10-15T00:00:00Z');
  it('ACCEPTED quote with no payments → Record payment (link to pro-forma)', () => {
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'AWAITING_PAYMENT', targetBusiness: 'CANDIDATE_SERVICES' }],
        proFormas: [
          { id: PFID, number: 'PROF-2026-000001', status: 'ACCEPTED', sourceLeadId: LID },
        ],
      }),
    );
    expect(r?.primary.kind).toBe('link');
    expect(r?.primary.label).toBe('Record payment');
    if (!r) throw new Error('expected a next action');
    expect((r.primary as { href: string }).href).toContain(PFID);
  });

  it('ISSUED quote → Mark as accepted (link to pro-forma)', () => {
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'AWAITING_PAYMENT', targetBusiness: 'CANDIDATE_SERVICES' }],
        proFormas: [{ id: PFID, number: 'PROF-2026-000002', status: 'ISSUED', sourceLeadId: LID }],
      }),
    );
    expect(r?.primary.kind).toBe('link');
    expect(r?.primary.label).toBe('Mark as accepted');
    if (!r) throw new Error('expected a next action');
    expect((r.primary as { href: string }).href).toContain(PFID);
  });

  it('DRAFT quote → link to the draft (operator needs to open it to issue)', () => {
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'NEW', targetBusiness: 'CANDIDATE_SERVICES' }],
        proFormas: [{ id: PFID, number: 'PROF-2026-000003', status: 'DRAFT', sourceLeadId: LID }],
      }),
    );
    expect(r?.primary.kind).toBe('link');
    if (!r) throw new Error('expected a next action');
    expect((r.primary as { href: string }).href).toContain(PFID);
  });

  it('open CS lead with no quotes → Create quote (links back to the lead)', () => {
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'NEW', targetBusiness: 'CANDIDATE_SERVICES' }],
      }),
    );
    expect(r?.primary).toMatchObject({ kind: 'link', label: 'Create quote' });
  });

  it('outstanding invoice (not yet overdue) → Record payment dialog', () => {
    const r = computeClientNextAction(
      baseline({
        invoices: [
          {
            number: 'INV-2026-000050',
            status: 'ISSUED',
            outstandingAmount: '200.00',
            issuedAt: futureIssuedAt,
          },
        ],
      }),
    );
    expect(r?.primary).toMatchObject({ kind: 'dialog', dialog: 'record-payment' });
  });
});

describe('computeClientNextAction — multiple accepted PFs do not shadow each other', () => {
  it('one ACCEPTED PF with payment + one ACCEPTED PF without → surfaces the unpaid one', () => {
    const PF_PAID = '77777777-7777-4777-a777-777777777777';
    const PF_UNPAID = '88888888-8888-4888-a888-888888888888';
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'AWAITING_PAYMENT', targetBusiness: 'CANDIDATE_SERVICES' }],
        proFormas: [
          { id: PF_PAID, number: 'PROF-PAID', status: 'ACCEPTED', sourceLeadId: LID },
          { id: PF_UNPAID, number: 'PROF-UNPAID', status: 'ACCEPTED', sourceLeadId: LID },
        ],
        // A payment exists against PF_PAID only. Previously the whole-
        // client payments.length === 0 check would skip prompting for
        // PF_UNPAID; this regression test locks the per-PF check.
        payments: [{ status: 'VERIFIED', proFormaInvoiceId: PF_PAID }],
      }),
    );
    expect(r?.sentence).toContain('PROF-UNPAID');
  });

  it('two ACCEPTED PFs both unpaid → surfaces one of them (first match)', () => {
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'AWAITING_PAYMENT', targetBusiness: 'CANDIDATE_SERVICES' }],
        proFormas: [
          { id: 'pf-a', number: 'PROF-A', status: 'ACCEPTED', sourceLeadId: LID },
          { id: 'pf-b', number: 'PROF-B', status: 'ACCEPTED', sourceLeadId: LID },
        ],
      }),
    );
    expect(r?.primary.label).toBe('Record payment');
    expect(r?.sentence).toMatch(/PROF-[AB]/);
  });

  it('a REJECTED payment does not satisfy the ACCEPTED PF — still prompts for payment', () => {
    const PF = '99999999-9999-4999-a999-999999999999';
    const r = computeClientNextAction(
      baseline({
        leads: [{ id: LID, status: 'AWAITING_PAYMENT', targetBusiness: 'CANDIDATE_SERVICES' }],
        proFormas: [{ id: PF, number: 'PROF-REJ', status: 'ACCEPTED', sourceLeadId: LID }],
        payments: [{ status: 'REJECTED', proFormaInvoiceId: PF }],
      }),
    );
    expect(r?.sentence).toContain('PROF-REJ');
  });
});

describe('computeClientNextAction — post-activation engagement management', () => {
  it('completed engagement + candidate not AVAILABLE → prompt to mark Available', () => {
    const r = computeClientNextAction(
      baseline({
        hasCandidateProfile: true,
        availabilityStatus: 'PLACED',
        engagements: [{ id: 'e1', status: 'COMPLETED', archivedAt: null }],
      }),
    );
    expect(r?.sentence).toContain('Available');
  });

  it('pending engagement → "advance to Active"', () => {
    const r = computeClientNextAction(
      baseline({
        hasCandidateProfile: true,
        availabilityStatus: 'AVAILABLE',
        engagements: [{ id: 'e1', status: 'PENDING_PAYMENT', archivedAt: null }],
      }),
    );
    expect(r?.sentence).toContain('advance');
  });
});
