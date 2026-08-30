import { PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons';

export default function ImmigrationLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={220} />
      <TableSkeleton rows={8} columnWidths={['15%', '30%', '20%', '20%', '15%']} />
    </div>
  );
}
