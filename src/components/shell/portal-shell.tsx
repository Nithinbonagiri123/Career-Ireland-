'use client';

import { LogOut, User as UserIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { signOutAction } from '@/modules/auth/actions';

type NavLink = { label: string; href: string };

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/**
 * Simpler shell for portal users. Top bar with brand, primary nav, and account menu.
 * No sidebar — portals are shallow enough that horizontal nav is enough.
 */
export function PortalShell({
  user,
  links,
  workspaceLabel,
  children,
}: {
  user: { name: string; email: string; role: 'CANDIDATE' | 'EMPLOYER' };
  links: NavLink[];
  workspaceLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [signingOut, startSignOut] = useTransition();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-6 border-b bg-background/80 px-4 backdrop-blur-md md:px-8">
        <div className="flex items-center gap-2">
          <Image
            src="/logo-mark.png"
            alt=""
            width={620}
            height={600}
            priority
            className="size-8 object-contain"
          />
          <div className="text-sm font-semibold tracking-tight">
            Ireland Career Gateway <span className="text-muted-foreground">·</span>{' '}
            <span className="text-muted-foreground">{workspaceLabel}</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground',
                  active && 'bg-accent/50 text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Account" className="rounded-full" />
              }
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <UserIcon className="mr-2 size-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={signingOut}
                onClick={() => startSignOut(() => signOutAction())}
              >
                <LogOut className="mr-2 size-4" />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <nav className="flex items-center gap-1 border-b px-4 pb-3 pt-2 md:hidden overflow-x-auto">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground',
                active && 'bg-accent/50 text-foreground',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
