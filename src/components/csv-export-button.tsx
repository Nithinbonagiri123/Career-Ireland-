import { Download } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Reusable "Download CSV" button pointing at a `/api/export/*` endpoint.
 * Rendered as an anchor so the browser handles the file download natively.
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
    <Link href={href} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}>
      <Download className="mr-1.5 size-3.5" />
      {label}
    </Link>
  );
}
