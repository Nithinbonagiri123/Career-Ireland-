import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/session';
import { createDraft, getDraft } from '@/modules/candidates/onboarding-service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchDocumentTypes } from '@/modules/document-types/service';
import { fetchPersonDocuments } from '@/modules/documents/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Add candidate · Career Ireland' };

/**
 * Landing screen for the "Add candidate" workflow.
 *
 * On first visit (no `?draft=` query) we create a fresh draft `persons` row
 * and redirect to `?draft=<id>` so a browser refresh doesn't create another.
 * Returning visits pick up the same draft — every section on the form is
 * auto-saved server-side, so staff can leave and come back.
 */
export default async function NewCandidatePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  await requireRole(['ADMIN', 'STAFF']);
  const { draft: draftId } = await searchParams;

  if (!draftId) {
    const { personId } = await createDraft();
    redirect(`/candidates/new?draft=${personId}`);
  }

  const draft = await getDraft(draftId);
  if (!draft) {
    // Draft was discarded / expired — start over.
    redirect('/candidates/new');
  }

  const [currencies, allDocTypes, existingDocuments] = await Promise.all([
    fetchCurrencies(),
    fetchDocumentTypes(),
    fetchPersonDocuments(draft.id),
  ]);
  // Only person-applicable types are meaningful during candidate intake.
  const personDocTypes = allDocTypes.filter(
    (t) => t.isActive && (t.appliesTo === 'PERSON' || t.appliesTo === 'BOTH'),
  );

  // Lazy import so the route stays a Server Component and Playwright can
  // navigate to it without a client bundle round-trip.
  const { OnboardingForm } = await import('./onboarding-form');

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UserPlus}
          title="Add candidate"
          description="Every field is optional except first and last name. Documents can be attached as you go. Payment is required to create the profile."
          action={
            <Link
              href="/candidates"
              className={buttonVariants({ variant: 'outline', size: 'default' })}
            >
              Cancel
            </Link>
          }
        />
      </FadeUp>

      <OnboardingForm
        draft={{
          personId: draft.id,
          firstName: draft.firstName === 'Draft' ? '' : draft.firstName,
          lastName: draft.lastName === 'Candidate' ? '' : draft.lastName,
          email: draft.email ?? '',
          phone: draft.phone ?? '',
          dateOfBirth: draft.dateOfBirth ?? '',
          nationality: draft.nationality ?? '',
          currentCity: draft.currentCity ?? '',
          currentCountry: draft.currentCountry ?? '',
          notes: draft.notes ?? '',
        }}
        currencies={currencies.map((c) => ({ code: c.code, symbol: c.symbol }))}
        docTypes={personDocTypes.map((t) => ({ id: t.id, name: t.name, code: t.code }))}
        existingDocuments={existingDocuments.map((d) => ({
          id: d.id,
          filename: d.originalFilename,
          documentTypeId: d.documentTypeId,
        }))}
      />
    </div>
  );
}
