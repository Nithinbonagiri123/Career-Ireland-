'use client';

import { Loader2, Sparkles, UserMinus, UserPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  dismissMatchAction,
  runAssistedMatchingAction,
  shortlistMatchAction,
} from '@/modules/matching/actions';
import { criteriaWarning, type JobCriteria } from '@/modules/matching/criteria';
import { matchingRunSummary } from '@/modules/matching/labels';
import { DEFAULT_MIN_SCORE } from '@/modules/matching/schemas';

/** Shortlist / dismiss a suggested or reviewed match (server re-checks permission + job state). */
export function MatchRowActions({
  matchId,
  requisitionId,
  personName,
}: {
  matchId: string;
  requisitionId: string;
  personName: string;
}) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<'shortlist' | 'dismiss' | null>(null);
  const run = (kind: 'shortlist' | 'dismiss') => {
    setWhich(kind);
    start(async () => {
      const r =
        kind === 'shortlist'
          ? await shortlistMatchAction(matchId, requisitionId)
          : await dismissMatchAction(matchId, requisitionId);
      setWhich(null);
      if (r.ok)
        toast.success(`${personName} ${kind === 'shortlist' ? 'shortlisted' : 'dismissed'}`);
      else toast.error(r.error.message);
    });
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" disabled={pending} onClick={() => run('shortlist')}>
        {pending && which === 'shortlist' ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="mr-1.5 size-3.5" aria-hidden />
        )}
        Shortlist
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run('dismiss')}>
        <UserMinus className="mr-1.5 size-3.5" aria-hidden /> Dismiss
      </Button>
    </div>
  );
}

/** Run assisted matching for one open job, optionally including unavailable candidates. */
export function RunMatchingPanel({
  jobs,
  defaultJobId,
}: {
  jobs: Array<{ id: string; title: string; employerName: string; criteria: JobCriteria }>;
  defaultJobId?: string;
}) {
  const [jobId, setJobId] = useState(
    defaultJobId && jobs.some((j) => j.id === defaultJobId) ? defaultJobId : '',
  );
  const [includeUnavailable, setIncludeUnavailable] = useState(false);
  const [minScore, setMinScore] = useState(String(DEFAULT_MIN_SCORE));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const job = jobs.find((j) => j.id === jobId);
  const min = Number(minScore);
  const warning =
    job && minScore.trim() !== '' && Number.isFinite(min)
      ? criteriaWarning(job.criteria, min)
      : null;
  return (
    <section
      aria-label="Run matching"
      className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm ring-1 ring-border/60 lg:flex-row lg:flex-wrap lg:items-end"
      data-testid="run-matching"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor="rm-job" className="text-xs text-muted-foreground">
          Run matching for an open job
        </Label>
        <Select id="rm-job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">Choose a job…</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title} — {j.employerName}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1 lg:w-36">
        <Label htmlFor="rm-min" className="text-xs text-muted-foreground">
          Minimum score (0–100)
        </Label>
        <Input
          id="rm-min"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          aria-describedby="rm-min-hint"
        />
      </div>
      <div className="flex items-center gap-2 lg:pb-2">
        <Checkbox
          id="rm-include"
          checked={includeUnavailable}
          onCheckedChange={(v) => setIncludeUnavailable(v === true)}
        />
        <Label htmlFor="rm-include" className="text-sm font-normal">
          Include placed / unavailable candidates
        </Label>
      </div>
      <Button
        disabled={pending || !jobId}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await runAssistedMatchingAction({
              requisitionId: jobId,
              includeUnavailable,
              // Empty / non-numeric is sent as NaN so the server explains the rule.
              minScore: minScore.trim() === '' ? Number.NaN : Number(minScore),
            });
            if (!r.ok) {
              setError(r.error.message);
              return;
            }
            toast.success(matchingRunSummary(r.data));
          })
        }
      >
        {pending ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="mr-1.5 size-4" aria-hidden />
        )}
        {pending ? 'Scoring…' : 'Run matching'}
      </Button>
      {warning && (
        <div
          className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between lg:order-last lg:basis-full dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          role="status"
          data-testid="criteria-warning"
        >
          <span>{warning.message}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setMinScore(String(warning.suggestedMinScore))}
          >
            Use {warning.suggestedMinScore} for this run
          </Button>
        </div>
      )}
      <p id="rm-min-hint" className="text-[11px] text-muted-foreground lg:basis-full lg:order-last">
        Only new candidates scoring at least the minimum are added. Existing matches (including ones
        added by hand) are refreshed, never removed. Weak matches stay visible below.
      </p>
      {error && (
        <p className="text-xs text-destructive lg:basis-full" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
