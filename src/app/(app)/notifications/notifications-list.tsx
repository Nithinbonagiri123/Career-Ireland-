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
} from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Notification } from '@/lib/db/schema/notifications';
import { cn } from '@/lib/utils';
import { markAllReadAction } from '@/modules/notifications/actions';

const ICONS: Record<Notification['category'], LucideIcon> = {
  AD_EXPIRING: Sparkles,
  IMMIGRATION_EXPIRING: PlaneTakeoff,
  TASK_OVERDUE: Clock,
  PAYMENT_PENDING: MailQuestion,
  FOLLOW_UP_DUE: AlertCircle,
};

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const [items, setItems] = useState(notifications);
  const [pending, startTransition] = useTransition();

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
          const inner = (
            <div className={cn('flex items-start gap-3 p-3', !n.readAt && 'bg-muted/30')}>
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{n.title}</span>
                  {!n.readAt && (
                    <Badge variant="default" className="rounded-full text-[10px]">
                      New
                    </Badge>
                  )}
                </div>
                {n.body && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {n.category.replace(/_/g, ' ')} ·{' '}
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                </p>
              </div>
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
