import { AppSidebar } from '@/components/shell/app-sidebar';
import { ScrollShell } from '@/components/shell/scroll-shell';
import { TopBar } from '@/components/shell/top-bar';
import { requireSession } from '@/lib/auth/session';
import { countMyUnread } from '@/modules/notifications/service';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const unreadCount = await countMyUnread(session.user.id).catch(() => 0);

  return (
    // The app shell is pinned to exactly one viewport (`h-screen`)
    // with no `flex-1` — flex-1 sets `flex-basis: 0` in a flex parent
    // and lets the flex algorithm override the fixed height, letting
    // the container grow with content and the WINDOW scroll (which
    // then drags the sidebar off-screen on nav). `overflow-hidden`
    // makes the shell a hard cap so `<main>` inside ScrollShell is
    // the only surface that actually scrolls.
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
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
