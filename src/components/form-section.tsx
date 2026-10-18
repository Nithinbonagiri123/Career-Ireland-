import { ChevronRight } from 'lucide-react';
import type * as React from 'react';
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
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

/* ── Stage 6G Screen 02 pattern ──────────────────────────────────────────
 *
 * Shared chrome for the approved mockup's dialog layout: tinted section
 * cards (sky person / amber briefcase / teal globe) with an icon
 * medallion header, and labelled fields with inline validation. Used by
 * the Create Lead dialog and the Edit details dialog so both read as
 * the same surface. Distinct from the eyebrow FormSection above, which
 * the other (non-Candidate-Services) dialogs still use.
 */

export const SECTION_TONE_CLASSES = {
  blue: {
    card: 'bg-sky-50/50 ring-sky-200/70',
    icon: 'bg-sky-100 text-sky-700',
  },
  amber: {
    card: 'bg-amber-50/50 ring-amber-200/70',
    icon: 'bg-amber-100 text-amber-700',
  },
  teal: {
    card: 'bg-teal-50/50 ring-teal-200/70',
    icon: 'bg-teal-100 text-teal-700',
  },
} as const;

export type IconTone = keyof typeof SECTION_TONE_CLASSES;

export function TintedFormSection({
  icon: Icon,
  iconTone,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  iconTone: IconTone;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const tone = SECTION_TONE_CLASSES[iconTone];
  return (
    <section className={`rounded-2xl p-5 ring-1 sm:p-6 ${tone.card}`}>
      <header className="mb-5 flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${tone.icon}`}
          aria-hidden
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-base font-semibold leading-tight text-foreground">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-foreground/80">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Scoped input sizing for the Screen 02 dialog pattern — forces every
 * shadcn input/select inside the form to the mockup's taller h-10
 * proportions without touching each field.
 */
export const FORM_INPUT_SIZING =
  '[&_[data-slot=input]]:h-10 [&_[data-slot=input]]:bg-background [&_[data-slot=input]]:px-3 [&_[data-slot=input]]:text-sm [&_[data-slot=select]]:h-10 [&_[data-slot=select]]:bg-background [&_[data-slot=select]]:px-3 [&_[data-slot=select]]:text-sm';
