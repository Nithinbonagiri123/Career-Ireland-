'use client';

import { Files, FileText, Receipt as ReceiptIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SEG_TRAY, segItem } from '@/components/ds/segmented';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'ALL', label: 'All', icon: Files },
  { value: 'UPLOADED', label: 'Uploaded', icon: FileText },
  { value: 'INVOICE', label: 'Invoices', icon: FileText },
  { value: 'RECEIPT', label: 'Receipts', icon: ReceiptIcon },
] as const;

/**
 * Kind filter — the Stage 6G segmented tray (white tray, navy active).
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
    <fieldset className={cn(SEG_TRAY, 'm-0')}>
      <legend className="sr-only">Document kind</legend>
      {OPTIONS.map((opt) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => set(opt.value)}
            className={segItem(isActive)}
            aria-pressed={isActive}
          >
            <opt.icon className="size-3.5" aria-hidden />
            {opt.label}
          </button>
        );
      })}
    </fieldset>
  );
}
