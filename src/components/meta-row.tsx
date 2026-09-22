import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A single "icon + label" line used inside every card's meta block
 * (salary / location / positions filled / target date / etc.).
 *
 * Every card was hand-rolling `<li className="flex items-center
 * gap-1.5 text-xs text-muted-foreground">` with its own icon sizing
 * and truncation — this is that row, once.
 */
export function MetaRow({
  icon,
  children,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      {icon && <span className="shrink-0 [&_svg]:size-3.5">{icon}</span>}
      <span className="truncate">{children}</span>
    </li>
  );
}

/** Optional wrapper so callers can render a stack without importing `<ul>` twice. */
export function MetaList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={cn('space-y-1', className)}>{children}</ul>;
}
