import { formatDistanceToNowStrict } from 'date-fns';
import {
  Archive,
  ArrowRightLeft,
  CheckCircle2,
  Coins,
  FileCheck2,
  FilePlus,
  FileX,
  ListPlus,
  type LucideIcon,
  MessagesSquare,
  Pencil,
  PlaneTakeoff,
  RefreshCcw,
  ShieldCheck,
  Trophy,
  UserPlus,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';
import type { ActivityRow } from '@/modules/dashboard/activity';

/**
 * Rows are already filtered + limited server-side. Icon + tone are
 * looked up here per (entityType, action) so the feed reads as
 * "candidate created", "payment verified", "case rejected" rather than
 * raw audit strings. Anything unmapped falls back to a neutral icon.
 */
type MetaEntry = { icon: LucideIcon; label: string; tone: StatusTone };

const ACTION_META: Record<string, MetaEntry> = {
  CREATED: { icon: FilePlus, label: 'created', tone: 'info' },
  UPDATED: { icon: Pencil, label: 'updated', tone: 'neutral' },
  DELETED: { icon: FileX, label: 'deleted', tone: 'danger' },
  ARCHIVED: { icon: Archive, label: 'archived', tone: 'neutral' },
  UNARCHIVED: { icon: RefreshCcw, label: 'restored', tone: 'info' },
  ACCEPTED: { icon: CheckCircle2, label: 'accepted', tone: 'success' },
  REJECTED: { icon: XCircle, label: 'rejected', tone: 'danger' },
  DISMISSED: { icon: XCircle, label: 'dismissed', tone: 'neutral' },
  SHORTLISTED: { icon: ListPlus, label: 'shortlisted', tone: 'info' },
  STATUS_CHANGED: { icon: ArrowRightLeft, label: 'status changed', tone: 'info' },
  LIFECYCLE_CHANGED: { icon: ArrowRightLeft, label: 'lifecycle updated', tone: 'info' },
  AVAILABILITY_CHANGED: { icon: ArrowRightLeft, label: 'availability changed', tone: 'info' },
  CONVERTED: { icon: ArrowRightLeft, label: 'converted', tone: 'success' },
  ISSUED: { icon: FileCheck2, label: 'issued', tone: 'info' },
  RECORDED: { icon: Wallet, label: 'recorded', tone: 'info' },
  DRAFT_CREATED: { icon: FilePlus, label: 'draft started', tone: 'neutral' },
  DRAFT_DISCARDED: { icon: FileX, label: 'draft discarded', tone: 'neutral' },
  MERGED_INTO: { icon: ArrowRightLeft, label: 'merged', tone: 'neutral' },
  ROLE_CHANGED: { icon: ShieldCheck, label: 'role changed', tone: 'info' },
  PASSWORD_ROTATED: { icon: ShieldCheck, label: 'password rotated', tone: 'info' },
  PASSWORD_REVEALED: { icon: ShieldCheck, label: 'password revealed', tone: 'warning' },
};

const ENTITY_ICON: Record<string, LucideIcon> = {
  person: UserPlus,
  candidate: UserPlus,
  lead: UserPlus,
  employer: Trophy,
  requisition: Trophy,
  job_requisition: Trophy,
  application: FileCheck2,
  job_application: FileCheck2,
  placement: Trophy,
  invoice: Coins,
  payment: Coins,
  immigration: PlaneTakeoff,
  immigration_case: PlaneTakeoff,
  communication: MessagesSquare,
};

function humaniseEntity(entityType: string): string {
  return entityType.replace(/_/g, ' ');
}

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
        Nothing has happened yet. Activity from the whole workspace shows up here.
      </div>
    );
  }

  return (
    <ol className="relative rounded-lg border bg-card">
      {rows.map((r, idx) => {
        const meta = ACTION_META[r.action] ?? {
          icon: Pencil,
          label: r.action.toLowerCase().replace(/_/g, ' '),
          tone: 'neutral' as const,
        };
        const Icon = ENTITY_ICON[r.entityType] ?? meta.icon;
        const isLast = idx === rows.length - 1;
        return (
          <li key={r.id} className={cn('flex gap-3 px-4 py-3', !isLast && 'border-b')}>
            <div
              className={cn(
                'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
                meta.tone === 'success' && 'bg-status-success-soft text-status-success',
                meta.tone === 'info' && 'bg-status-info-soft text-status-info',
                meta.tone === 'warning' && 'bg-status-warning-soft text-status-warning',
                meta.tone === 'danger' && 'bg-status-danger-soft text-status-danger',
                meta.tone === 'neutral' && 'bg-muted/60 text-muted-foreground',
              )}
            >
              <Icon aria-hidden className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs">
                <span className="font-medium">{r.actorName ?? 'System'}</span>{' '}
                <span className="text-muted-foreground">{meta.label}</span>{' '}
                <span className="font-medium">{humaniseEntity(r.entityType)}</span>
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {formatDistanceToNowStrict(r.occurredAt, { addSuffix: true })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
