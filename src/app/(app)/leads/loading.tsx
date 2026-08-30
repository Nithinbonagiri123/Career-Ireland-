import { PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons';

export default function LeadsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={220} />
      <TableSkeleton rows={8} columnWidths={['30%', '18%', '20%', '18%', '10%', '4%']} />
    </div>
  );
}
