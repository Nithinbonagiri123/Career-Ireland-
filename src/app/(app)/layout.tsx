import { AppSidebar } from '@/components/shell/app-sidebar';
import { ScrollShell } from '@/components/shell/scroll-shell';
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
        {/*
          Workspace canvas — deliberately no ambient pattern. Notion /
          Attio / Stripe / Linear all use a plain warm canvas + strong
          card contrast to feel premium; anything else fights the
          typography. The canvas colour comes from the deepened
          --background token in globals.css, and the subtle top-only
          vignette lives inside ScrollShell.
        */}
        <ScrollShell>{children}</ScrollShell>
      </div>
    </div>
  );
}
