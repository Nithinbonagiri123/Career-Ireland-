'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { Briefcase, CheckCircle2, FileScan, Loader2, Plus, ScanLine } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/section-header';
import { Card, CardContent } from '@/components/ui/card';
import {
  acceptCvSuggestionsAction,
  buildCvSuggestionsAction,
} from '@/modules/cv-parse/actions';
import type { CvSuggestions } from '@/modules/cv-parse/suggest';

/**
 * "Suggestions from CV" panel — deterministic, LLM-free.
 *
 *   [ Scan CV ]  →  server extracts text (cached), matches against catalog,
 *                    picks free-text phrases from Skills / Education sections
 *                    and parses the Employment History section into blocks.
 *
 * Renders five buckets: skill hits + custom skill candidates + qual hits +
 * custom qual candidates + employment blocks. Each row has a checkbox.
 * "Accept selected" runs one round-trip that inserts everything ticked
 * using the same add-skill / add-qualification / upsert-employment services
 * the manual dialogs use.
 */
export function CvSuggestionsPanel({ personId }: { personId: string }) {
  const [suggestions, setSuggestions] = useState<CvSuggestions | null>(null);
  const [picked, setPicked] = useState<{
    skillIds: Set<string>;
    customSkills: Set<string>;
    qualificationIds: Set<string>;
    customQualifications: Set<string>;
    employment: Set<string>;
  }>({
    skillIds: new Set(),
    customSkills: new Set(),
    qualificationIds: new Set(),
    customQualifications: new Set(),
    employment: new Set(),
  });
  const [pending, startTransition] = useTransition();

  const scan = () => {
    startTransition(async () => {
      const r = await buildCvSuggestionsAction({ personId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setSuggestions(r.data);
      setPicked({
        skillIds: new Set(),
        customSkills: new Set(),
        qualificationIds: new Set(),
        customQualifications: new Set(),
        employment: new Set(),
      });
      const totalHits =
        r.data.skills.catalogHits.length +
        r.data.skills.customCandidates.length +
        r.data.qualifications.catalogHits.length +
        r.data.qualifications.customCandidates.length +
        r.data.employment.candidates.length;
      if (r.data.documentInstanceId === null) {
        toast.warning('No CV on file for this candidate.');
      } else if (r.data.parseError) {
        toast.error(`Couldn't parse CV: ${r.data.parseError}`);
      } else if (totalHits === 0) {
        toast.info('Scanned — nothing new to suggest (all matches already on file).');
      } else {
        toast.success(`Found ${totalHits} suggestion${totalHits === 1 ? '' : 's'}.`);
      }
    });
  };

  const totalPicked =
    picked.skillIds.size +
    picked.customSkills.size +
    picked.qualificationIds.size +
    picked.customQualifications.size +
    picked.employment.size;

  const accept = () => {
    if (!suggestions) return;
    const pickedEmployment = suggestions.employment.candidates
      .filter((c) => picked.employment.has(c.key))
      .map((c) => ({
        employerName: c.employerName,
        jobTitle: c.jobTitle,
        location: c.location,
        startDate: c.startDate,
        endDate: c.endDate,
        isCurrent: c.isCurrent,
        description: c.description,
      }));
    startTransition(async () => {
      const r = await acceptCvSuggestionsAction({
        personId,
        skillIds: [...picked.skillIds],
        customSkills: [...picked.customSkills],
        qualificationIds: [...picked.qualificationIds],
        customQualifications: [...picked.customQualifications],
        employment: pickedEmployment,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      const { added, errors } = r.data;
      if (added > 0) toast.success(`Added ${added} row${added === 1 ? '' : 's'}`);
      if (errors.length > 0) {
        for (const e of errors.slice(0, 3)) toast.warning(e);
      }
      scan();
    });
  };

  const toggle = (bucket: keyof typeof picked, key: string) => {
    setPicked((prev) => {
      const next = { ...prev };
      const set = new Set(prev[bucket]);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      next[bucket] = set;
      return next;
    });
  };

  return (
    <Card>
      <SectionHeader
        icon={FileScan}
        title="Suggestions from CV"
        action={
          <Button variant="outline" size="sm" onClick={scan} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <ScanLine className="mr-1.5 size-3.5" />
            )}
            {suggestions ? 'Rescan CV' : 'Scan CV'}
          </Button>
        }
      >
        Deterministic scan of the latest uploaded CV — matches against Skills /
        Qualifications catalogs, picks free-text candidates from typical CV
        sections, and parses the Employment History block. No LLM, no external
        calls.
      </SectionHeader>
      <CardContent>
        {!suggestions ? (
          <EmptyState
            icon={FileScan}
            title="Not scanned yet"
            description='Click "Scan CV" to extract skills, qualifications and employment history from the latest uploaded CV.'
          />
        ) : suggestions.documentInstanceId === null ? (
          <EmptyState
            icon={FileScan}
            title="No CV on file"
            description="Upload a CV to this candidate's Documents tab first, then scan again."
          />
        ) : suggestions.parsedAt === null ? (
          <EmptyState
            icon={FileScan}
            title="Couldn't parse this CV"
            description={
              suggestions.parseError
                ? `${suggestions.filename ?? 'CV'} — ${suggestions.parseError}`
                : `The file "${suggestions.filename ?? 'CV'}" isn't a supported format. Only PDF and Word (.docx) can be scanned.`
            }
          />
        ) : (
          <div className="space-y-6">
            <p className="text-[11px] text-muted-foreground">
              Scanned <span className="font-mono">{suggestions.filename}</span>
              {suggestions.parsedAt && (
                <> · {formatDistanceToNow(suggestions.parsedAt, { addSuffix: true })}</>
              )}
            </p>

            <Section
              title="Skills — catalog matches"
              hint="Adds a canonical skill row that feeds candidate matching."
              rows={suggestions.skills.catalogHits.map((h) => ({
                key: h.id,
                label: h.name,
                foundIn: h.foundIn,
                selected: picked.skillIds.has(h.id),
                onToggle: () => toggle('skillIds', h.id),
                badge: 'CATALOG',
              }))}
            />
            <Section
              title="Skills — free-text candidates"
              hint="From the CV's Skills section but not in the catalog. Added as free text (custom)."
              rows={suggestions.skills.customCandidates.map((c) => ({
                key: c.phrase,
                label: c.phrase,
                foundIn: c.foundIn,
                selected: picked.customSkills.has(c.phrase),
                onToggle: () => toggle('customSkills', c.phrase),
                badge: 'CUSTOM',
              }))}
            />
            <Section
              title="Qualifications — catalog matches"
              hint="Adds a canonical qualification row that feeds candidate matching."
              rows={suggestions.qualifications.catalogHits.map((h) => ({
                key: h.id,
                label: h.name,
                foundIn: h.foundIn,
                selected: picked.qualificationIds.has(h.id),
                onToggle: () => toggle('qualificationIds', h.id),
                badge: 'CATALOG',
              }))}
            />
            <Section
              title="Qualifications — free-text candidates"
              hint="From the CV's Education / Qualifications section. Added as free text (custom)."
              rows={suggestions.qualifications.customCandidates.map((c) => ({
                key: c.phrase,
                label: c.phrase,
                foundIn: c.foundIn,
                selected: picked.customQualifications.has(c.phrase),
                onToggle: () => toggle('customQualifications', c.phrase),
                badge: 'CUSTOM',
              }))}
            />
            <EmploymentSection
              candidates={suggestions.employment.candidates}
              picked={picked.employment}
              onToggle={(key) => toggle('employment', key)}
            />

            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {totalPicked} selected
              </p>
              <Button onClick={accept} disabled={totalPicked === 0 || pending}>
                <Plus className="mr-1.5 size-4" />
                Accept selected ({totalPicked})
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: Array<{
    key: string;
    label: string;
    foundIn: string;
    selected: boolean;
    onToggle: () => void;
    badge: string;
  }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground">{rows.length}</span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">{hint}</p>
      <ul className="divide-y rounded-md border bg-card">
        {rows.map((r) => (
          <li key={r.key}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={r.selected}
                onChange={r.onToggle}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{r.label}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {r.badge}
                  </Badge>
                  {r.selected && <CheckCircle2 className="size-3.5 text-status-success" />}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  <span className="text-muted-foreground/70">from CV:</span> "{r.foundIn}"
                </p>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmploymentSection({
  candidates,
  picked,
  onToggle,
}: {
  candidates: CvSuggestions['employment']['candidates'];
  picked: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Employment history
        </h3>
        <span className="text-[10px] text-muted-foreground">{candidates.length}</span>
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Parsed from the CV's Employment / Work Experience section. Dates are
        best-effort — edit them after accepting if the CV used an unusual format.
      </p>
      <ul className="divide-y rounded-md border bg-card">
        {candidates.map((c) => {
          const selected = picked.has(c.key);
          return (
            <li key={c.key}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={selected}
                  onChange={() => onToggle(c.key)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Briefcase className="size-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{c.employerName}</span>
                    {c.jobTitle && (
                      <span className="text-xs text-muted-foreground">
                        — {c.jobTitle}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[9px]">
                      EMPLOYMENT
                    </Badge>
                    {selected && (
                      <CheckCircle2 className="size-3.5 text-status-success" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {(c.startDate || c.endDate || c.isCurrent) && (
                      <span>
                        {formatMonth(c.startDate) ?? '?'}
                        {' — '}
                        {c.isCurrent ? 'Present' : (formatMonth(c.endDate) ?? '?')}
                      </span>
                    )}
                    {c.location && <span>· {c.location}</span>}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    <span className="text-muted-foreground/70">from CV:</span> "{c.foundIn}"
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatMonth(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(new Date(iso), 'MMM yyyy');
  } catch {
    return iso;
  }
}
