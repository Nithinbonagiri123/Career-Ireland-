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
  // Stage 6G — compact bar with a coloured left stripe matching the
  // tone so the operator catches the urgency at a glance without the
  // badge pill competing with the primary status in the hero above.
  const stripeCls =
    action.tone === 'urgent'
      ? 'bg-status-danger'
      : action.tone === 'muted'
        ? 'bg-muted-foreground/40'
        : 'bg-primary';
  const bgCls =
    action.tone === 'urgent'
      ? 'bg-status-danger-soft/40'
      : action.tone === 'muted'
        ? 'bg-muted/30'
        : 'bg-background';
  const eyebrowCls =
    action.tone === 'urgent'
      ? 'text-status-danger'
      : action.tone === 'muted'
        ? 'text-muted-foreground'
        : 'text-primary';
  return (
    <div className={cn('relative overflow-hidden rounded-lg border py-3 pl-5 pr-4', bgCls)}>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', stripeCls)} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <span
            className={cn('mr-2 text-[10px] font-semibold uppercase tracking-wider', eyebrowCls)}
          >
            {action.label}
          </span>
          {action.dueHint && (
            <span className="mr-2 rounded-full bg-status-danger px-1.5 py-0.5 text-[9px] uppercase text-status-danger-foreground">
              {action.dueHint}
            </span>
          )}
          <span className="text-sm text-foreground">{action.sentence}</span>
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
