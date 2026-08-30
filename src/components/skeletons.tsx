import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Reusable skeleton primitives shaped like the real layouts. Use inside `loading.tsx`
 * files so the fallback tree matches what the rendered page will look like.
 */

export function PageHeaderSkeleton({
  hasBadge = false,
  actionWidth = 120,
}: {
  hasBadge?: boolean;
  actionWidth?: number;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5" />
          {hasBadge && <Skeleton className="h-5 w-20 rounded-full" />}
        </div>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-9" style={{ width: actionWidth }} />
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columnWidths = ['30%', '15%', '15%', '15%', '15%', '10%'],
}: {
  rows?: number;
  columnWidths?: string[];
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex gap-4">
          {columnWidths.map((w, i) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: header columns have no id
              key={`h-${i}`}
              className="h-3.5"
              style={{ width: w }}
            />
          ))}
        </div>
      </div>
      <ul className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no id
          <li key={`r-${i}`} className="flex gap-4 px-4 py-4">
            {columnWidths.map((w, j) => (
              <Skeleton
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells have no id
                key={`c-${i}-${j}`}
                className="h-4"
                style={{ width: w }}
              />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TileCardSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="size-4" />
        </div>
        <Skeleton className="h-9 w-16" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}

export function TileGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton tiles have no id
        <TileCardSkeleton key={`t-${i}`} />
      ))}
    </div>
  );
}

export function CardWithRowsSkeleton({
  titleWidth = 160,
  rowCount = 4,
}: {
  titleWidth?: number;
  rowCount?: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4" style={{ width: titleWidth }} />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">
          {Array.from({ length: rowCount }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no id
            <li key={`sr-${i}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function DetailPageSkeleton({
  cardColumns = 3,
  bodyRows = 6,
}: {
  cardColumns?: number;
  bodyRows?: number;
}) {
  return (
    <>
      <PageHeaderSkeleton hasBadge actionWidth={140} />
      <div
        className={cn(
          'grid grid-cols-1 gap-6',
          cardColumns === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3',
        )}
      >
        {Array.from({ length: cardColumns }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cards have no id
          <Card key={`dc-${i}`}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no id
                <div key={`dr-${i}-${j}`} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8">
        <TableSkeleton rows={bodyRows} />
      </div>
    </>
  );
}
