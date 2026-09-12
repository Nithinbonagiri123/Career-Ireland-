'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Separator } from '@/components/ui/separator';
import type { Business } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { BusinessSwitcher } from './business-switcher';
import { USER_SCOPED_ITEMS, WORKSPACES } from './nav-config';

/**
 * Workspace-scoped sidebar. Renders the sections for the currently-
 * selected workspace only, filtered by the user's granted permissions
 * (owner sees everything). See `src/lib/workspace.ts` for how the
 * current workspace is resolved server-side, and
 * `src/components/shell/business-switcher.tsx` for the switch flow.
 *
 * User-scoped items (My attendance, Security) always render at the
 * bottom regardless of workspace — they're per-user, not per-business.
 */
export function AppSidebar({
  workspace,
  reachable,
  visibleModules,
}: {
  workspace: Business;
  reachable: Business[];
  /**
   * Set of `<business>.<module>` keys the user is allowed to view. The
   * sidebar filters items in the current workspace against this set.
   * For the owner, pass a Set containing every possible key (or use
   * the `bypassPermissions` flag below).
   */
  visibleModules: Set<string>;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const config = WORKSPACES[workspace];

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — trigger only on pathname change
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (!active) return;
    const navRect = nav.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();
    const fullyVisible = itemRect.top >= navRect.top && itemRect.bottom <= navRect.bottom;
    if (!fullyVisible) {
      active.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [pathname]);

  const visibleSections = config.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => visibleModules.has(`${workspace}.${item.module}`)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
      <Link
        href={config.landingPath}
        className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5"
        aria-label="Ireland Career Gateway home"
      >
        <Image
          src="/logo-mark.png"
          alt=""
          width={620}
          height={600}
          priority
          className="size-8 object-contain"
        />
        <div className="text-sm font-semibold leading-tight tracking-tight text-sidebar-foreground">
          Ireland Career
          <br />
          <span className="text-muted-foreground">Gateway</span>
        </div>
      </Link>

      <div className="mt-3">
        <BusinessSwitcher current={workspace} reachable={reachable} />
      </div>

      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-2">
        {visibleSections.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            No modules in this workspace yet.
          </p>
        ) : (
          visibleSections.map((section, sectionIdx) => (
            <div key={section.label} className={cn(sectionIdx > 0 && 'mt-6')}>
              <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {section.label}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        data-nav-active={active ? 'true' : 'false'}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          active && 'text-sidebar-foreground',
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-0 rounded-md bg-sidebar-accent"
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                          />
                        )}
                        <item.icon className="relative size-4 shrink-0" />
                        <span className="relative">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {sectionIdx < visibleSections.length - 1 && <Separator className="mt-4 opacity-50" />}
            </div>
          ))
        )}
      </nav>

      {/* User-scoped items — always visible regardless of workspace. */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <ul className="space-y-0.5">
          {USER_SCOPED_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  data-nav-active={active ? 'true' : 'false'}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    active && 'text-sidebar-foreground',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active-user"
                      className="absolute inset-0 rounded-md bg-sidebar-accent"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <item.icon className="relative size-4 shrink-0" />
                  <span className="relative">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
