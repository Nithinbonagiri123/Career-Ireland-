'use client';

import { ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { NextActionBanner } from '@/components/ds/workspace';
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
  // Stage 6G — the shared NextActionBanner (same as Recruitment); the
  // action button keeps its three behaviours (link / dialog / disabled).
  return (
    <NextActionBanner
      label={action.label}
      dueHint={action.dueHint}
      sentence={action.sentence}
      tone={action.tone}
      action={renderButton(action.primary, action.tone, onOpenDialog)}
    />
  );
}

function renderButton(
  primary: ClientNextAction['primary'],
  tone: ClientNextAction['tone'],
  onOpenDialog: (dialog: ClientDialog) => void,
) {
  const variant = tone === 'urgent' ? 'default' : 'outline';
  if (primary.kind === 'link') {
    return (
      <Link href={primary.href} className={cn(buttonVariants({ variant, size: 'sm' }))}>
        {primary.label}
        <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
      </Link>
    );
  }
  if (primary.kind === 'dialog') {
    return (
      <Button size="sm" variant={variant} onClick={() => onOpenDialog(primary.dialog)}>
        {primary.label}
        <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled title={primary.reason}>
      <Lock className="mr-1 h-3.5 w-3.5" aria-hidden />
      {primary.label}
    </Button>
  );
}
