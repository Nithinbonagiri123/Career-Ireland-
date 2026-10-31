/**
 * R4 — display labels and badge tones for campaigns, ads and prospects.
 * Pure data, safe to import from client components.
 */

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type AdStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CLOSED';
export type ProspectStatus =
  | 'NEW'
  | 'SCREENED'
  | 'CONVERTED_TO_CANDIDATE'
  | 'RETAINED_IN_POOL'
  | 'NOT_SUITABLE';

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const AD_STATUS_LABEL: Record<AdStatus, string> = {
  DRAFT: 'Draft',
  // The CRM does not post adverts: the user marks one live after posting it.
  ACTIVE: 'Marked live',
  PAUSED: 'Paused',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
};

export const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  NEW: 'New',
  SCREENED: 'Screened',
  CONVERTED_TO_CANDIDATE: 'Converted',
  RETAINED_IN_POOL: 'Talent pool',
  NOT_SUITABLE: 'Not suitable',
};

/** Badge variants (same palette as the rest of the workspace). */
export type Tone = 'default' | 'secondary' | 'outline' | 'destructive';

export const PROSPECT_TONE: Record<ProspectStatus, string> = {
  NEW: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  SCREENED: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  RETAINED_IN_POOL: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  CONVERTED_TO_CANDIDATE:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  NOT_SUITABLE: 'bg-muted text-muted-foreground',
};

export const CAMPAIGN_TONE: Record<CampaignStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  PAUSED: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  COMPLETED: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  CANCELLED: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
};

export const AD_TONE: Record<AdStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  PAUSED: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  EXPIRED: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  CLOSED: 'bg-muted text-muted-foreground',
};

/** Same moves the server allows (src/lib/state-machine.ts) — UI hints only. */
export const PROSPECT_NEXT: Record<ProspectStatus, ProspectStatus[]> = {
  NEW: ['SCREENED', 'RETAINED_IN_POOL', 'NOT_SUITABLE'],
  SCREENED: ['RETAINED_IN_POOL', 'NOT_SUITABLE'],
  RETAINED_IN_POOL: ['SCREENED', 'NOT_SUITABLE'],
  NOT_SUITABLE: ['SCREENED'],
  CONVERTED_TO_CANDIDATE: [],
};

export const AD_NEXT: Record<AdStatus, AdStatus[]> = {
  DRAFT: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['PAUSED', 'EXPIRED', 'CLOSED'],
  PAUSED: ['ACTIVE', 'CLOSED'],
  EXPIRED: ['CLOSED'],
  CLOSED: [],
};

export const CONVERTIBLE: ProspectStatus[] = ['SCREENED', 'RETAINED_IN_POOL'];

/**
 * Ads that can still take new prospects: ones that were marked live (live
 * now, or expired after being live). Never a draft — nobody has responded
 * to an advert that was never posted. Mirrors createProspect on the server.
 */
export const AD_ACCEPTS_PROSPECTS: AdStatus[] = ['ACTIVE', 'EXPIRED'];

/** Helper text wherever an advert's status is set. */
export const AD_HONESTY_HINT =
  'The CRM does not post adverts; record where you posted it in notes.';
