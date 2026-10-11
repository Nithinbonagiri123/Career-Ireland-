import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Quiet, task-focused prompt that answers "what should I do next on this
 * record?". Rendered between the page header and the main content —
 * identity above, action below, hairline separating them.
 *
 * Design is deliberately restrained: no background fill, no coloured
 * border on the default tone, a single primary CTA, generous negative
 * space. The eyebrow label + verb-first sentence do the hierarchy work.
 * See docs/ux-redesign-audit.md §5 Q1 for the design decision.
 *
 * Only the "urgent" tone surfaces colour (muted amber), and only on the
 * eyebrow qualifier + CTA — the sentence itself stays neutral.
 */
export type NextActionCardProps = {
  label: string;
  dueHint: string | null;
  sentence: string;
  tone?: 'default' | 'urgent';
  primary: { label: string; href: string };
  className?: string;
};

export function NextActionCard({
  label,
  dueHint,
  sentence,
  tone = 'default',
  primary,
  className,
}: NextActionCardProps) {
  const isUrgent = tone === 'urgent';
  return (
    <section aria-label="Next step" className={cn('border-t border-border/60 py-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {label}
            {dueHint && (
              <>
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                <span
                  className={cn(
                    isUrgent ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                  )}
                >
                  {dueHint}
                </span>
              </>
            )}
          </p>
          <p className="mt-1.5 text-[15px] leading-snug text-foreground">{sentence}</p>
        </div>
        <Link
          href={primary.href}
          className={cn(
            buttonVariants({ variant: isUrgent ? 'default' : 'outline', size: 'sm' }),
            'shrink-0',
          )}
        >
          {primary.label}
          <ArrowRight className="ml-1 size-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
