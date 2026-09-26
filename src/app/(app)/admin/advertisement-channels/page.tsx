import { Megaphone } from 'lucide-react';
import { BusinessCatalogTable } from '@/components/admin/business-catalog-table';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchBusinessCaseTypes } from '@/modules/catalog/business-case-types';

export const dynamic = 'force-dynamic';

export default async function AdvertisementChannelsAdminPage() {
  await requirePermission('main', 'admin', 'view');
  const channels = await fetchBusinessCaseTypes({ module: 'ADVERTISEMENT_CHANNEL' });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Megaphone}
          badge="Admin"
          title="Advertisement channels"
          description="Reusable catalog of the channels you run recruitment ads on (LinkedIn Jobs, IrishJobs, Indeed, WhatJobs, direct company site, referrals, and any custom source you use). Staff pick from this list when logging where an applicant came from — enables clean reporting on channel performance."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <BusinessCatalogTable
          module="ADVERTISEMENT_CHANNEL"
          entities={channels}
          entityLabelSingular="channel"
          entityLabelPlural="channels"
          emptyDescription="Add the channels where you post job advertisements (e.g. LinkedIn Jobs, IrishJobs, Indeed) so applicants can be tagged with their source."
          placeholderExample="e.g. LinkedIn Jobs"
        />
      </FadeUp>
    </div>
  );
}
