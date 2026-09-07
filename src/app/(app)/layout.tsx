import { AppSidebar } from '@/components/shell/app-sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { AuroraBackground } from '@/components/ui/aurora-background';
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
        {/*
          Two ambient layers behind the main scroll area:
            1. AuroraBackground — soft warm/cool radial-blob wash so the
               canvas has some colour and depth instead of reading as
               flat white. Warm accent hue matches the app's amber ring.
            2. DotPattern on top — very light texture so the surface
               feels like a real material rather than a colour swatch.
          Both are masked to fade toward the bottom of the initial fold
          so content further down sits on the deepened canvas token
          alone. Sidebar + topbar stay solid — the effect is scoped to
          the workspace pane only.
        */}
        <main className="relative flex-1 overflow-y-auto">
          <AuroraBackground className="z-0" />
          <DotPattern
            className={cn(
              'z-0 fill-foreground/[0.055] dark:fill-foreground/[0.06]',
              '[mask-image:linear-gradient(to_bottom,black,transparent_65%)]',
            )}
          />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
