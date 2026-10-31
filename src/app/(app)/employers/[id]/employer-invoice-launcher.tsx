'use client';

import { FileText } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { GenerateInvoiceDialog } from '@/components/billing/generate-invoice-dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { InvoiceableService } from '@/modules/billing/read';
import { FINANCE_ISSUES_INVOICES } from '@/modules/placements/fee';

/**
 * P0 — the employer page's invoice dialog lives HERE, mounted next to the
 * header actions rather than inside the lazily-mounted overflow menu. That
 * is what makes `?raisePlacement=<id>[&raiseRequisition=<id>]` open the
 * dialog on arrival (every "Raise fee" entry point links to that URL),
 * and lets the menu's "Generate invoice" item simply open it.
 *
 * Only users with ISSUE finance authority get a dialog at all; the server
 * re-checks (requireFinanceAuthority) and W1's billing guard refuses a
 * second live invoice for the same placement.
 */

type RaiseTarget = { placementId: string; requisitionId: string | null; personName: string };

const InvoiceLauncherContext = createContext<{ openPlain: () => void; canIssue: boolean } | null>(
  null,
);

export function EmployerInvoiceLauncher({
  children,
  payerId,
  payerLabel,
  services,
  canIssue,
  raise,
}: {
  children: ReactNode;
  payerId: string;
  payerLabel: string;
  services: InvoiceableService[];
  canIssue: boolean;
  /** The placement the URL asked to bill — already checked raisable. */
  raise: RaiseTarget | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // "plain" = opened from the menu without placement context.
  const [plain, setPlain] = useState(false);

  // Opens on arrival and again whenever the URL names another placement
  // (e.g. clicking "Raise placement fee" while already on the page).
  useEffect(() => {
    if (raise?.placementId && canIssue) {
      setPlain(false);
      setOpen(true);
    }
  }, [raise?.placementId, canIssue]);

  const clearRaiseParams = () => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has('raisePlacement') && !sp.has('raiseRequisition')) return;
    sp.delete('raisePlacement');
    sp.delete('raiseRequisition');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const placementContext = !plain && raise ? raise : null;

  return (
    <InvoiceLauncherContext.Provider
      value={{
        canIssue,
        openPlain: () => {
          setPlain(true);
          setOpen(true);
        },
      }}
    >
      {children}
      {canIssue && (
        <GenerateInvoiceDialog
          // Fresh form state per placement (service / price prefills).
          key={placementContext?.placementId ?? 'plain'}
          payerMode="EMPLOYER"
          payerId={payerId}
          payerLabel={
            placementContext ? `${payerLabel} — fee for ${raise?.personName}` : payerLabel
          }
          services={services}
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setPlain(false);
              clearRaiseParams();
            }
          }}
          contextLinks={
            placementContext
              ? {
                  placementId: placementContext.placementId,
                  jobRequisitionId: placementContext.requisitionId ?? undefined,
                }
              : undefined
          }
        />
      )}
    </InvoiceLauncherContext.Provider>
  );
}

/** Overflow-menu entry: opens the page-level dialog without placement context. */
export function GenerateInvoiceMenuItem() {
  const ctx = useContext(InvoiceLauncherContext);
  if (!ctx?.canIssue) {
    return (
      <DropdownMenuItem disabled>
        <FileText className="size-4" aria-hidden />
        <span className="flex flex-col">
          Generate invoice
          <span className="text-[11px] text-muted-foreground">{FINANCE_ISSUES_INVOICES}</span>
        </span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem onClick={() => ctx.openPlain()} data-testid="menu-generate-invoice">
      <FileText className="size-4" aria-hidden /> Generate invoice
    </DropdownMenuItem>
  );
}
