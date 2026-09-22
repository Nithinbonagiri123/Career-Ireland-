import { eq } from 'drizzle-orm';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { fetchRequisition } from '@/modules/requisitions/service';
import { fetchChecklist } from '@/modules/work-permit-checklists/service';
import { ChecklistForm } from './checklist-form';

export const dynamic = 'force-dynamic';

export default async function ChecklistDetailPage({
  params,
}: {
  params: Promise<{ id: string; personId: string }>;
}) {
  await requireInternalStaff();
  const { id, personId } = await params;

  const [requisition, checklist, person] = await Promise.all([
    fetchRequisition(id),
    fetchChecklist({ jobRequisitionId: id, personId }),
    db
      .select({
        firstName: persons.firstName,
        lastName: persons.lastName,
        email: persons.email,
        phone: persons.phone,
      })
      .from(persons)
      .where(eq(persons.id, personId))
      .limit(1),
  ]);
  if (!requisition || !person[0]) notFound();

  const p = person[0];
  const fullName = `${p.firstName} ${p.lastName}`.trim();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          title={`Work Permit Checklist — ${fullName}`}
          description={`For ${requisition.title}`}
          breadcrumbs={[
            { label: 'Requisitions', href: '/requisitions' },
            { label: requisition.title, href: `/requisitions/${id}` },
            { label: `Checklist · ${fullName}` },
          ]}
          action={
            <div className="flex items-center gap-2">
              <Link
                href={`/requisitions/${id}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ArrowLeft className="mr-1.5 size-4" /> Back
              </Link>
              <Link
                href={`/requisitions/${id}/checklists/${personId}/print`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: 'sm' })}
              >
                <Printer className="mr-1.5 size-4" /> Print / Save as PDF
              </Link>
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <ChecklistForm
          requisitionId={id}
          personId={personId}
          personName={fullName}
          personEmail={p.email ?? ''}
          personPhone={p.phone ?? ''}
          initial={checklist}
        />
      </FadeUp>
    </div>
  );
}
