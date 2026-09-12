'use client';

import { Bell, KeyRound, LogOut, Menu, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import type { UserRole } from '@/lib/db/schema/users';
import { signOutAction } from '@/modules/auth/actions';
import { AppSidebar } from './app-sidebar';
import { GlobalSearch } from './global-search';

export type TopBarUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

function initialsFromName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function TopBar({
  user,
  unreadNotifications = 0,
  workspace,
  reachable,
  visibleModules,
}: {
  user: TopBarUser;
  unreadNotifications?: number;
  workspace: import('@/lib/auth/permissions').Business;
  reachable: import('@/lib/auth/permissions').Business[];
  visibleModules: Set<string>;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
      <Sheet>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />
          }
        >
          <Menu className="size-4" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar workspace={workspace} reachable={reachable} visibleModules={visibleModules} />
        </SheetContent>
      </Sheet>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/notifications"
          aria-label={`Notifications${unreadNotifications > 0 ? ` (${unreadNotifications} unread)` : ''}`}
          className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent/50"
        >
          <Bell className="size-4" />
          {unreadNotifications > 0 && (
            <Badge
              variant="default"
              className="absolute -right-0.5 -top-0.5 size-4 min-w-0 justify-center rounded-full p-0 text-[9px] leading-none"
            >
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </Badge>
          )}
        </Link>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Account" className="rounded-full" />
            }
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                {initialsFromName(user.name)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">{user.name}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
                <Badge variant="secondary" className="mt-1 w-fit rounded-full text-[10px]">
                  {user.role}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserIcon className="mr-2 size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/account/security')}>
              <KeyRound className="mr-2 size-4" /> Change password
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
  );
}
