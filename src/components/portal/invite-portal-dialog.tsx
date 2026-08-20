'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Check, Copy, Loader2, Send } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteCandidateAction, inviteEmployerAction } from '@/modules/portal/actions';

const FormSchema = z.object({
  email: z.string().email('Enter a valid email').max(200),
  fullName: z.string().min(2, 'Full name is required').max(200),
});

type InviteResult = { url: string; expiresAt: string } | null;

type Props = {
  trigger: ReactElement;
  target: { kind: 'CANDIDATE'; personId: string } | { kind: 'EMPLOYER'; employerId: string };
  defaultEmail?: string;
  defaultFullName?: string;
};

export function InvitePortalDialog({ trigger, target, defaultEmail, defaultFullName }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: defaultEmail ?? '', fullName: defaultFullName ?? '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const action =
      target.kind === 'CANDIDATE'
        ? inviteCandidateAction({ personId: target.personId, ...data })
        : inviteEmployerAction({ employerId: target.employerId, ...data });
    const r = await action;
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setResult({
      url: `${origin}/portal/invite/${r.data.token}`,
      expiresAt: r.data.expiresAt.toISOString(),
    });
  });

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the link and copy manually');
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      setFormError(null);
      setResult(null);
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target.kind === 'CANDIDATE'
              ? 'Invite candidate to portal'
              : 'Invite employer to portal'}
          </DialogTitle>
          <DialogDescription>
            Generates a one-time link (valid 72 hours). Send it via any channel you already use —
            email transport can be automated later.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm">
              Invitation created. Send this link to the recipient. It expires{' '}
              <span className="font-medium">{new Date(result.expiresAt).toLocaleString()}</span>.
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
              <input
                readOnly
                value={result.url}
                className="w-full truncate bg-transparent px-2 text-xs font-mono outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button">Done</Button>} />
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="ip-email">Email</Label>
              <Input
                id="ip-email"
                type="email"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-name">Full name</Label>
              <Input
                id="ip-name"
                aria-invalid={Boolean(errors.fullName)}
                {...register('fullName')}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>
            {formError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{formError}</span>
              </motion.div>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                <Send className="mr-1.5 size-4" />
                Generate invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
