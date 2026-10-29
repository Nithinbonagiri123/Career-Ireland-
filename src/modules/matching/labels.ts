/** R5 — display labels / tones for matches and shortlists. Client-safe. */

export const MATCH_STATUS_LABEL = {
  SUGGESTED: 'Suggested',
  REVIEWED: 'Reviewed',
  SHORTLISTED: 'Shortlisted',
  DISMISSED: 'Dismissed',
} as const;

export const MATCH_STATUS_TONE: Record<keyof typeof MATCH_STATUS_LABEL, string> = {
  SUGGESTED: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  REVIEWED: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  SHORTLISTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  DISMISSED: 'bg-muted text-muted-foreground',
};

export const BUCKET_LABEL = { HIGH: 'Strong', MEDIUM: 'Fair', LOW: 'Weak' } as const;

export const BUCKET_TONE: Record<keyof typeof BUCKET_LABEL, string> = {
  HIGH: 'bg-emerald-500 text-white',
  MEDIUM: 'bg-amber-500 text-white',
  LOW: 'bg-slate-400 text-white dark:bg-slate-500',
};

export const ORIGIN_LABEL = { ASSISTED: 'Assisted', MANUAL: 'Added by hand' } as const;

export const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  TEMPORARILY_UNAVAILABLE: 'Unavailable',
  PLACED: 'Placed',
};

/** One-line result of a matching run, shown after Run matching. */
export function matchingRunSummary(r: {
  created: number;
  refreshed: number;
  belowThreshold: number;
  minScore: number;
  excluded: number;
}): string {
  const parts = [`${r.created} new`, `${r.refreshed} refreshed`];
  if (r.belowThreshold) parts.push(`${r.belowThreshold} below the minimum score of ${r.minScore}`);
  if (r.excluded) parts.push(`${r.excluded} placed/unavailable left out`);
  return `Matching complete (minimum score ${r.minScore}) — ${parts.join(', ')}`;
}
