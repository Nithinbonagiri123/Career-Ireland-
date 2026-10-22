'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { ExternalLink, Globe, MoreHorizontal, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CvPicker } from '@/components/cv-picker';
import { EmptyState } from '@/components/empty-state';
import { SectionHeader } from '@/components/section-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { statusTone } from '@/lib/ui/status-tone';
import {
  createExternalApplicationAction,
  updateApplicationStatusAction,
} from '@/modules/applications/actions';
import type { CandidateApplicationRow } from '@/modules/applications/service';
import { markApplicationPlacedAction } from '@/modules/placements/actions';

const SOURCE_LABEL = {
  INTERNAL: 'Internal',
  IRISH_JOBS: 'IrishJobs',
  INDEED: 'Indeed',
  JOBS_IRELAND: 'JobsIreland',
  LINKEDIN: 'LinkedIn',
  COMPANY_WEBSITE: 'Company site',
  REFERRAL: 'Referral',
  OTHER: 'Other',
} as const;

const EXTERNAL_SOURCES = [
  'IRISH_JOBS',
  'INDEED',
  'JOBS_IRELAND',
  'LINKEDIN',
  'COMPANY_WEBSITE',
  'REFERRAL',
  'OTHER',
] as const;

export type KnownEmployer = { id: string; legalName: string; tradingName: string | null };

