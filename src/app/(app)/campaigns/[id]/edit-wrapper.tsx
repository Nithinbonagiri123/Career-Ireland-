import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RecruitmentCampaign } from '@/lib/db/schema/campaigns';
import { fetchRequisitions } from '@/modules/requisitions/service';
import { CampaignDialog } from '../campaign-dialog';

/** Server component that fetches requisitions once and hands them to the edit dialog. */
export async function CampaignEditWrapper({ campaign }: { campaign: RecruitmentCampaign }) {
  const requisitions = await fetchRequisitions();
  return (
    <CampaignDialog
      requisitions={requisitions}
      initial={campaign}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="mr-1.5 size-4" /> Edit
        </Button>
      }
    />
  );
}
