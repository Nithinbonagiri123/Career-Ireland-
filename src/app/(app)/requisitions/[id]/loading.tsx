import { CardWithRowsSkeleton, PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons';

export default function RequisitionDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton hasBadge actionWidth={200} />
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CardWithRowsSkeleton titleWidth={180} rowCount={3} />
        <CardWithRowsSkeleton titleWidth={200} rowCount={3} />
      </div>
      <div className="space-y-6">
        <TableSkeleton rows={4} columnWidths={['30%', '15%', '15%', '15%', '15%', '10%']} />
      </div>
    </div>
  );
}
