'use client';

import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Globe, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CvPicker } from '@/components/cv-picker';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import { createExternalApplicationAction } from '@/modules/applications/actions';
import type { CandidateApplicationRow } from '@/modules/applications/service';

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

const STATUS_VARIANT: Record<
  CandidateApplicationRow['status'],
  'default' | 'secondary' | 'outline'
> = {
  APPLIED: 'secondary',
  UNDER_REVIEW: 'secondary',
  SHORTLISTED: 'default',
  INTERVIEW: 'default',
  OFFER: 'default',
  ACCEPTED: 'default',
  REJECTED: 'outline',
  WITHDRAWN: 'outline',
};

function AddExternalDialog({ personId }: { personId: string }) {
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="src">Source *</Label>
              <select
                id="src"
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
              >
                {EXTERNAL_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
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
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Dublin Health Group"
              required
            />
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
}: {
  personId: string;
  rows: CandidateApplicationRow[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="size-4" /> Applications
            <Badge variant="secondary" className="ml-1 rounded-full">
              {rows.length}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Both internal (Ireland Career Gateway requisitions) and external (IrishJobs, Indeed,
            JobsIreland).
          </p>
        </div>
        <AddExternalDialog personId={personId} />
      </CardHeader>
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
                    <Link
                      href={`/applications/${r.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {r.source === 'INTERNAL'
                        ? (r.requisitionTitle ?? 'Requisition')
                        : (r.externalJobTitle ?? r.displayCompany ?? 'External application')}
                    </Link>
                    <Badge variant="outline" className="rounded-full text-[10px]">
                      <Globe className="mr-0.5 size-2.5" />
                      {SOURCE_LABEL[r.source]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.displayCompany ?? '—'}
                    {' · applied '}
                    {formatDistanceToNow(r.appliedAt, { addSuffix: true })}
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
                <Badge variant={STATUS_VARIANT[r.status]} className="rounded-full">
                  {r.status.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
