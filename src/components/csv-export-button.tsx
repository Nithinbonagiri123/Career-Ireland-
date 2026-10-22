import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Reusable "Download CSV" button pointing at a `/api/export/*` endpoint.
 * A plain anchor on purpose (perf — owner's navigation-lag fix): as a
 * next/link it was PREFETCHED whenever it entered the viewport, which
 * ran the entire CSV export query server-side on every list-page visit.
 * The browser handles the actual download natively either way.
 */
export function CsvExportButton({
  href,
  label = 'Download CSV',
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <a href={href} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}>
      <Download className="mr-1.5 size-3.5" />
      {label}
    </a>
  );
}
