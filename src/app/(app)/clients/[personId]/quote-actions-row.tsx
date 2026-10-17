'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  CancelProFormaButton,
  IssueProFormaButton,
  RecordAcceptanceButton,
  RejectProFormaButton,
} from '@/app/(app)/leads/[id]/pro-formas/pro-forma-actions';
import { ProFormaComposer } from '@/app/(app)/leads/[id]/pro-formas/pro-forma-composer';
import { RecordPaymentDialog } from '@/app/(app)/leads/[id]/pro-formas/record-payment-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { InvoiceableService } from '@/modules/billing/read';

/**
 * Inline action set for one quote on the Client Workspace billing tab.
 * Status-driven: operators see exactly the next actions available for
 * that quote without leaving the workspace page.
 *
 * Each dialog is embedded directly (no page navigation) and calls
 * `router.refresh()` on success, which re-runs `fetchClientWorkspace`
 * and surfaces the new state (next-action resolver, status pills,
 * balances, timeline) in the same render.
 */
export function QuoteActionsRow({
  pf,
  services,
  currencies,
}: {
  pf: {
    id: string;
    number: string;
    status: 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'CONVERTED' | 'REJECTED' | 'CANCELLED' | 'SUPERSEDED';
    sourceLeadId: string;
    proposalGroupId: string | null;
    currencyCode: string;
    subtotal: string;
    revision: number;
    issuedAt: Date | null;
    paymentTerms: string | null;
    notes: string | null;
    lines: Array<{
      serviceCatalogItemId: string;
      description: string;
      quantity: string;
      unitPrice: string;
    }>;
  };
  services: InvoiceableService[];
  currencies: Array<{ code: string; name: string; symbol: string }>;
}) {
  const canOpenPdf = pf.issuedAt != null; // the printable only exists once the quote has been issued
  const initial = {
    currencyCode: pf.currencyCode,
    paymentTerms: pf.paymentTerms,
    notes: pf.notes,
    lines: pf.lines,
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pf.status === 'DRAFT' && (
        <>
          <ProFormaComposer
            mode="edit"
            leadId={pf.sourceLeadId}
            services={services}
            currencies={currencies}
            proFormaInvoiceId={pf.id}
            initial={initial}
            triggerLabel="Edit"
            triggerVariant="outline"
          />
          <IssueProFormaButton proFormaInvoiceId={pf.id} />
          <CancelProFormaButton proFormaInvoiceId={pf.id} />
        </>
      )}
      {pf.status === 'ISSUED' && (
        <>
          <ProFormaComposer
            mode="revise"
            leadId={pf.sourceLeadId}
            services={services}
            currencies={currencies}
            proFormaInvoiceId={pf.id}
            initial={initial}
            triggerLabel="Revise"
            triggerVariant="outline"
          />
          <RecordAcceptanceButton proFormaInvoiceId={pf.id} />
          <RejectProFormaButton proFormaInvoiceId={pf.id} />
          {/* "Create alternative" sits with the issued quote because that's
              when operators realise the client wants a competing offer. */}
          <ProFormaComposer
            mode="create"
            leadId={pf.sourceLeadId}
            services={services}
            currencies={currencies}
            existingProposalGroupId={pf.proposalGroupId}
            triggerLabel="+ Alternative"
            triggerVariant="outline"
          />
        </>
      )}
      {pf.status === 'ACCEPTED' && (
        <>
          <RecordPaymentDialog
            proFormaInvoiceId={pf.id}
            currencyCode={pf.currencyCode}
            defaultAmount={pf.subtotal}
          />
          <ProFormaComposer
            mode="create"
            leadId={pf.sourceLeadId}
            services={services}
            currencies={currencies}
            existingProposalGroupId={pf.proposalGroupId}
            triggerLabel="+ Alternative"
            triggerVariant="outline"
          />
        </>
      )}
      {canOpenPdf && (
        <Link
          href={`/leads/${pf.sourceLeadId}/pro-formas/${pf.id}/print`}
          target="_blank"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8')}
        >
          <ExternalLink className="mr-1 h-3.5 w-3.5" />
          Open PDF
        </Link>
      )}
      {!canOpenPdf && pf.status !== 'DRAFT' && (
        // Any other terminal status without a PDF — just show the detail
        // page link so operators can still inspect the row.
        <Link
          href={`/leads/${pf.sourceLeadId}/pro-formas/${pf.id}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8')}
        >
          Details
        </Link>
      )}
    </div>
  );
}

/** The "+ New quote" button at the top of the Quotes section. Standalone
 *  because it doesn't need a quote context. */
export function NewQuoteButton({
  leadId,
  services,
  currencies,
}: {
  leadId: string;
  services: InvoiceableService[];
  currencies: Array<{ code: string; name: string; symbol: string }>;
}) {
  if (!leadId) {
    return (
      <Button size="sm" variant="outline" disabled title="No active lead on this client">
        + New quote
      </Button>
    );
  }
  return (
    <ProFormaComposer
      mode="create"
      leadId={leadId}
      services={services}
      currencies={currencies}
      triggerLabel="+ New quote"
      triggerVariant="outline"
    />
  );
}
