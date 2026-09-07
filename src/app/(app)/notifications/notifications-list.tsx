'use client';

import { formatDistanceToNow } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  Clock,
  MailQuestion,
  PlaneTakeoff,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Notification } from '@/lib/db/schema/notifications';
import { cn } from '@/lib/utils';
import { markAllReadAction, markNotificationReadAction } from '@/modules/notifications/actions';

const ICONS: Record<Notification['category'], LucideIcon> = {
  AD_EXPIRING: Sparkles,
  IMMIGRATION_EXPIRING: PlaneTakeoff,
  TASK_OVERDUE: Clock,
  PAYMENT_PENDING: MailQuestion,
  FOLLOW_UP_DUE: AlertCircle,
};

/**
 * Visual tone per notification category. Read against globals.css status
 * tokens rather than raw Tailwind colours so light + dark stay coherent.
 */
const CATEGORY_TONE: Record<Notification['category'], 'warning' | 'danger' | 'info'> = {
  AD_EXPIRING: 'warning',
  IMMIGRATION_EXPIRING: 'warning',
  TASK_OVERDUE: 'danger',
  PAYMENT_PENDING: 'warning',
  FOLLOW_UP_DUE: 'info',
};

const CATEGORY_LABEL: Record<Notification['category'], string> = {
  AD_EXPIRING: 'Ad expiring',
  IMMIGRATION_EXPIRING: 'Immigration expiring',
  TASK_OVERDUE: 'Task overdue',
  PAYMENT_PENDING: 'Payment pending',
  FOLLOW_UP_DUE: 'Follow-up due',
};

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const [items, setItems] = useState(notifications);
  const [pending, startTransition] = useTransition();
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const markAll = () => {
    startTransition(async () => {
      const r = await markAllReadAction();
      if (r.ok) {
        setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })));
        toast.success(`Marked ${r.data.updated} read`);
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const dismissOne = (n: Notification, e: React.MouseEvent) => {
    // Prevent the wrapping <Link> from firing when clicking the button.
    e.preventDefault();
    e.stopPropagation();
    setDismissingId(n.id);
    startTransition(async () => {
      const r = await markNotificationReadAction({ notificationId: n.id });
      setDismissingId(null);
      if (r.ok) {
        setItems((prev) =>
          prev.map((it) => (it.id === n.id && !it.readAt ? { ...it, readAt: new Date() } : it)),
        );
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const unread = items.filter((n) => !n.readAt).length;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No notifications"
        description="The daily cron generates alerts for expiring ads/permits, overdue tasks, and pending payments."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {items.length} total ·{' '}
          <span className="font-medium text-foreground">{unread} unread</span>
        </div>
        <Button variant="outline" size="sm" disabled={pending || unread === 0} onClick={markAll}>
          <CheckCheck className="mr-1.5 size-3.5" /> Mark all read
        </Button>
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {items.map((n) => {
          const Icon = ICONS[n.category] ?? Bell;
          const dismissBtn = !n.readAt && (
            <button
              type="button"
              onClick={(e) => dismissOne(n, e)}
              disabled={dismissingId === n.id}
              className="ml-2 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
              aria-label={`Dismiss "${n.title}"`}
              title="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          );
          const tone = CATEGORY_TONE[n.category] ?? 'info';
          const inner = (
            <div
              className={cn(
                'group relative flex items-start gap-3 p-3 transition-colors',
                !n.readAt && 'bg-muted/25',
              )}
            >
              {/* Unread indicator strip on the leading edge — subtle but
                  unmistakable at a glance. */}
              {!n.readAt && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-2 left-0 w-0.5 rounded-full',
                    tone === 'danger' && 'bg-status-danger',
                    tone === 'warning' && 'bg-status-warning',
                    tone === 'info' && 'bg-status-info',
                  )}
                />
              )}
              <div
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                  tone === 'danger' && 'bg-status-danger-soft text-status-danger',
                  tone === 'warning' && 'bg-status-warning-soft text-status-warning',
                  tone === 'info' && 'bg-status-info-soft text-status-info',
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{n.title}</span>
                  <Badge variant={tone} className="rounded-full">
                    {CATEGORY_LABEL[n.category] ?? n.category.replace(/_/g, ' ')}
                  </Badge>
                </div>
                {n.body && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                </p>
              </div>
              {dismissBtn}
            </div>
          );
          return (
            <li key={n.id}>
              {n.href ? (
                <Link href={n.href} className="block transition-colors hover:bg-muted/40">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
