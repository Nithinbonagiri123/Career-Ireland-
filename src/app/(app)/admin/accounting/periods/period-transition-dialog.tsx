'use client';

import { Lock, LockOpen, ShieldCheck, StepForward } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PromptDialog } from '@/components/prompt-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { transitionPeriodAction } from '@/modules/accounting/period-actions';

type Status = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED' | 'LOCKED';

const ALLOWED: Record<Status, Status[]> = {
  OPEN: ['SOFT_CLOSED'],
  SOFT_CLOSED: ['CLOSED', 'OPEN'],
  CLOSED: ['LOCKED', 'OPEN'],
  LOCKED: ['OPEN'],
};

const COPY: Record<
  Status,
  {
    label: string;
    description: string;
    confirmLabel: string;
    placeholder: string;
    destructive: boolean;
  }
> = {
  OPEN: {
    label: 'Reopen period',
    description:
      'Return the period to OPEN so new postings and reversals can land in it again. Reopening a LOCKED period is ADMIN-only; the reason you give here will be in the audit log forever.',
    confirmLabel: 'Reopen',
    placeholder: 'e.g. Found a mis-posted invoice from last month',
    destructive: true,
  },
  SOFT_CLOSED: {
    label: 'Soft close',
    description:
      'Period owner signs off. New postings are rejected from now on. Reversals continue to land in the current OPEN period, not this one. Reversible.',
    confirmLabel: 'Soft close',
    placeholder: 'e.g. Monthly review complete',
    destructive: false,
  },
  CLOSED: {
    label: 'Close period',
    description:
      'Statutory close — finance has reviewed and the numbers are final. Still reopenable by ADMIN + FINANCE. Reversals route to the current open period.',
    confirmLabel: 'Close',
    placeholder: 'e.g. Statutory close for monthly reporting',
    destructive: false,
  },
  LOCKED: {
    label: 'Lock period',
    description:
      'Auditor seal — the strongest state. Only ADMIN can lock, and only ADMIN can reopen afterwards. Use when returns have been filed and the books must not move.',
    confirmLabel: 'Lock',
    placeholder: 'e.g. VAT return submitted, period sealed',
    destructive: true,
  },
};

const ICON: Record<Status, typeof StepForward> = {
  OPEN: LockOpen,
  SOFT_CLOSED: StepForward,
  CLOSED: ShieldCheck,
  LOCKED: Lock,
};

export function PeriodTransitionMenu({
  periodId,
  currentStatus,
  periodLabel,
}: {
  periodId: string;
  currentStatus: Status;
  periodLabel: string;
}) {
  const [target, setTarget] = useState<Status | null>(null);
  const [pending, startTransition] = useTransition();

  const transitions = ALLOWED[currentStatus];
  if (transitions.length === 0) {
    return (
      <Button variant="ghost" size="sm" disabled>
        No actions
      </Button>
    );
  }

  const onConfirm = (reason: string) => {
    if (!target) return;
    startTransition(async () => {
      const r = await transitionPeriodAction({ periodId, to: target, reason });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`${periodLabel} → ${target}`);
      setTarget(null);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm">
              Transition
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {transitions.map((t, i) => {
            const Icon = ICON[t];
            return (
              <div key={t}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant={COPY[t].destructive ? 'destructive' : undefined}
                  onSelect={() => setTarget(t)}
                >
                  <Icon className="mr-2 size-3.5" /> {COPY[t].label}
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {target && (
        <PromptDialog
          open={target !== null}
          onCancel={() => setTarget(null)}
          onConfirm={onConfirm}
          title={`${COPY[target].label} — ${periodLabel}?`}
          description={COPY[target].description}
          label="Reason (audited)"
          placeholder={COPY[target].placeholder}
          confirmLabel={COPY[target].confirmLabel}
          confirmVariant={COPY[target].destructive ? 'destructive' : 'default'}
          pending={pending}
        />
      )}
    </>
  );
}
