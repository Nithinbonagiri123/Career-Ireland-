import { ScrollText } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchDocumentTypes } from '@/modules/document-types/service';
import { DocTypesTable } from './doc-types-table';

export const dynamic = 'force-dynamic';

export default async function DocumentTypesAdminPage() {
  await requireRole(['ADMIN']);
  const types = await fetchDocumentTypes();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={ScrollText}
          badge="Admin"
          title="Document types"
          description="Configurable list of document types collected from candidates and employers. Required-document rules attach to types."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <DocTypesTable types={types} />
      </FadeUp>
    </div>
  );
}
