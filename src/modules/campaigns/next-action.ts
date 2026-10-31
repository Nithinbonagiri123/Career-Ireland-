/**
 * R4 — the single "what next" prompt on a campaign workspace. Pure, so it
 * is unit-tested without a database. Returns null when nothing is pending.
 */
export type CampaignNextActionInput = {
  campaignId: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  archived: boolean;
  adCount: number;
  activeAdCount: number;
  newProspects: number;
  readyToConvert: number;
  followUpsDue: number;
};

export type CampaignNextAction = {
  label: string;
  dueHint: string | null;
  sentence: string;
  tone: 'default' | 'urgent';
  primary: { label: string; href: string };
};

export function computeCampaignNextAction(i: CampaignNextActionInput): CampaignNextAction | null {
  if (i.archived) return null;
  const base = `/campaigns/${i.campaignId}`;
  if (i.followUpsDue > 0) {
    return {
      label: 'Follow-ups due',
      dueHint: `${i.followUpsDue} due`,
      sentence: `Follow up with ${i.followUpsDue} prospect${i.followUpsDue === 1 ? '' : 's'} whose follow-up date has arrived.`,
      tone: 'urgent',
      primary: { label: 'Open prospects', href: base },
    };
  }
  if (i.newProspects > 0) {
    return {
      label: 'Screening',
      dueHint: null,
      sentence: `Screen ${i.newProspects} new prospect${i.newProspects === 1 ? '' : 's'}.`,
      tone: 'default',
      primary: { label: 'Screen prospects', href: base },
    };
  }
  if (i.status === 'PAUSED') {
    return {
      label: 'Paused',
      dueHint: null,
      sentence:
        'The campaign is paused and its advertisements are suspended. Resume it, then mark the advertisements you want live again.',
      tone: 'default',
      primary: { label: 'Advertisements', href: `${base}?tab=ads` },
    };
  }
  if (i.status === 'DRAFT') {
    return i.adCount === 0
      ? {
          label: 'Set up',
          dueHint: null,
          sentence:
            'Record the first advertisement, then activate the campaign once you have posted it.',
          tone: 'default',
          primary: { label: 'Advertisements', href: `${base}?tab=ads` },
        }
      : {
          label: 'Ready to launch',
          dueHint: null,
          sentence:
            'The campaign is still a draft. Activate it once you have posted its advertisements.',
          tone: 'default',
          primary: { label: 'Advertisements', href: `${base}?tab=ads` },
        };
  }
  if (i.status === 'ACTIVE' && i.activeAdCount === 0) {
    return {
      label: 'Nothing marked live',
      dueHint: null,
      sentence: 'The campaign is active but no advertisement is marked live.',
      tone: 'urgent',
      primary: { label: 'Advertisements', href: `${base}?tab=ads` },
    };
  }
  if (i.readyToConvert > 0) {
    return {
      label: 'Convert',
      dueHint: null,
      sentence: `${i.readyToConvert} screened prospect${i.readyToConvert === 1 ? ' is' : 's are'} ready to become candidates or stay in the talent pool.`,
      tone: 'default',
      primary: { label: 'Review prospects', href: base },
    };
  }
  return null;
}
