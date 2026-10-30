import type { DsTone } from '@/components/ds/tones';
import type { AdStatus, CampaignStatus, ProspectStatus } from '@/modules/campaigns/labels';

/**
 * Stage 6G pill tones for campaigns, advertisements and prospects. Labels
 * stay in src/modules/campaigns/labels.ts; these only pick the pastel tone
 * so every campaign screen shows the same status in the same colour.
 */
export const CAMPAIGN_DS_TONE: Record<CampaignStatus, DsTone> = {
  DRAFT: 'slate',
  ACTIVE: 'green',
  PAUSED: 'amber',
  COMPLETED: 'blue',
  CANCELLED: 'rose',
};

export const AD_DS_TONE: Record<AdStatus, DsTone> = {
  DRAFT: 'slate',
  ACTIVE: 'green',
  PAUSED: 'amber',
  EXPIRED: 'rose',
  CLOSED: 'slate',
};

export const PROSPECT_DS_TONE: Record<ProspectStatus, DsTone> = {
  NEW: 'blue',
  SCREENED: 'violet',
  RETAINED_IN_POOL: 'amber',
  CONVERTED_TO_CANDIDATE: 'green',
  NOT_SUITABLE: 'slate',
};
