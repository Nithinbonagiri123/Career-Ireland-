'use client';

import { Files, FileText, Receipt as ReceiptIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'ALL', label: 'All', icon: Files },
  { value: 'UPLOADED', label: 'Uploaded', icon: FileText },
  { value: 'INVOICE', label: 'Invoices', icon: FileText },
  { value: 'RECEIPT', label: 'Receipts', icon: ReceiptIcon },
] as const;

/**
 * Kind segmented pill — mirrors the leads/candidates chrome pattern.
 * Drives the `?kind=` query param; server component re-fetches on change.
 */
export function KindFilter() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const active = (params.get('kind') ?? 'ALL').toUpperCase();

  const set = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'ALL') next.delete('kind');
    else next.set('kind', v);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-full border bg-muted/40 p-1">
      {OPTIONS.map((opt) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => set(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={isActive}
          >
            <opt.icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
