import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProFormaPrintable } from '@/components/billing/pro-forma-printable';
import { PrintButton } from '@/components/print-button';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { fetchProForma } from '@/modules/proformas/service';
import { fetchAppSettings } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pro Forma' };

/**
 * Print-ready pro-forma page. Dedicated route so the user can hit
 * Cmd+P / Ctrl+P and the browser produces a clean PDF. The on-screen
 * controls (Back, Print) are hidden under `print:hidden` so they
 * never leak into the PDF.
 */
export default async function ProFormaPrintPage({
  params,
}: {
  params: Promise<{ id: string; pfId: string }>;
}) {
  await requirePermission('candidate_services', 'proformas', 'view');
  const { id: leadId, pfId } = await params;

  const [pf, settings] = await Promise.all([
    fetchProForma(pfId).catch(() => null),
    fetchAppSettings(),
  ]);
  if (!pf || pf.sourceLeadId !== leadId) notFound();

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 print:hidden">
        <Link
          href={`/leads/${leadId}/pro-formas/${pfId}`}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
        <PrintButton />
      </div>
      <ProFormaPrintable proForma={pf} settings={settings} />
    </div>
  );
}
