import { describe, expect, it } from 'vitest';
import { BusinessRuleError } from './errors';
import {
  APPLICATION_TRANSITIONS,
  assertTransition,
  IMMIGRATION_CASE_TRANSITIONS,
  INTERVIEW_TRANSITIONS,
  LEAD_TRANSITIONS,
  OFFER_TRANSITIONS,
  PLACEMENT_TRANSITIONS,
  REQUISITION_TRANSITIONS,
  type TransitionMap,
} from './state-machine';

// The exported constants are typed with `as const satisfies TransitionMap<...>`,
// which narrows away terminal keys entirely. To assert "this state is terminal"
// we widen back to TransitionMap<string> so `.SOME_TERMINAL` is `undefined`
// rather than a type error.
const widen = <T extends TransitionMap<string>>(fsm: T): TransitionMap<string> =>
  fsm as TransitionMap<string>;

describe('assertTransition', () => {
  it('is a no-op for same-state transitions', () => {
    expect(() => assertTransition('lead', 'NEW', 'NEW', LEAD_TRANSITIONS)).not.toThrow();
  });

  it('allows valid transitions', () => {
    expect(() => assertTransition('lead', 'NEW', 'CONTACTED', LEAD_TRANSITIONS)).not.toThrow();
    expect(() =>
      assertTransition('application', 'APPLIED', 'SHORTLISTED', APPLICATION_TRANSITIONS),
    ).not.toThrow();
  });

  it('rejects invalid transitions with BusinessRuleError', () => {
    expect(() => assertTransition('lead', 'CONVERTED', 'NEW', LEAD_TRANSITIONS)).toThrow(
      BusinessRuleError,
    );
    expect(() =>
      assertTransition('application', 'WITHDRAWN', 'APPLIED', APPLICATION_TRANSITIONS),
    ).toThrow(BusinessRuleError);
  });

  it('uses the INVALID_STATE_TRANSITION error code', () => {
    try {
      assertTransition('lead', 'CONVERTED', 'NEW', LEAD_TRANSITIONS);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('INVALID_STATE_TRANSITION');
    }
  });
});

describe('LEAD_TRANSITIONS', () => {
  it('CONVERTED is terminal', () => {
    expect(widen(LEAD_TRANSITIONS).CONVERTED).toBeUndefined();
  });

  it('cannot skip from NEW to CONVERTED directly', () => {
    expect(() => assertTransition('lead', 'NEW', 'CONVERTED', LEAD_TRANSITIONS)).toThrow();
  });

  it('permits full happy path: NEW → CONTACTED → AWAITING_PAYMENT → CONVERTED', () => {
    // Note: NEW → CONTACTED, CONTACTED → AWAITING_PAYMENT, AWAITING_PAYMENT → CONVERTED
    expect(() => assertTransition('lead', 'NEW', 'CONTACTED', LEAD_TRANSITIONS)).not.toThrow();
    expect(() =>
      assertTransition('lead', 'CONTACTED', 'AWAITING_PAYMENT', LEAD_TRANSITIONS),
    ).not.toThrow();
    expect(() =>
      assertTransition('lead', 'AWAITING_PAYMENT', 'CONVERTED', LEAD_TRANSITIONS),
    ).not.toThrow();
  });

  it('permits rescue path: LOST → CONTACTED', () => {
    expect(() => assertTransition('lead', 'LOST', 'CONTACTED', LEAD_TRANSITIONS)).not.toThrow();
  });
});

describe('APPLICATION_TRANSITIONS', () => {
  it('WITHDRAWN is fully terminal', () => {
    expect(widen(APPLICATION_TRANSITIONS).WITHDRAWN).toBeUndefined();
  });

  it('ACCEPTED can only go to WITHDRAWN', () => {
    expect(() =>
      assertTransition('application', 'ACCEPTED', 'REJECTED', APPLICATION_TRANSITIONS),
    ).toThrow();
    expect(() =>
      assertTransition('application', 'ACCEPTED', 'WITHDRAWN', APPLICATION_TRANSITIONS),
    ).not.toThrow();
  });

  it('OFFER can go to ACCEPTED', () => {
    expect(() =>
      assertTransition('application', 'OFFER', 'ACCEPTED', APPLICATION_TRANSITIONS),
    ).not.toThrow();
  });

  it('cannot skip APPLIED → OFFER directly', () => {
    expect(() =>
      assertTransition('application', 'APPLIED', 'OFFER', APPLICATION_TRANSITIONS),
    ).toThrow();
  });
});

