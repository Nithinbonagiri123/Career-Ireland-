'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS } from './nav-config';

export function AppSidebar() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // If the newly-active item is scrolled out of view (either because it
  // sits below the fold, or the sidebar was previously scrolled), bring
  // it back into view. We only nudge when necessary — persisting the
  // sidebar's scroll position across page transitions is otherwise the
  // desired behaviour.
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

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
      <Link
        href="/dashboard"
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

      <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section, sectionIdx) => (
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
            {sectionIdx < NAV_SECTIONS.length - 1 && <Separator className="mt-4 opacity-50" />}
          </div>
        ))}
      </nav>
    </aside>
  );
}
