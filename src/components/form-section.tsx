import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Groups a stretch of form fields under a labelled section so a long
 * dialog reads as a short stack of concerns instead of one long scroll.
 * Audit §18.
 *
 * - Non-collapsible (default): plain <section>. Use for the always-open
 *   core section — "Basic info", "Role", "Case".
 * - Collapsible: native <details> + <summary>, no JS state. The chevron
 *   rotates on open. Semantically correct and keyboard-navigable without
 *   bolting on ARIA by hand.
 */
export function FormSection({
  title,
  description,
  collapsible = false,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!collapsible) {
    return (
      <section className={cn('space-y-3', className)}>
        <Eyebrow title={title} description={description} />
        <div className="space-y-3">{children}</div>
      </section>
    );
  }

  return (
    <details className={cn('group/section space-y-3', className)} open={defaultOpen}>
      <summary className="list-none cursor-pointer select-none">
        <div className="flex items-start justify-between gap-3">
          <Eyebrow title={title} description={description} />
          <ChevronRight
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/section:rotate-90"
            aria-hidden
          />
        </div>
      </summary>
      <div className="space-y-3 pt-1">{children}</div>
    </details>
  );
}

function Eyebrow({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/75">
        {title}
      </p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
