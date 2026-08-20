import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { type RecruitmentCampaign, recruitmentCampaigns } from '@/lib/db/schema/campaigns';

export async function getCampaign(id: string): Promise<RecruitmentCampaign | null> {
  const [row] = await db
    .select()
    .from(recruitmentCampaigns)
    .where(eq(recruitmentCampaigns.id, id))
    .limit(1);
  return row ?? null;
}
