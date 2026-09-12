'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Business } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { switchWorkspaceAction } from '@/modules/workspace/actions';
import { WORKSPACES } from './nav-config';

/**
 * Dropdown that lets the user switch between workspaces they have
 * access to. Sits directly under the brand mark in the sidebar.
 *
 * When the user picks a workspace we call a server action that:
 *  1. Writes an httpOnly cookie so subsequent renders resolve fast
 *  2. Persists the choice on `users.current_workspace`
 *  3. Redirects to that workspace's default landing page
 *
 * The list is filtered by the caller (server-side) to only include
 * workspaces the user can reach, so we never render an option that
 * would 403.
 */
export function BusinessSwitcher({
  current,
  reachable,
}: {
  current: Business;
  reachable: Business[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const currentConfig = WORKSPACES[current];
  const CurrentIcon = currentConfig.icon;

  const pick = (next: Business) => {
    if (next === current) {
      setOpen(false);
      return;
    }
    startTransition(() => {
      switchWorkspaceAction(next);
    });
  };

  return (
    <div ref={containerRef} className="relative mx-3 mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Switch workspace"
        disabled={pending || reachable.length <= 1}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar px-2.5 py-1.5 text-left text-xs transition-colors',
          !pending && reachable.length > 1 && 'hover:bg-sidebar-accent/50',
          pending && 'opacity-70',
          reachable.length <= 1 && 'cursor-default',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CurrentIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium text-sidebar-foreground">
            {currentConfig.label}
          </span>
        </span>
        {reachable.length > 1 && (
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-sidebar-border bg-popover shadow-lg ring-1 ring-foreground/10"
          >
            {reachable.map((key) => {
              const w = WORKSPACES[key];
              const Icon = w.icon;
              const isCurrent = key === current;
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => pick(key)}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition-colors',
                      isCurrent
                        ? 'bg-accent/50 text-foreground'
                        : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                    )}
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{w.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {w.description}
                      </span>
                    </span>
                    {isCurrent && (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
