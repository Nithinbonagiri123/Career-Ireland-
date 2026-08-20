import { FileText } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchAllDocumentsForStaff } from '@/modules/documents/service';
import { DocumentsTable } from './documents-table';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const documents = await fetchAllDocumentsForStaff();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={FileText}
          title="Documents"
          description="Every document uploaded to Career Ireland. Review, accept, or reject. Files live in S3; only metadata + review decisions are stored here."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <DocumentsTable documents={documents} />
      </FadeUp>
    </div>
  );
}