function AddExternalDialog({
  personId,
  knownEmployers,
}: {
  personId: string;
  knownEmployers: KnownEmployer[];
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<(typeof EXTERNAL_SOURCES)[number]>('IRISH_JOBS');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [appliedAt, setAppliedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [cv, setCv] = useState<DocumentInstance | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setCompany('');
    setTitle('');
    setUrl('');
    setRef('');
    setAppliedAt('');
    setNotes('');
    setCv(null);
  };

  const submit = () => {
    startTransition(async () => {
      const r = await createExternalApplicationAction({
        personId,
        source,
        externalCompanyName: company,
        externalJobTitle: title,
        externalJobUrl: url,
        externalJobReference: ref,
        appliedAt,
        notes,
        cvDocumentInstanceId: cv?.id ?? '',
      });
      if (r.ok) {
        toast.success('External application recorded');
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="mr-1 size-3.5" /> Log external application
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log job board application</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="src">Source *</Label>
              <Select
                id="src"
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
              >
                {EXTERNAL_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="appliedAt">Applied on</Label>
              <Input
                id="appliedAt"
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="company">Company *</Label>
            <Input
              id="company"
              list="known-employers"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Type to search existing clients, or add a new company"
              required
              autoComplete="off"
            />
            {/* Native datalist — the input stays free-text (external
                boards may list employers you've never worked with) but
                existing clients auto-suggest as you type. Avoids the
                "lots of clients already on the list but I can't pick
                one" friction. */}
            <datalist id="known-employers">
              {knownEmployers.map((e) => {
                const label = e.tradingName ? `${e.legalName} (${e.tradingName})` : e.legalName;
                return (
                  <option key={e.id} value={e.legalName}>
                    {label}
                  </option>
                );
              })}
            </datalist>
            {knownEmployers.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {knownEmployers.length} existing client
                {knownEmployers.length === 1 ? '' : 's'} available — type to filter, or just enter a
                new name.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">Job title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Care Assistant"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="url">Job URL</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref">Job reference / ID</Label>
            <Input
              id="ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="From the job board"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>CV / Résumé (optional)</Label>
            <CvPicker personId={personId} value={cv} onChange={setCv} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || company.trim().length === 0}>
            Log application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApplicationsPanel({
  personId,
  rows,
  knownEmployers,
}: {
  personId: string;
  rows: CandidateApplicationRow[];
  knownEmployers: KnownEmployer[];
}) {
  return (
    <Card>
      <SectionHeader
        icon={Send}
        title="Applications"
        count={rows.length}
        action={<AddExternalDialog personId={personId} knownEmployers={knownEmployers} />}
      >
        Both internal (in-house requisitions) and external (IrishJobs, Indeed, JobsIreland).
      </SectionHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Send}
            title="No applications yet"
            description="Log applications this candidate has submitted — on your requisitions or on external boards."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {r.source === 'INTERNAL' && r.jobRequisitionId ? (
                      <Link
                        href={`/requisitions/${r.jobRequisitionId}`}
                        className="truncate font-medium hover:underline"
                      >
                        {r.requisitionTitle ?? 'Requisition'}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">
                        {r.externalJobTitle ?? r.displayCompany ?? 'External application'}
                      </span>
                    )}
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      <Globe className="mr-0.5 size-2.5" />
                      {SOURCE_LABEL[r.source]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.displayCompany ?? '—'}
                    {' · applied '}
                    <time dateTime={r.appliedAt.toISOString()} className="tabular-nums">
                      {formatDistanceToNow(r.appliedAt, { addSuffix: true })} ·{' '}
                      {format(r.appliedAt, 'dd MMM yyyy · HH:mm')}
                    </time>
                    {r.externalJobReference ? ` · ref ${r.externalJobReference}` : ''}
                  </p>
                  {r.externalJobUrl && (
                    <a
                      href={r.externalJobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      Open posting
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={statusTone(r.status)} className="rounded-full">
                    {r.status.replace(/_/g, ' ')}
                  </Badge>
                  {/* Stage C workflow collapse — advance the case right
                      here: only the legal next hops for this status, the
                      same transitions the Recruitment pipeline enforces
                      server-side. Placement runs the real Recruitment
                      workflow, which is what flips the derived "Placed". */}
                  {/* Placements exist only on OUR requisitions — the
                      Recruitment rule. External-board hires stay
                      ACCEPTED without a placement record. */}
                  {r.status === 'ACCEPTED' && r.jobRequisitionId && (
                    <RowAction
                      label="Record placement"
                      variant="default"
                      run={() => markApplicationPlacedAction(r.id)}
                      done="Placement recorded — candidate is now Placed"
                    />
                  )}
                  <StatusMenu row={r} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const NEXT_STATUS: Record<string, Array<CandidateApplicationRow['status']>> = {
  APPLIED: ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SHORTLISTED', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['WITHDRAWN'],
  REJECTED: ['WITHDRAWN'],
  WITHDRAWN: [],
};

function StatusMenu({ row }: { row: CandidateApplicationRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nexts = NEXT_STATUS[row.status] ?? [];
  if (nexts.length === 0) return null;
  const advance = (status: CandidateApplicationRow['status']) =>
    startTransition(async () => {
      const r = await updateApplicationStatusAction(
        { applicationId: row.id, status },
        row.jobRequisitionId ?? null,
      );
      if (r.ok) {
        toast.success(`Application moved to ${status.replace(/_/g, ' ').toLowerCase()}`);
        router.refresh();
      } else toast.error(r.error.message);
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Update application status"
        className="grid size-7 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {nexts.map((s) => (
          <DropdownMenuItem key={s} disabled={pending} onClick={() => advance(s)}>
            {s === 'REJECTED'
              ? 'Reject'
              : s === 'WITHDRAWN'
                ? 'Withdraw'
                : `Move to ${s.replace(/_/g, ' ').toLowerCase()}`}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowAction({
  label,
  run,
  done,
  variant,
}: {
  label: string;
  run: () => Promise<{ ok: true; data: unknown } | { ok: false; error: { message: string } }>;
  done: string;
  variant: 'default' | 'outline';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending}
      className="h-7 px-2.5 text-[11px]"
      onClick={() =>
        startTransition(async () => {
          const r = await run();
          if (r.ok) {
            toast.success(done);
            router.refresh();
          } else toast.error(r.error.message);
        })
      }
    >
      {pending ? '…' : label}
    </Button>
  );
}
