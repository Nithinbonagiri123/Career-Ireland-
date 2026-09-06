import { ArrowRight, CheckCircle2, FileText, Receipt } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Rendered above the candidate detail when the user has just come from
 * successfully finalising the onboarding form (`?just_created=1`). Quick
 * links to the freshly generated invoice + receipt so staff can print or
 * hand them straight to the candidate. Dismisses on any navigation because
 * the query string doesn't survive normal in-app clicks.
 */
export function JustCreatedCard({
  personId,
  invoiceNumber,
  receiptNumber,
}: {
  personId: string;
  invoiceNumber: string | null;
  receiptNumber: string | null;
}) {
  return (
    <Card className="mb-6 border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-500/5">
      <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold">Candidate created</p>
            <p className="text-xs text-muted-foreground">
              The profile, payment, invoice, and receipt were all recorded. Print or share the docs
              below.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {invoiceNumber && (
            <Link
              href={`/candidates/${personId}/invoices/${invoiceNumber}`}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <FileText className="mr-1.5 size-4" />
              View invoice
              <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          )}
          {receiptNumber && (
            <Link
              href={`/candidates/${personId}/receipts/${receiptNumber}`}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Receipt className="mr-1.5 size-4" />
              View receipt
              <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
