'use client';

import { AtSign, Eye, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  removeEmailAccountAction,
  revealPasswordAction,
  upsertEmailAccountAction,
} from '@/modules/email-accounts/actions';
import type { EmailAccountView } from '@/modules/email-accounts/service';

function AccountDialog({
  personId,
  existing,
}: {
  personId: string;
  existing: EmailAccountView | null;
}) {
  const [open, setOpen] = useState(false);
  type Provider = 'GMAIL' | 'OUTLOOK' | 'YAHOO' | 'CUSTOM';
  const [emailAddress, setEmailAddress] = useState(existing?.emailAddress ?? '');
  const [password, setPassword] = useState('');
  const [provider, setProvider] = useState<Provider>(existing?.provider ?? 'GMAIL');
  const [imapHost, setImapHost] = useState(existing?.imapHost ?? '');
  const [imapPort, setImapPort] = useState(existing?.imapPort?.toString() ?? '');
  const [smtpHost, setSmtpHost] = useState(existing?.smtpHost ?? '');
  const [smtpPort, setSmtpPort] = useState(existing?.smtpPort?.toString() ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [markShared, setMarkShared] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await upsertEmailAccountAction({
        personId,
        emailAddress,
        password,
        provider: provider as 'GMAIL' | 'OUTLOOK' | 'YAHOO' | 'CUSTOM',
        imapHost,
        imapPort: imapPort.trim().length === 0 ? null : Number(imapPort),
        imapSecure: true,
        smtpHost,
        smtpPort: smtpPort.trim().length === 0 ? null : Number(smtpPort),
        smtpSecure: true,
        notes,
        markSharedWithCandidate: markShared,
      });
      if (r.ok) {
        toast.success(existing ? 'Password rotated' : 'Account saved');
        setOpen(false);
        setPassword('');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant={existing ? 'outline' : 'default'}>
            {existing ? (
              <Pencil className="mr-1.5 size-3.5" />
            ) : (
              <Plus className="mr-1.5 size-3.5" />
            )}
            {existing ? 'Rotate password' : 'Add email account'}
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Rotate password / update settings' : 'Create candidate email account'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email address *</Label>
              <Input
                id="email"
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
              >
                <option value="GMAIL">Gmail</option>
                <option value="OUTLOOK">Outlook</option>
                <option value="YAHOO">Yahoo</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw">Password *</Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={existing ? 'Enter new password to rotate' : 'Set the shared password'}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Encrypted at rest with AES-256-GCM. Never logged.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="imap">IMAP host</Label>
              <Input id="imap" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imapp">IMAP port</Label>
              <Input
                id="imapp"
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="smtp">SMTP host</Label>
              <Input id="smtp" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="smtpp">SMTP port</Label>
              <Input
                id="smtpp"
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="shared"
              checked={markShared}
              onCheckedChange={(v) => setMarkShared(v === true)}
            />
            <Label htmlFor="shared" className="text-sm font-normal">
              Mark credentials as shared with candidate today
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !emailAddress || !password}>
            {existing ? 'Rotate' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealButton({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await revealPasswordAction({ personId, reason });
      if (r.ok) {
        setRevealed(r.data);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const close = () => {
    setOpen(false);
    setReason('');
    setRevealed(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Eye className="mr-1.5 size-3.5" /> Reveal password
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reveal candidate email password</DialogTitle>
        </DialogHeader>
        {revealed ? (
          <div className="space-y-3">
            <div className="rounded-md border border-status-warning/50 bg-status-warning-soft p-3 text-xs text-status-warning">
              This password will disappear when you close this dialog. This reveal is audited.
            </div>
            <div className="font-mono select-all break-all rounded-md border bg-muted px-3 py-2 text-sm">
              {revealed}
            </div>
            <p className="text-xs text-muted-foreground">
              Copy it to your password manager or the candidate handoff document, then close.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Reason is required and logged to the audit trail.
            </p>
            <div className="space-y-1">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Handing off account to candidate"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={pending}>
            {revealed ? 'Close' : 'Cancel'}
          </Button>
          {!revealed && (
            <Button onClick={submit} disabled={pending || reason.trim().length < 4}>
              Reveal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailAccountPanel({
  personId,
  account,
}: {
  personId: string;
  account: EmailAccountView | null;
}) {
  const [, startTransition] = useTransition();
  const remove = () => {
    if (!confirm('Delete this email account? The password is gone forever.')) return;
    startTransition(async () => {
      const r = await removeEmailAccountAction({ personId });
      if (r.ok) toast.success('Email account removed');
      else toast.error(r.error.message);
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <AtSign className="size-4" /> Candidate email account
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared inbox managed by both staff and the candidate. Password encrypted at rest.
          </p>
        </div>
        <div className="flex gap-2">
          {account && <RevealButton personId={personId} />}
          <AccountDialog personId={personId} existing={account} />
        </div>
      </CardHeader>
      <CardContent>
        {!account ? (
          <EmptyState
            icon={KeyRound}
            title="No email account on file"
            description="Add the Gmail / Outlook credentials used to apply for jobs on behalf of the candidate."
          />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div>
                <span className="text-muted-foreground">Address:</span>{' '}
                <span className="font-medium">{account.emailAddress}</span>
              </div>
              <Badge variant="secondary" className="rounded-full text-[10px]">
                {account.provider}
              </Badge>
              {account.sharedWithCandidateAt && (
                <Badge variant="outline" className="rounded-full text-[10px]">
                  Shared {new Date(account.sharedWithCandidateAt).toLocaleDateString()}
                </Badge>
              )}
              {account.lastRotatedAt && (
                <span className="text-[11px] text-muted-foreground">
                  Rotated {new Date(account.lastRotatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {(account.imapHost || account.smtpHost) && (
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs">
                {account.imapHost && (
                  <div>
                    <p className="uppercase tracking-wide text-muted-foreground">IMAP</p>
                    <p>
                      {account.imapHost}
                      {account.imapPort ? `:${account.imapPort}` : ''}
                    </p>
                  </div>
                )}
                {account.smtpHost && (
                  <div>
                    <p className="uppercase tracking-wide text-muted-foreground">SMTP</p>
                    <p>
                      {account.smtpHost}
                      {account.smtpPort ? `:${account.smtpPort}` : ''}
                    </p>
                  </div>
                )}
              </div>
            )}
            {account.notes && (
              <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                {account.notes}
              </p>
            )}
            <div className="pt-1">
              <Button size="sm" variant="ghost" onClick={remove}>
                <Trash2 className="mr-1.5 size-3.5" /> Delete account
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
