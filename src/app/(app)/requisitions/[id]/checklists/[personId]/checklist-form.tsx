'use client';

import { Save, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ChecklistAnswer, WorkPermitChecklist } from '@/lib/db/schema/work_permit_checklists';
import { cn } from '@/lib/utils';
import {
  deleteChecklistAction,
  upsertChecklistAction,
} from '@/modules/work-permit-checklists/actions';
import {
  ADVERT_INFO_FIELDS,
  DOC_CHECK_FIELDS,
  MATCH_CHECK_FIELDS,
} from '@/modules/work-permit-checklists/schemas';

type AnswerMap = Record<string, ChecklistAnswer>;

const ANSWER_OPTIONS: Array<ChecklistAnswer['value']> = [null, 'YES', 'NO', 'NA'];

/**
 * Big form for the Work Permit Checklist. Mirrors Tracey's PDF section
 * by section:
 *   1. Header — candidate identity (readonly, from the person row).
 *   2. Contract dates.
 *   3. Requirement Match — advert vs contract comparison.
 *   4. Advert Info — verifying the advert has all required fields.
 *   5. Documents Upload Check — one row per required doc type.
 *   6. Free-text notes.
 *
 * State is local; save is a single upsert that overwrites the whole
 * jsonb payload. Delete removes the whole row.
 */
export function ChecklistForm({
  requisitionId,
  personId,
  personName,
  personEmail,
  personPhone,
  initial,
}: {
  requisitionId: string;
  personId: string;
  personName: string;
  personEmail: string;
  personPhone: string;
  initial: WorkPermitChecklist | null;
}) {
  const [contractSignedOn, setContractSignedOn] = useState(
    initial?.contractSignedOn ? String(initial.contractSignedOn) : '',
  );
  const [commencementDate, setCommencementDate] = useState(
    initial?.commencementDate ? String(initial.commencementDate) : '',
  );
  const [matchChecks, setMatchChecks] = useState<AnswerMap>(
    (initial?.matchChecks as AnswerMap) ?? {},
  );
  const [advertChecks, setAdvertChecks] = useState<AnswerMap>(
    (initial?.advertInfoChecks as AnswerMap) ?? {},
  );
  const [docChecks, setDocChecks] = useState<AnswerMap>(
    (initial?.documentsChecks as AnswerMap) ?? {},
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const r = await upsertChecklistAction({
        jobRequisitionId: requisitionId,
        personId,
        contractSignedOn,
        commencementDate,
        matchChecks,
        advertInfoChecks: advertChecks,
        documentsChecks: docChecks,
        notes,
      });
      if (r.ok) {
        toast.success('Checklist saved');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const remove = () => {
    if (!initial) return;
    if (!confirm('Delete this checklist? The audit trail is preserved.')) return;
    startTransition(async () => {
      const r = await deleteChecklistAction({
        id: initial.id,
        jobRequisitionId: requisitionId,
      });
      if (r.ok) {
        toast.success('Checklist deleted');
        window.location.href = `/requisitions/${requisitionId}`;
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidate</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ReadonlyField label="Name" value={personName} />
          <ReadonlyField label="Email" value={personEmail || '—'} />
          <ReadonlyField label="Telephone" value={personPhone || '—'} />
        </CardContent>
      </Card>

      {/* ── Contract dates ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contract</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="signed">Date contract signed</Label>
            <Input
              id="signed"
              type="date"
              value={contractSignedOn}
              onChange={(e) => setContractSignedOn(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commence">Commencement date</Label>
            <Input
              id="commence"
              type="date"
              value={commencementDate}
              onChange={(e) => setCommencementDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Requirement Match ─────────────────────────────────── */}
      <ChecklistCard
        title="Requirement Match"
        subtitle="Does the contract offered match what was advertised?"
        fields={MATCH_CHECK_FIELDS}
        answers={matchChecks}
        onChange={setMatchChecks}
      />

      {/* ── Advert Info ───────────────────────────────────────── */}
      <ChecklistCard
        title="Advert Info verified"
        subtitle="Is all this information on the advert?"
        fields={ADVERT_INFO_FIELDS}
        answers={advertChecks}
        onChange={setAdvertChecks}
      />

      {/* ── Documents Check ───────────────────────────────────── */}
      <ChecklistCard
        title="Documents to Upload — Check"
        subtitle="Have these documents been collected from the candidate?"
        fields={DOC_CHECK_FIELDS}
        answers={docChecks}
        onChange={setDocChecks}
      />

      {/* ── Notes ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-32"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else worth recording — special conditions, missing paperwork, etc."
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        {initial ? (
          <Button variant="destructive" onClick={remove} disabled={pending}>
            <Trash2 className="mr-1.5 size-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={pending}>
          <Save className="mr-1.5 size-4" /> Save checklist
        </Button>
      </div>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="h-9 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">{value}</div>
    </div>
  );
}

/**
 * Reusable card for a section of yes/no/na + note checks. Each row is a
 * label, a segmented Yes/No/N/A picker, and an inline note input.
 */
function ChecklistCard({
  title,
  subtitle,
  fields,
  answers,
  onChange,
}: {
  title: string;
  subtitle: string;
  fields: readonly { key: string; label: string }[];
  answers: AnswerMap;
  onChange: (v: AnswerMap) => void;
}) {
  const setValue = (key: string, value: ChecklistAnswer['value']) => {
    onChange({ ...answers, [key]: { ...(answers[key] ?? { value: null }), value } });
  };
  const setNote = (key: string, note: string) => {
    onChange({ ...answers, [key]: { ...(answers[key] ?? { value: null }), note } });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {fields.map((f) => {
            const a: ChecklistAnswer = answers[f.key] ?? { value: null };
            return (
              <li key={f.key} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_180px_1fr]">
                <span className="text-sm">{f.label}</span>
                <div
                  className="inline-flex overflow-hidden rounded-md border"
                  role="radiogroup"
                  aria-label={f.label}
                >
                  {ANSWER_OPTIONS.map((opt) => (
                    // biome-ignore lint/a11y/useSemanticElements: styled toggle group — <input type="radio"> would break the yes/no/na custom colouring per option
                    <button
                      key={String(opt)}
                      type="button"
                      role="radio"
                      aria-checked={a.value === opt}
                      onClick={() => setValue(f.key, opt)}
                      className={cn(
                        'px-2 py-1 text-xs transition-colors',
                        a.value === opt
                          ? opt === 'YES'
                            ? 'bg-status-success-soft text-status-success'
                            : opt === 'NO'
                              ? 'bg-status-danger-soft text-status-danger'
                              : opt === 'NA'
                                ? 'bg-status-neutral-soft text-status-neutral'
                                : 'bg-muted'
                          : 'hover:bg-muted',
                      )}
                    >
                      {opt ?? '—'}
                    </button>
                  ))}
                </div>
                <Input
                  value={a.note ?? ''}
                  onChange={(e) => setNote(f.key, e.target.value)}
                  placeholder="Note (optional)"
                  className="text-xs"
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
