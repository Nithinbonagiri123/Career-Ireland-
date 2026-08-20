import { AppSidebar } from '@/components/shell/app-sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { requireSession } from '@/lib/auth/session';
import { countMyUnread } from '@/modules/notifications/service';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const unreadCount = await countMyUnread(session.user.id).catch(() => 0);

  return (
    <div className="flex min-h-screen flex-1">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <TopBar user={session.user} unreadNotifications={unreadCount} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
