import { describe, expect, it } from 'vitest';
import {
  BUSINESSES,
  encodeKey,
  hasAnyPermission,
  hasPermission,
  isValidPermission,
  MODULES,
  presetForRole,
  reachableBusinesses,
  VERBS,
} from './permissions';

describe('encodeKey', () => {
  it('joins with dots', () => {
    expect(encodeKey('candidate_services', 'leads', 'view')).toBe('candidate_services.leads.view');
  });
});

describe('hasPermission — verb cascade', () => {
  const granted = new Set(['candidate_services.candidates.edit']);

  it('exact match returns true', () => {
    expect(hasPermission(granted, 'candidate_services', 'candidates', 'edit')).toBe(true);
  });

  it('lower verb passes when a higher verb is granted (view under edit)', () => {
    expect(hasPermission(granted, 'candidate_services', 'candidates', 'view')).toBe(true);
    expect(hasPermission(granted, 'candidate_services', 'candidates', 'create')).toBe(true);
  });

  it('higher verb fails when only a lower verb is granted (delete not implied by edit)', () => {
    expect(hasPermission(granted, 'candidate_services', 'candidates', 'delete')).toBe(false);
    expect(hasPermission(granted, 'candidate_services', 'candidates', 'manage')).toBe(false);
  });

  it('a manage grant satisfies every verb on that module', () => {
    const mng = new Set(['recruitment.requisitions.manage']);
    for (const verb of VERBS) {
      expect(hasPermission(mng, 'recruitment', 'requisitions', verb)).toBe(true);
    }
  });

  it('does not leak between businesses', () => {
    const g = new Set(['recruitment.candidates.manage']); // wrong business
    expect(hasPermission(g, 'candidate_services', 'candidates', 'view')).toBe(false);
  });

  it('does not leak between modules', () => {
    const g = new Set(['recruitment.employers.manage']);
    expect(hasPermission(g, 'recruitment', 'candidates', 'view')).toBe(false);
  });

  it('empty grant set → nothing passes', () => {
    for (const business of BUSINESSES) {
      for (const module of MODULES[business]) {
        for (const verb of VERBS) {
          expect(hasPermission(new Set(), business, module, verb)).toBe(false);
        }
      }
    }
  });
});

describe('hasAnyPermission', () => {
  it('true when the user can at least view the module', () => {
    const g = new Set(['immigration.cases.view']);
    expect(hasAnyPermission(g, 'immigration', 'cases')).toBe(true);
  });
  it('true when the user has any higher verb (cascade)', () => {
    const g = new Set(['immigration.cases.manage']);
    expect(hasAnyPermission(g, 'immigration', 'cases')).toBe(true);
  });
  it('false when nothing is granted for that module', () => {
    const g = new Set(['immigration.dashboard.view']);
    expect(hasAnyPermission(g, 'immigration', 'cases')).toBe(false);
  });
});

describe('reachableBusinesses', () => {
  it('returns businesses in canonical order regardless of grant order', () => {
    const g = new Set([
      'recruitment.candidates.view',
      'main.overview.view',
      'candidate_services.leads.edit',
    ]);
    expect(reachableBusinesses(g)).toEqual(['main', 'candidate_services', 'recruitment']);
  });
  it('empty when no grants', () => {
    expect(reachableBusinesses(new Set())).toEqual([]);
  });
  it('ignores malformed keys', () => {
    const g = new Set(['bogus.module.view', 'candidate_services.leads.view']);
    expect(reachableBusinesses(g)).toEqual(['candidate_services']);
  });
});

describe('isValidPermission', () => {
  it('accepts a known triple', () => {
    expect(isValidPermission('recruitment', 'employers', 'edit')).toBe(true);
  });
  it('rejects unknown business', () => {
    expect(isValidPermission('marketing', 'employers', 'edit')).toBe(false);
  });
  it('rejects unknown module for a valid business', () => {
    expect(isValidPermission('recruitment', 'ghosts', 'edit')).toBe(false);
  });
  it('rejects unknown verb', () => {
    expect(isValidPermission('recruitment', 'employers', 'peek')).toBe(false);
  });
});

describe('presetForRole', () => {
  it('ADMIN gets every verb on every module', () => {
    const admin = presetForRole('ADMIN');
    let expected = 0;
    for (const b of BUSINESSES) expected += MODULES[b].length * VERBS.length;
    expect(admin.length).toBe(expected);
  });

  it('STAFF, CANDIDATE, EMPLOYER get nothing', () => {
    expect(presetForRole('STAFF')).toHaveLength(0);
    expect(presetForRole('CANDIDATE')).toHaveLength(0);
    expect(presetForRole('EMPLOYER')).toHaveLength(0);
  });

  it('MANAGER gets view/create/edit everywhere, no delete/manage', () => {
    const preset = presetForRole('MANAGER');
    const verbs = new Set(preset.map((p) => p.verb));
    expect(verbs.has('view')).toBe(true);
    expect(verbs.has('create')).toBe(true);
    expect(verbs.has('edit')).toBe(true);
    expect(verbs.has('delete')).toBe(false);
    expect(verbs.has('manage')).toBe(false);
  });

  it('RECRUITER preset stays inside the recruitment workspace', () => {
    const preset = presetForRole('RECRUITER');
    for (const p of preset) expect(p.business).toBe('recruitment');
    // Every recruitment module gets covered.
    const covered = new Set(preset.map((p) => p.module));
    for (const m of MODULES.recruitment) expect(covered.has(m)).toBe(true);
  });

  it('DOCUMENT_SPECIALIST covers documents (CS) + cases (immigration) only', () => {
    const preset = presetForRole('DOCUMENT_SPECIALIST');
    const keys = preset.map((p) => `${p.business}.${p.module}`);
    expect(new Set(keys)).toEqual(new Set(['candidate_services.documents', 'immigration.cases']));
  });

  it('FINANCE covers billing + accounts only', () => {
    const preset = presetForRole('FINANCE');
    const keys = new Set(preset.map((p) => `${p.business}.${p.module}`));
    expect(keys).toEqual(
      new Set(['candidate_services.payments', 'candidate_services.engagements', 'main.accounts']),
    );
  });

  it('every preset row is a valid permission (no typos)', () => {
    for (const role of [
      'ADMIN',
      'MANAGER',
      'RECRUITER',
      'DOCUMENT_SPECIALIST',
      'FINANCE',
    ] as const) {
      for (const p of presetForRole(role)) {
        expect(isValidPermission(p.business, p.module, p.verb)).toBe(true);
      }
    }
  });
});
