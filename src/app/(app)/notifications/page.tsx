import { Bell } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireSession } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchMyRecentNotifications } from '@/modules/notifications/service';
import { NotificationsList } from './notifications-list';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const items = await fetchMyRecentNotifications(session.user.id, 100, createdRange);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Bell}
          title="Notifications"
          description="Generated daily at 06:00 UTC. Ad expiries, immigration expiries, overdue tasks. Configurable thresholds live in the notifications service."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <NotificationsList notifications={items} />
      </FadeUp>
    </div>
  );
}
