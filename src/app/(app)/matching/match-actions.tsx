'use client';

import { Loader2, Sparkles, UserMinus, UserPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SectionCard } from '@/components/ds/workspace';
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
    <SectionCard
      icon={Sparkles}
      title="Run matching"
      description="Score candidates for one open job. New candidates above the minimum score are added to its matches."
      testId="run-matching"
      bodyClassName="space-y-3"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-[minmax(0,1fr)_10rem_auto_auto] lg:items-end">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="rm-job" className="text-xs font-medium text-foreground/70">
            Open job
          </Label>
          <Select
            id="rm-job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="h-10 rounded-xl"
          >
            <option value="">Choose a job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} — {j.employerName}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rm-min" className="text-xs font-medium text-foreground/70">
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
            className="h-10 rounded-xl"
          />
        </div>
        <div className="flex h-10 items-center gap-2">
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
          className="h-10"
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
      </div>
      {warning && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
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
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <p id="rm-min-hint" className="text-xs text-muted-foreground">
        Only new candidates scoring at least the minimum are added. Existing matches (including ones
        added by hand) are refreshed, never removed. Weak matches stay visible below.
      </p>
    </SectionCard>
  );
}
