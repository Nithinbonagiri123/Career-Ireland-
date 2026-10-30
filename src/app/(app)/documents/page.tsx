import { eq } from 'drizzle-orm';
import { ArrowLeft, Building2, Files, FileText, FolderOpen, UserRound } from 'lucide-react';
import Link from 'next/link';
import { DateRangeFilter } from '@/components/date-range-filter';
import { StatusTabs } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
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

const PER_OPTIONS = [24, 48, 96];

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
    owner?: string;
    page?: string;
    per?: string;
  }>;
}) {
  await requirePermission('candidate_services', 'documents', 'view');
  const sp = await searchParams;
  const { created, from, to, kind, q, client, type } = sp;
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
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
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
          <div className="mb-4 flex flex-wrap items-center gap-3">
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
  const people = folders.filter((f) => f.ownerKind === 'PERSON').length;
  const companies = folders.length - people;
  const totalDocs = folders.reduce(
    (n, f) => n + f.filesCount + f.invoicesCount + f.receiptsCount,
    0,
  );
  const ownerTab = sp.owner === 'person' || sp.owner === 'employer' ? sp.owner : 'all';
  const visible = folders.filter((f) =>
    ownerTab === 'all'
      ? true
      : ownerTab === 'person'
        ? f.ownerKind === 'PERSON'
        : f.ownerKind === 'EMPLOYER',
  );
  const pageData = paginate(visible, sp.page, sp.per, PER_OPTIONS);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={FileText}
          iconTone="blue"
          title="Documents"
          description="One folder per client. Open a folder to see every file, invoice, and receipt for that person or employer."
        />
      </FadeUp>
      <FadeUp delay={0.03}>
        <StatTileGrid>
          <StatTile
            icon={FolderOpen}
            tone="blue"
            label="Client folders"
            value={folders.length}
            hint="With at least one document"
          />
          <StatTile
            icon={UserRound}
            tone="violet"
            label="Candidates"
            value={people}
            hint="Person folders"
          />
          <StatTile
            icon={Building2}
            tone="amber"
            label="Employers"
            value={companies}
            hint="Company folders"
          />
          <StatTile
            icon={Files}
            tone="green"
            label="Documents"
            value={totalDocs}
            hint="Files, invoices and receipts"
          />
        </StatTileGrid>
      </FadeUp>
      <FadeUp delay={0.05}>
        <section
          aria-label="Filters"
          className="mt-6 rounded-2xl border border-border/60 bg-card p-3 shadow-sm"
        >
          <OwnerSearch />
        </section>
        <div className="mt-4">
          <StatusTabs
            param="owner"
            ariaLabel="Folder owner"
            tabs={[
              { key: 'all', label: 'All', count: folders.length },
              { key: 'person', label: 'Candidates', count: people, tone: 'violet' },
              { key: 'employer', label: 'Employers', count: companies, tone: 'amber' },
            ]}
          />
        </div>
      </FadeUp>
      <FadeUp delay={0.07}>
        <div className="mt-4">
          <ClientFolders folders={pageData.items} />
          <Pagination
            basePath="/documents"
            params={sp as Record<string, string | undefined>}
            page={pageData.page}
            pages={pageData.pages}
            per={pageData.per}
            total={pageData.total}
            start={pageData.start}
            noun="folders"
            perOptions={PER_OPTIONS}
          />
        </div>
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