describe('PLACEMENT_TRANSITIONS', () => {
  it('COMPLETED and TERMINATED_EARLY are terminal', () => {
    const fsm = widen(PLACEMENT_TRANSITIONS);
    expect(fsm.COMPLETED).toBeUndefined();
    expect(fsm.TERMINATED_EARLY).toBeUndefined();
  });

  it('follows PROPOSED → CONFIRMED → STARTED → COMPLETED', () => {
    expect(() =>
      assertTransition('placement', 'PROPOSED', 'CONFIRMED', PLACEMENT_TRANSITIONS),
    ).not.toThrow();
    expect(() =>
      assertTransition('placement', 'CONFIRMED', 'STARTED', PLACEMENT_TRANSITIONS),
    ).not.toThrow();
    expect(() =>
      assertTransition('placement', 'STARTED', 'COMPLETED', PLACEMENT_TRANSITIONS),
    ).not.toThrow();
  });

  it('cannot skip PROPOSED → STARTED', () => {
    expect(() =>
      assertTransition('placement', 'PROPOSED', 'STARTED', PLACEMENT_TRANSITIONS),
    ).toThrow();
  });
});

describe('REQUISITION_TRANSITIONS', () => {
  it('CLOSED and CANCELLED are terminal', () => {
    const fsm = widen(REQUISITION_TRANSITIONS);
    expect(fsm.CLOSED).toBeUndefined();
    expect(fsm.CANCELLED).toBeUndefined();
  });

  it('DRAFT can only go to OPEN or CANCELLED', () => {
    expect(() =>
      assertTransition('requisition', 'DRAFT', 'OPEN', REQUISITION_TRANSITIONS),
    ).not.toThrow();
    expect(() =>
      assertTransition('requisition', 'DRAFT', 'FILLED', REQUISITION_TRANSITIONS),
    ).toThrow();
  });
});

describe('IMMIGRATION_CASE_TRANSITIONS', () => {
  it('CLOSED is terminal', () => {
    expect(widen(IMMIGRATION_CASE_TRANSITIONS).CLOSED).toBeUndefined();
  });

  it('APPROVED can only go to CLOSED', () => {
    expect(() =>
      assertTransition('immigration_case', 'APPROVED', 'REJECTED', IMMIGRATION_CASE_TRANSITIONS),
    ).toThrow();
    expect(() =>
      assertTransition('immigration_case', 'APPROVED', 'CLOSED', IMMIGRATION_CASE_TRANSITIONS),
    ).not.toThrow();
  });

  it('REJECTED can re-open to SUBMITTED (retry path)', () => {
    expect(() =>
      assertTransition('immigration_case', 'REJECTED', 'SUBMITTED', IMMIGRATION_CASE_TRANSITIONS),
    ).not.toThrow();
  });
});

describe('INTERVIEW_TRANSITIONS', () => {
  it('COMPLETED / NO_SHOW / CANCELLED are terminal', () => {
    const fsm = widen(INTERVIEW_TRANSITIONS);
    expect(fsm.COMPLETED).toBeUndefined();
    expect(fsm.NO_SHOW).toBeUndefined();
    expect(fsm.CANCELLED).toBeUndefined();
  });

  it('RESCHEDULED can go back to SCHEDULED', () => {
    expect(() =>
      assertTransition('interview', 'RESCHEDULED', 'SCHEDULED', INTERVIEW_TRANSITIONS),
    ).not.toThrow();
  });
});

describe('OFFER_TRANSITIONS', () => {
  it('ACCEPTED / REJECTED / WITHDRAWN / EXPIRED are terminal', () => {
    const fsm = widen(OFFER_TRANSITIONS);
    expect(fsm.ACCEPTED).toBeUndefined();
    expect(fsm.REJECTED).toBeUndefined();
    expect(fsm.WITHDRAWN).toBeUndefined();
    expect(fsm.EXPIRED).toBeUndefined();
  });

  it('permits SENT → NEGOTIATING → SENT loop', () => {
    expect(() => assertTransition('offer', 'SENT', 'NEGOTIATING', OFFER_TRANSITIONS)).not.toThrow();
    expect(() => assertTransition('offer', 'NEGOTIATING', 'SENT', OFFER_TRANSITIONS)).not.toThrow();
  });

  it('DRAFT cannot skip to ACCEPTED', () => {
    expect(() => assertTransition('offer', 'DRAFT', 'ACCEPTED', OFFER_TRANSITIONS)).toThrow();
  });
});
