import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
        /* Semantic status variants. Match the enum-to-status map:
           success: DONE, PAID, ACCEPTED, ACTIVE, AVAILABLE
           info:    IN_PROGRESS, PLACED, ISSUED, SHORTLISTED, PROVIDED
           warning: TEMPORARILY_UNAVAILABLE, PARTIALLY_FILLED, DRAFT, PENDING
           danger:  REJECTED, CANCELLED, VOIDED, FAILED
           neutral: ARCHIVED, CLOSED, MERGED, unknown */
        success:
          'bg-status-success-soft text-status-success ring-1 ring-inset ring-status-success/20',
        info: 'bg-status-info-soft text-status-info ring-1 ring-inset ring-status-info/20',
        warning:
          'bg-status-warning-soft text-status-warning ring-1 ring-inset ring-status-warning/20',
        danger:
          'bg-status-danger-soft text-status-danger ring-1 ring-inset ring-status-danger/20',
        neutral:
          'bg-status-neutral-soft text-status-neutral ring-1 ring-inset ring-status-neutral/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
