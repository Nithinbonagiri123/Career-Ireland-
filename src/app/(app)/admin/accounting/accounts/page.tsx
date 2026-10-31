import { ListTree } from 'lucide-react';
import { DsTable, DsTBody, DsTd, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { DsStatusPill } from '@/components/ds/status-pill';
import { SectionCard } from '@/components/ds/workspace';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchChartOfAccounts } from '@/modules/accounting/read';
import { ACC_CRUMBS, ACC_PAGE, COL_SM, FLUSH_TABLE, PHONE_NOTE } from '../accounting-ui';

export const dynamic = 'force-dynamic';

const TYPE_ORDER = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'COST_OF_SALES',
  'EXPENSE',
  'OTHER_INCOME',
  'OTHER_EXPENSE',
] as const;

/** Chart of accounts — read-only; the chart is maintained outside the app. */
export default async function ChartOfAccountsPage() {
  await requirePermission('main', 'accounting', 'view');
  const accounts = await fetchChartOfAccounts();

  const byType = accounts.reduce<Record<string, typeof accounts>>((acc, a) => {
    const bucket = acc[a.type] ?? [];
    bucket.push(a);
    acc[a.type] = bucket;
    return acc;
  }, {});
  const typeCount = Object.keys(byType).length;

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={ListTree}
          iconTone="blue"
          title="Chart of accounts"
          description={`${accounts.length} accounts across ${typeCount} type${typeCount === 1 ? '' : 's'}. Posting accounts accept journal lines; summary accounts only group others.`}
          breadcrumbs={[...ACC_CRUMBS, { label: 'Chart of accounts' }]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="space-y-5">
        {TYPE_ORDER.filter((type) => byType[type]?.length).map((type) => (
          <SectionCard key={type} title={humanType(type)} count={byType[type].length}>
            <DsTable
              label={`${humanType(type)} accounts`}
              caption={`${humanType(type)} accounts`}
              card={false}
              minWidth={300}
              className={FLUSH_TABLE}
            >
              <DsTHead>
                <tr>
                  <DsTh className="w-24">Code</DsTh>
                  <DsTh>Name</DsTh>
                  <DsTh className={cn('w-24', COL_SM)}>Currency</DsTh>
                  <DsTh className="w-28">Status</DsTh>
                </tr>
              </DsTHead>
              <DsTBody>
                {byType[type].map((a) => (
                  <DsTr key={a.id}>
                    <DsTd className="font-mono text-xs">{a.code}</DsTd>
                    <DsTd>
                      <div className="font-medium text-foreground">{a.name}</div>
                      {a.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{a.description}</div>
                      )}
                      <div className={PHONE_NOTE}>Currency: {a.currencyCode ?? 'Any'}</div>
                    </DsTd>
                    <DsTd className={cn('font-mono text-xs', COL_SM)}>
                      {a.currencyCode ?? <span className="text-muted-foreground">Any</span>}
                    </DsTd>
                    <DsTd>
                      {!a.active ? (
                        <DsStatusPill tone="slate">Inactive</DsStatusPill>
                      ) : !a.allowPosting ? (
                        <DsStatusPill tone="violet">Summary</DsStatusPill>
                      ) : (
                        <DsStatusPill tone="green">Posting</DsStatusPill>
                      )}
                    </DsTd>
                  </DsTr>
                ))}
              </DsTBody>
            </DsTable>
          </SectionCard>
        ))}
      </FadeUp>
    </div>
  );
}

function humanType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}
