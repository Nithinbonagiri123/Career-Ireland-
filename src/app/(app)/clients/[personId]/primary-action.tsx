'use client';

import { ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ClientDialog, ClientNextAction } from '@/modules/clients/next-action';

/**
 * Renders the resolver's single primary action. Three branches:
 *   - link    → plain anchor to a URL (quote draft, invoice detail, etc)
 *   - dialog  → opens the named inline dialog via the onOpenDialog callback
 *               (only `activate-candidate` is wired inline today; other
 *               flows live on the pro-forma detail page via `link`)
 *   - disabled → shows a muted button with the reason as the hover title
 *
 * The eyebrow label + sentence are always rendered; only the button swaps
 * based on action.kind. Keeping this split here (not in the resolver) lets
 * the resolver stay side-effect free + testable.
 */
export function ClientPrimaryAction({
  action,
  onOpenDialog,
}: {
  action: ClientNextAction;
  onOpenDialog: (dialog: ClientDialog) => void;
}) {
  const toneCls =
    action.tone === 'urgent'
      ? 'border-status-danger/30 bg-status-danger-soft'
      : action.tone === 'muted'
        ? 'border-border bg-muted/30'
        : 'border-border bg-background';
  const eyebrowCls =
    action.tone === 'urgent'
      ? 'text-status-danger'
      : action.tone === 'muted'
        ? 'text-muted-foreground'
        : 'text-foreground';
  return (
    <div className={cn('rounded-lg border p-4 sm:p-5', toneCls)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className={cn('text-[10px] font-medium uppercase tracking-wider', eyebrowCls)}>
            {action.label}
            {action.dueHint && (
              <span className="ml-2 rounded-full bg-status-danger px-1.5 py-0.5 text-[9px] uppercase text-status-danger-foreground">
                {action.dueHint}
              </span>
            )}
          </div>
          <div className="text-sm font-medium">{action.sentence}</div>
        </div>
        <div className="shrink-0">{renderButton(action.primary, onOpenDialog)}</div>
      </div>
    </div>
  );
}

function renderButton(
  primary: ClientNextAction['primary'],
  onOpenDialog: (dialog: ClientDialog) => void,
) {
  if (primary.kind === 'link') {
    return (
      <Link href={primary.href} className={cn(buttonVariants({ variant: 'default', size: 'sm' }))}>
        {primary.label}
        <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Link>
    );
  }
  if (primary.kind === 'dialog') {
    return (
      <Button size="sm" onClick={() => onOpenDialog(primary.dialog)}>
        {primary.label}
        <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled title={primary.reason}>
      <Lock className="mr-1 h-3.5 w-3.5" />
      {primary.label}
    </Button>
  );
}
