import { describe, expect, it } from 'vitest';
import { type CampaignNextActionInput, computeCampaignNextAction } from './next-action';

const base: CampaignNextActionInput = {
  campaignId: 'c1',
  status: 'ACTIVE',
  archived: false,
  adCount: 1,
  activeAdCount: 1,
  newProspects: 0,
  readyToConvert: 0,
  followUpsDue: 0,
};

describe('computeCampaignNextAction', () => {
  it('archived campaigns have no next action', () => {
    expect(computeCampaignNextAction({ ...base, archived: true, newProspects: 3 })).toBeNull();
  });
  it('due follow-ups come first and are urgent', () => {
    const a = computeCampaignNextAction({ ...base, followUpsDue: 2, newProspects: 4 });
    expect(a?.tone).toBe('urgent');
    expect(a?.sentence).toMatch(/2 prospects/);
  });
  it('then new prospects to screen', () => {
    expect(computeCampaignNextAction({ ...base, newProspects: 1 })?.sentence).toBe(
      'Screen 1 new prospect.',
    );
  });
  it('draft without ads asks for the first ad; with ads asks to activate', () => {
    expect(computeCampaignNextAction({ ...base, status: 'DRAFT', adCount: 0 })?.label).toBe(
      'Set up',
    );
    expect(computeCampaignNextAction({ ...base, status: 'DRAFT' })?.label).toBe('Ready to launch');
  });
  it('active with nothing running is flagged', () => {
    expect(computeCampaignNextAction({ ...base, activeAdCount: 0 })?.label).toBe(
      'Nothing marked live',
    );
  });
  it('screened prospects prompt conversion; otherwise nothing', () => {
    expect(computeCampaignNextAction({ ...base, readyToConvert: 2 })?.label).toBe('Convert');
    expect(computeCampaignNextAction(base)).toBeNull();
  });
});

describe('computeCampaignNextAction — paused', () => {
  it('points a paused campaign at resume + reactivating ads (after screening work)', () => {
    const paused = { ...base, status: 'PAUSED' as const, activeAdCount: 0 };
    expect(computeCampaignNextAction(paused)?.label).toBe('Paused');
    expect(computeCampaignNextAction({ ...paused, newProspects: 2 })?.label).toBe('Screening');
  });
});
