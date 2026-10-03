import { ListTree } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requirePermission } from '@/lib/auth/session';
import { fetchChartOfAccounts } from '@/modules/accounting/read';

export const dynamic = 'force-dynamic';

/**
 * Chart of accounts — read-only in Phase 1. Admins seed the chart via
 * `pnpm tsx scripts/seed-accounting.ts`; a CRUD UI for accounts arrives
 * later (Phase 4) once there's a real need for ops to add accounts
 * mid-year.
 */
export default async function ChartOfAccountsPage() {
  await requirePermission('main', 'accounting', 'view');
  const accounts = await fetchChartOfAccounts();

  const byType = accounts.reduce<Record<string, typeof accounts>>((acc, a) => {
    const bucket = acc[a.type] ?? [];
    bucket.push(a);
    acc[a.type] = bucket;
    return acc;
  }, {});
  const typeOrder = [
    'ASSET',
    'LIABILITY',
    'EQUITY',
    'REVENUE',
    'COST_OF_SALES',
    'EXPENSE',
    'OTHER_INCOME',
    'OTHER_EXPENSE',
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={ListTree}
          badge="Accounting"
          title="Chart of accounts"
          description={`${accounts.length} accounts across ${Object.keys(byType).length} types. Edit the chart by rerunning scripts/seed-accounting.ts — Phase 1 doesn't expose a CRUD UI yet.`}
          breadcrumbs={[
            { label: 'Admin', href: '/admin' },
            { label: 'Accounting', href: '/admin/accounting' },
            { label: 'Chart of accounts' },
          ]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6 space-y-5">
        {typeOrder
          .filter((type) => byType[type]?.length)
          .map((type) => (
            <Card key={type}>
              <CardContent className="pt-5">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider">
                    {humanType(type)}
                  </h2>
                  <Badge variant="secondary" className="rounded-full text-[10px]">
                    {byType[type].length}
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-24">Currency</TableHead>
                      <TableHead className="w-24 text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byType[type].map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">{a.code}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{a.name}</div>
                          {a.description && (
                            <div className="text-xs text-muted-foreground">{a.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {a.currencyCode ?? <span className="text-muted-foreground">any</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {!a.active ? (
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              inactive
                            </Badge>
                          ) : !a.allowPosting ? (
                            <Badge variant="secondary" className="rounded-full text-[10px]">
                              summary
                            </Badge>
                          ) : (
                            <Badge variant="default" className="rounded-full text-[10px]">
                              posting
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
      </FadeUp>
    </div>
  );
}

function humanType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
