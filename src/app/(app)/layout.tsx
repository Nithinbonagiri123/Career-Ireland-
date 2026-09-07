import { AppSidebar } from '@/components/shell/app-sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { DotPattern } from '@/components/ui/dot-pattern';
import { requireSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { countMyUnread } from '@/modules/notifications/service';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const unreadCount = await countMyUnread(session.user.id).catch(() => 0);

  return (
    <div className="flex min-h-screen flex-1">
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <TopBar user={session.user} unreadNotifications={unreadCount} />
        {/* Ambient dot pattern behind the main scroll area only — sidebar +
            topbar stay solid. Mask fades the pattern toward the bottom so
            it never competes with content near the fold. */}
        <main className="relative flex-1 overflow-y-auto">
          <DotPattern
            className={cn(
              'z-0 fill-foreground/[0.045] dark:fill-foreground/[0.055]',
              '[mask-image:linear-gradient(to_bottom,black,transparent_70%)]',
            )}
          />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
