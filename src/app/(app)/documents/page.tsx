import { eq } from 'drizzle-orm';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import {
  type DocumentHubKind,
  fetchDocumentClientFolders,
  fetchDocumentsHub,
} from '@/modules/documents/hub';
import { ClientFolders } from './client-folders';
import { DocumentsTable } from './documents-table';
import { KindFilter } from './kind-filter';
import { OwnerSearch } from './owner-search';

export const dynamic = 'force-dynamic';

const VALID_KINDS: readonly (DocumentHubKind | 'ALL')[] = ['ALL', 'UPLOADED', 'INVOICE', 'RECEIPT'];

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    from?: string;
    to?: string;
    kind?: string;
    q?: string;
    client?: string;
    type?: string;
  }>;
}) {
  await requirePermission('candidate_services', 'documents', 'view');
  const { created, from, to, kind, q, client, type } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const kindParsed = (kind ?? 'ALL').toUpperCase();
  const kindArg = (
    VALID_KINDS.includes(kindParsed as DocumentHubKind | 'ALL') ? kindParsed : 'ALL'
  ) as DocumentHubKind | 'ALL';

  // Two-level UI: `?client=<id>&type=<PERSON|EMPLOYER>` shows one
  // client's folder contents; no client param shows the folder grid.
  const ownerKind = type === 'PERSON' || type === 'EMPLOYER' ? type : null;
  const inFolder = Boolean(client && ownerKind);

  if (inFolder && client && ownerKind) {
    const [documents, ownerName] = await Promise.all([
      fetchDocumentsHub({
        kind: kindArg,
        createdRange,
        ownerId: client,
        ownerKind,
      }),
      resolveOwnerName(client, ownerKind),
    ]);
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
        <FadeUp>
          <PageHeader
            icon={FileText}
            iconTone="neutral"
            title={ownerName ?? 'Client folder'}
            description={`Every file, invoice, and receipt for this ${ownerKind === 'PERSON' ? 'candidate' : 'employer'}.`}
            breadcrumbs={[{ label: 'Documents', href: '/documents' }, { label: ownerName ?? '…' }]}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/documents"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <ArrowLeft className="mr-1.5 size-4" />
                  All clients
                </Link>
                <DateRangeFilter />
              </div>
            }
          />
        </FadeUp>
        <FadeUp delay={0.03}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <KindFilter />
          </div>
        </FadeUp>
        <FadeUp delay={0.05}>
          <DocumentsTable documents={documents} />
        </FadeUp>
      </div>
    );
  }

  // Landing view — folder grid.
  const folders = await fetchDocumentClientFolders({ ownerQ: q });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={FileText}
          title="Documents"
          description="One folder per client. Open a folder to see every file, invoice, and receipt for that person or employer."
        />
      </FadeUp>
      <FadeUp delay={0.03}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {folders.length} {folders.length === 1 ? 'client' : 'clients'} with documents
          </span>
          <OwnerSearch />
        </div>
      </FadeUp>
      <FadeUp delay={0.05}>
        <ClientFolders folders={folders} />
      </FadeUp>
    </div>
  );
}

async function resolveOwnerName(
  ownerId: string,
  ownerKind: 'PERSON' | 'EMPLOYER',
): Promise<string | null> {
  if (ownerKind === 'PERSON') {
    const [p] = await db
      .select({ firstName: persons.firstName, lastName: persons.lastName })
      .from(persons)
      .where(eq(persons.id, ownerId))
      .limit(1);
    if (!p) return null;
    return `${p.firstName} ${p.lastName}`.trim();
  }
  const [e] = await db
    .select({ legalName: employers.legalName })
    .from(employers)
    .where(eq(employers.id, ownerId))
    .limit(1);
  return e?.legalName ?? null;
}
