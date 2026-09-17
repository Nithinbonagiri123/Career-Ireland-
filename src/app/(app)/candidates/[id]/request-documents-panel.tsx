'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { Ban, Copy, Loader2, Mail, MailWarning } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { statusTone } from '@/lib/ui/status-tone';
import {
  issueUploadRequestAction,
  revokeUploadRequestAction,
} from '@/modules/document-upload-requests/actions';
import type { UploadRequestListRow } from '@/modules/document-upload-requests/service';

/**
 * Staff-side control on the candidate profile. Issues a one-time email
 * with a magic upload link. Lists prior/active/completed/revoked
 * requests so staff can see history at a glance without opening audit.
 */
export function RequestDocumentsPanel({
  personId,
  personEmail,
  missingRequirementCount,
  requests,
}: {
  personId: string;
  personEmail: string | null;
  missingRequirementCount: number;
  requests: UploadRequestListRow[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [emailWarn, setEmailWarn] = useState(false);
  const [pending, startTransition] = useTransition();

  const canIssue = Boolean(personEmail) && missingRequirementCount > 0;
  const disabledReason = !personEmail
    ? 'Add an email to the candidate first.'
    : missingRequirementCount === 0
      ? 'Nothing to request — every requirement is already provided.'
      : null;

  const activeRequest = requests.find(
    (r) => !r.completedAt && !r.revokedAt && r.expiresAt.getTime() > Date.now(),
  );

  const doIssue = () => {
    startTransition(async () => {
      const r = await issueUploadRequestAction({ personId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setFreshUrl(r.data.uploadUrl);
      setEmailWarn(!r.data.emailSent);
      if (r.data.emailSent) {
        toast.success(`Email sent to ${personEmail}`);
      } else {
        toast.warning('Link created — email delivery failed, share the URL manually.');
      }
    });
  };

  const doRevoke = (id: string) => {
    startTransition(async () => {
      const r = await revokeUploadRequestAction({ requestId: id, personId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success('Link revoked');
    });
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — select the URL manually');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Request documents by email</p>
          <p className="text-xs text-muted-foreground">
            {missingRequirementCount === 0
              ? 'Nothing missing.'
              : `${missingRequirementCount} document${missingRequirementCount === 1 ? '' : 's'} still to collect.`}
            {personEmail ? ` The candidate gets a one-time upload link at ${personEmail}.` : ''}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={!canIssue || pending || Boolean(activeRequest)}
          title={
            activeRequest
              ? 'An active link already exists — revoke it below first.'
              : disabledReason ?? undefined
          }
        >
          <Mail className="mr-1.5 size-4" />
          {activeRequest ? 'Link already active' : 'Send upload link'}
        </Button>
      </div>

      {freshUrl && (
        <div className="rounded-md border border-status-info/40 bg-status-info-soft px-3 py-2 text-xs">
          <div className="flex items-start gap-2">
            {emailWarn ? (
              <MailWarning className="mt-0.5 size-4 shrink-0 text-status-warning" />
            ) : (
              <Mail className="mt-0.5 size-4 shrink-0 text-status-info" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {emailWarn
                  ? 'Email delivery failed. Share this URL manually:'
                  : 'Link sent. If they lose the email, share this URL again:'}
              </p>
              <p className="mt-1 truncate font-mono text-[11px] text-slate-700">{freshUrl}</p>
            </div>
            <button
              type="button"
              className="ml-2 inline-flex items-center gap-1 rounded border bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50"
              onClick={() => copy(freshUrl)}
            >
              <Copy className="size-3" /> Copy
            </button>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Link history
          </p>
          <ul className="divide-y rounded-md border bg-card text-sm">
            {requests.map((r) => {
              const label: string = r.revokedAt
                ? 'REVOKED'
                : r.completedAt
                  ? 'COMPLETED'
                  : r.expiresAt.getTime() < Date.now()
                    ? 'EXPIRED'
                    : 'ACTIVE';
              const eventDate = r.revokedAt ?? r.completedAt ?? r.expiresAt;
              const eventLabel = r.revokedAt
                ? 'Revoked'
                : r.completedAt
                  ? 'Uploaded'
                  : r.expiresAt.getTime() < Date.now()
                    ? 'Expired'
                    : 'Expires';
              return (
                <li key={r.id} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusTone(label)}>{label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {r.requestedCount} document{r.requestedCount === 1 ? '' : 's'} requested
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {eventLabel}{' '}
                      <time
                        dateTime={eventDate.toISOString()}
                        className="tabular-nums text-foreground"
                      >
                        {format(eventDate, "dd MMM yyyy · HH:mm")}
                      </time>{' '}
                      · sent{' '}
                      <time
                        dateTime={r.createdAt.toISOString()}
                        className="tabular-nums"
                      >
                        {formatDistanceToNow(r.createdAt, { addSuffix: true })} ·{' '}
                        {format(r.createdAt, "dd MMM yyyy · HH:mm")}
                      </time>
                    </p>
                  </div>
                  {label === 'ACTIVE' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => doRevoke(r.id)}
                    >
                      <Ban className="mr-1 size-3.5" /> Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (o) setFreshUrl(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send upload link?</DialogTitle>
            <DialogDescription>
              We'll email a one-time link to <strong>{personEmail}</strong>. The candidate can
              upload {missingRequirementCount} missing document
              {missingRequirementCount === 1 ? '' : 's'} without needing to sign in. The link
              expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              disabled={pending}
              onClick={() => {
                setConfirmOpen(false);
                doIssue();
              }}
            >
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
