import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Sticky-note surface — the visual DNA of the app's warmer surfaces.
 * Tinted background + ink text drawn from the semantic note tokens
 * (yellow / blue / pink / green / purple / neutral). Use for:
 *
 *   - dashboard widget cards where the tone signals category
 *   - timeline entries (colour by event type)
 *   - pipeline board cards (colour by stage)
 *   - contextual reminders and empty-state prompts
 *
 * Do NOT use for primary data tables, forms, or invoices — those
 * stay on the neutral card surface for readability.
 *
 * All colour choices route through CSS tokens (`--note-{tone}` +
 * `--note-{tone}-ink`) so dark mode + palette drift stay coherent.
 */
export type NoteTone = 'yellow' | 'blue' | 'pink' | 'green' | 'purple' | 'neutral';

const TONE_CLASS: Record<NoteTone, string> = {
  yellow: 'bg-note-yellow text-note-yellow-ink',
  blue: 'bg-note-blue text-note-blue-ink',
  pink: 'bg-note-pink text-note-pink-ink',
  green: 'bg-note-green text-note-green-ink',
  purple: 'bg-note-purple text-note-purple-ink',
  neutral: 'bg-note-neutral text-note-neutral-ink',
};

export function Note({
  tone = 'yellow',
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  tone?: NoteTone;
  as?: 'div' | 'article' | 'section' | 'li';
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  return (
    <Tag
      className={cn(
        'rounded-2xl shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md',
        TONE_CLASS[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
