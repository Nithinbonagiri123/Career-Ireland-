import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { eq } from 'drizzle-orm';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/print-button';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import type { ChecklistAnswer } from '@/lib/db/schema/work_permit_checklists';
import { fetchRequisition } from '@/modules/requisitions/service';
import {
  ADVERT_INFO_FIELDS,
  DOC_CHECK_FIELDS,
  MATCH_CHECK_FIELDS,
} from '@/modules/work-permit-checklists/schemas';
import { fetchChecklist } from '@/modules/work-permit-checklists/service';
import { fetchAppSettings } from '@/modules/settings/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Work Permit Checklist' };

type AnswerMap = Record<string, ChecklistAnswer>;

export default async function ChecklistPrintPage({
  params,
}: {
  params: Promise<{ id: string; personId: string }>;
}) {
  await requireInternalStaff();
  const { id, personId } = await params;

  const [requisition, checklist, person, settings] = await Promise.all([
    fetchRequisition(id),
    fetchChecklist({ jobRequisitionId: id, personId }),
    db
      .select({ firstName: persons.firstName, lastName: persons.lastName, email: persons.email, phone: persons.phone })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1),
    fetchAppSettings(),
  ]);
  if (!requisition || !person[0]) notFound();

  const p = person[0];
  const fullName = `${p.firstName} ${p.lastName}`.trim();
  const address = settings.addressLines.join(', ');

  const matchChecks = (checklist?.matchChecks as AnswerMap) ?? {};
  const advertChecks = (checklist?.advertInfoChecks as AnswerMap) ?? {};
  const docChecks = (checklist?.documentsChecks as AnswerMap) ?? {};

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-6 print:hidden">
        <Link
          href={`/requisitions/${id}/checklists/${personId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Back
        </Link>
        <PrintButton />
      </div>
      <main className="mx-auto my-6 max-w-3xl bg-white p-10 shadow-sm print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="flex items-start justify-between border-b border-emerald-800/20 pb-6">
          <Image
            src="/logo-icg.png"
            alt={settings.legalName}
            width={280}
            height={215}
            priority
            className="h-24 w-auto object-contain"
          />
          <div className="text-right font-black tracking-[0.25em] text-emerald-900">
            <div className="text-2xl leading-tight">WORK PERMIT</div>
            <div className="text-2xl leading-tight">CHECKLIST</div>
          </div>
        </header>
        <p className="mt-4 text-center text-[13px] text-foreground">
          <span className="font-semibold">{settings.legalName}</span>
          {address ? `, ${address}` : ''}
        </p>

        {/* ── Candidate + requisition meta ───────────────────────── */}
        <table className="mt-6 w-full border-collapse text-sm">
          <tbody>
            <MetaRow label="Candidate Name" value={fullName} />
            <MetaRow label="Email" value={p.email ?? '—'} />
            <MetaRow label="Telephone" value={p.phone ?? '—'} />
            <MetaRow label="Job Requisition" value={requisition.title} />
            <MetaRow
              label="Date"
              value={format(new Date(), "dd MMM yyyy 'at' HH:mm")}
            />
            <MetaRow
              label="Date Contract Signed"
              value={
                checklist?.contractSignedOn
                  ? format(new Date(String(checklist.contractSignedOn)), 'dd MMM yyyy')
                  : '—'
              }
            />
            <MetaRow
              label="Commencement Date"
              value={
                checklist?.commencementDate
                  ? format(new Date(String(checklist.commencementDate)), 'dd MMM yyyy')
                  : '—'
              }
            />
          </tbody>
        </table>

        <SectionTable
          title="Requirement Match"
          fields={MATCH_CHECK_FIELDS}
          answers={matchChecks}
        />
        <SectionTable
          title="Advert Info verified"
          fields={ADVERT_INFO_FIELDS}
          answers={advertChecks}
        />
        <SectionTable
          title="Documents to Upload — Check"
          fields={DOC_CHECK_FIELDS}
          answers={docChecks}
        />

        {checklist?.notes && (
          <section className="mt-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-900">
              Notes
            </h2>
            <p className="mt-2 whitespace-pre-wrap rounded border border-border p-3 text-sm">
              {checklist.notes}
            </p>
          </section>
        )}

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Filed under {requisition.title} · Internal use only
        </p>
      </main>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border border-border">
      <th className="w-[38%] bg-muted px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-foreground">
        {label}
      </th>
      <td className="border-l border-border px-3 py-2">{value}</td>
    </tr>
  );
}

function SectionTable({
  title,
  fields,
  answers,
}: {
  title: string;
  fields: readonly { key: string; label: string }[];
  answers: AnswerMap;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-emerald-900">
        {title}
      </h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-[55%] bg-muted px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-foreground border border-border">
              Requirement
            </th>
            <th className="w-[15%] bg-muted px-3 py-2 text-center font-semibold uppercase tracking-wider text-xs text-foreground border border-border">
              Answer
            </th>
            <th className="bg-muted px-3 py-2 text-left font-semibold uppercase tracking-wider text-xs text-foreground border border-border">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const a: ChecklistAnswer = answers[f.key] ?? { value: null };
            return (
              <tr key={f.key} className="border border-border">
                <td className="border border-border px-3 py-2">{f.label}</td>
                <td className="border border-border px-3 py-2 text-center font-semibold">
                  {a.value ?? '—'}
                </td>
                <td className="border border-border px-3 py-2 text-xs text-muted-foreground">
                  {a.note ?? ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
