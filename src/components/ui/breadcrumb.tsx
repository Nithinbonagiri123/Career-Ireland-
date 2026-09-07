import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Breadcrumbs primitive — thin wrapper over `<nav>` + `<ol>` with a
 * chevron separator. Purposefully unopinionated so pages can slot in
 * any Link/Button they need. Design pattern references 21st.dev
 * "page-header-2" (@7ovr) — implemented with our lucide-react +
 * shadcn conventions rather than copied.
 */

export function Breadcrumb({
  className,
  ...props
}: ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center', className)}
      {...props}
    />
  );
}

export function BreadcrumbList({ className, ...props }: ComponentPropsWithoutRef<'ol'>) {
  return (
    <ol
      className={cn(
        'flex flex-wrap items-center gap-1 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: ComponentPropsWithoutRef<'li'>) {
  return <li className={cn('inline-flex items-center gap-1', className)} {...props} />;
}

export function BreadcrumbLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      aria-current="page"
      className={cn('font-medium text-foreground', className)}
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ className }: { className?: string }) {
  return <ChevronRight aria-hidden className={cn('size-3 text-muted-foreground/60', className)} />;
}
