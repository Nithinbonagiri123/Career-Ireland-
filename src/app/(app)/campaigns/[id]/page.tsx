import { Pencil, Plus, Sparkles } from 'lucide-react';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireInternalStaff } from '@/lib/auth/session';
import {
  fetchAdsForCampaign,
  fetchCampaign,
  fetchProspectsForAd,
} from '@/modules/campaigns/service';
import { fetchPersons } from '@/modules/persons/service';
import { AdDialog } from './ad-dialog';
import { CampaignEditWrapper } from './edit-wrapper';
import { ProspectRowActions } from './prospect-actions';
import { ProspectIntakeDialog } from './prospect-dialog';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  DRAFT: 'outline',
  ACTIVE: 'default',
  COMPLETED: 'outline',
  CANCELLED: 'outline',
  EXPIRED: 'outline',
  CLOSED: 'outline',
} as const;

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireInternalStaff();
  const { id } = await params;
  const campaign = await fetchCampaign(id);
  if (!campaign) notFound();

  const [ads, persons] = await Promise.all([fetchAdsForCampaign(id), fetchPersons()]);
  const adProspects = await Promise.all(
    ads.map(async (ad) => ({ ad, prospects: await fetchProspectsForAd(ad.id) })),
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Sparkles}
          title={campaign.name}
          description={
            campaign.requisitionTitle
              ? `Linked to requisition: ${campaign.requisitionTitle}`
              : 'Standalone campaign — talent pool building'
          }
          badge={campaign.status}
          action={
            <div className="flex gap-2">
              <CampaignEditWrapper campaign={campaign} />
              <AdDialog
                campaignId={campaign.id}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" /> New advertisement
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>

      {ads.length === 0 ? (
        <FadeUp delay={0.05}>
          <EmptyState
            icon={Sparkles}
            title="No advertisements yet"
            description="Advertisements run per country (Ireland / South Africa / etc). Add one to start collecting prospects."
          />
        </FadeUp>
      ) : (
        <div className="space-y-6">
          {adProspects.map(({ ad, prospects }, i) => (
            <FadeUp key={ad.id} delay={0.05 + i * 0.03}>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {ad.country}
                      {ad.platform ? ` · ${ad.platform}` : ''}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Target {ad.targetApplicants} · {ad.startDate} → {ad.expiryDate}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[ad.status]} className="rounded-full">
                      {ad.status}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      {prospects.length} prospects
                    </Badge>
                    <AdDialog
                      campaignId={campaign.id}
                      initial={ad}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Edit ad ${ad.country}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                      }
                    />
                    <ProspectIntakeDialog advertisementId={ad.id} persons={persons} />
                  </div>
                </CardHeader>
                <CardContent>
                  {prospects.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No prospects yet. Record responses as they come in.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {prospects.map((p) => (
                        <li key={p.id} className="flex items-center justify-between py-3">
                          <div>
                            <div className="text-sm font-medium">{p.personName}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.personEmail ?? '—'} ·{' '}
                              <Badge variant="secondary" className="rounded-full text-[10px]">
                                {p.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                          </div>
                          <ProspectRowActions prospect={p} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </FadeUp>
          ))}
        </div>
      )}
    </div>
  );
}
