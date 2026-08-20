import { Bell } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireSession } from '@/lib/auth/session';
import { fetchMyRecentNotifications } from '@/modules/notifications/service';
import { NotificationsList } from './notifications-list';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await requireSession();
  const items = await fetchMyRecentNotifications(session.user.id, 100);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Bell}
          title="Notifications"
          description="Generated daily at 06:00 UTC. Ad expiries, immigration expiries, overdue tasks. Configurable thresholds live in the notifications service."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <NotificationsList notifications={items} />
      </FadeUp>
    </div>
  );
}
