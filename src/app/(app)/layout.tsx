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
        {/*
          Workspace canvas — deliberately no ambient pattern. Notion /
          Attio / Stripe / Linear all use a plain warm canvas + strong
          card contrast to feel premium; anything else fights the
          typography. The canvas colour comes from the deepened
          --background token defined in globals.css, and the subtle
          top-only vignette below adds depth without competing with
          content sitting on it.
        */}
        <main className="relative flex-1 overflow-y-auto">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-0 h-64 bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,oklch(0.94_0.012_60/0.6),transparent)] dark:bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,oklch(0.24_0.014_60/0.35),transparent)]"
          />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
