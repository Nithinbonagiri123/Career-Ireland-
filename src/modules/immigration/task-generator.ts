import { and, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { recordAudit } from '@/lib/audit/withAudit';
import { tasks } from '@/lib/db/schema/activities';
import type { ImmigrationCase } from '@/lib/db/schema/immigration';

type CaseStatus = ImmigrationCase['status'];

type TaskTemplate = {
  /** Stable title — used for idempotency (skip if an open task with the same title exists on this case). */
  title: string;
  description: string;
  dueInDays: number;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
};

/** Tasks that fire once when a case is first created. */
const CASE_CREATED_TASKS: TaskTemplate[] = [
  {
    title: 'Confirm required documents with beneficiary',
    description:
      'Kick off the case: send the beneficiary the required-documents checklist and confirm receipt within 48 hours.',
    dueInDays: 2,
    priority: 'HIGH',
  },
];

/** Tasks that fire when a case transitions INTO the given status. */
const STATUS_TRIGGERED_TASKS: Partial<Record<CaseStatus, TaskTemplate[]>> = {
  DOCUMENTS_PENDING: [
    {
      title: 'Chase missing documents from beneficiary',
      description: 'Follow up on outstanding documents on the case requirements checklist.',
      dueInDays: 5,
      priority: 'HIGH',
    },
    {
      title: 'Prepare submission package',
      description:
        'Assemble the full submission package (forms + supporting docs) once documents arrive.',
      dueInDays: 14,
      priority: 'NORMAL',
    },
  ],
  SUBMITTED: [
    {
      title: 'Follow up with authority',
      description:
        'Confirm the authority has acknowledged the submission and note the case reference.',
      dueInDays: 21,
      priority: 'NORMAL',
    },
  ],
  UNDER_AUTHORITY_REVIEW: [
    {
      title: 'Check authority progress',
      description: 'Chase the authority for a decision update if there has been no response.',
      dueInDays: 30,
      priority: 'LOW',
    },
  ],
  APPROVED: [
    {
      title: 'Notify beneficiary of approval + confirm start date',
      description:
        'Send approval notice, forward decision letter, and confirm start / travel arrangements.',
      dueInDays: 2,
      priority: 'HIGH',
    },
  ],
  REJECTED: [
    {
      title: 'Review rejection reason + advise appeal path',
      description:
        'Review the decision, explain grounds to the beneficiary, and advise on appeal or reapplication.',
      dueInDays: 3,
      priority: 'URGENT',
    },
  ],
};

/** Task that fires when a case has an expires-on date within 30 days. Called on upsert. */
const EXPIRY_REMINDER: TaskTemplate = {
  title: 'Case expires soon — renew or close',
  description:
    'Case expiry approaching. Confirm renewal path with beneficiary and employer, or formally close.',
  dueInDays: 0, // due date computed from expiresOn - 30d
  priority: 'HIGH',
};

async function insertIfMissing(
  tx: DbExecutor,
  caseId: string,
  template: TaskTemplate,
  args: {
    actorUserId: string;
    assignedUserId: string;
    dueAt: Date;
    auditContext?: Record<string, unknown>;
  },
): Promise<boolean> {
  const [existing] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.immigrationCaseId, caseId),
        eq(tasks.title, template.title),
        inArray(tasks.status, ['OPEN', 'IN_PROGRESS']),
      ),
    )
    .limit(1);
  if (existing) return false;

  const [row] = await tx
    .insert(tasks)
    .values({
      title: template.title,
      description: template.description,
      dueAt: args.dueAt,
      priority: template.priority,
      status: 'OPEN',
      immigrationCaseId: caseId,
      assignedUserId: args.assignedUserId,
    })
    .returning();
  if (!row) return false;

  await recordAudit(tx, {
    actorUserId: args.actorUserId,
    entityType: 'task',
    entityId: row.id,
    action: 'CREATED',
    after: {
      title: row.title,
      immigrationCaseId: caseId,
      dueAt: row.dueAt,
      priority: row.priority,
    },
    context: { via: 'auto:immigration', ...args.auditContext },
  });
  return true;
}

/**
 * Auto-generate the standard set of case tasks for a given trigger. Idempotent:
 * skips any template whose title already has an OPEN or IN_PROGRESS task on the same case.
 *
 * `assignedUserId` fallback chain: case.assignedUserId → actorUserId. Tasks require a
 * non-null assignee (schema constraint), so the actor is the final fallback.
 */
export async function generateCaseTasks(
  tx: DbExecutor,
  args: {
    caseId: string;
    trigger: 'CREATED' | CaseStatus;
    actorUserId: string;
    caseAssignedUserId: string | null;
  },
): Promise<{ created: number }> {
  const templates =
    args.trigger === 'CREATED' ? CASE_CREATED_TASKS : (STATUS_TRIGGERED_TASKS[args.trigger] ?? []);
  if (templates.length === 0) return { created: 0 };

  const assignedUserId = args.caseAssignedUserId ?? args.actorUserId;
  const now = new Date();

  let created = 0;
  for (const t of templates) {
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + t.dueInDays);
    const inserted = await insertIfMissing(tx, args.caseId, t, {
      actorUserId: args.actorUserId,
      assignedUserId,
      dueAt,
      auditContext: { trigger: args.trigger },
    });
    if (inserted) created++;
  }
  return { created };
}

/**
 * Fire the expiry-reminder task 30 days before `expiresOn`. Idempotent; recomputes
 * the due date each time so a rescheduled expiry moves the reminder along.
 */
export async function ensureExpiryReminder(
  tx: DbExecutor,
  args: {
    caseId: string;
    expiresOn: string; // date string YYYY-MM-DD
    actorUserId: string;
    caseAssignedUserId: string | null;
  },
): Promise<{ created: boolean }> {
  const expiry = new Date(args.expiresOn);
  if (Number.isNaN(expiry.getTime())) return { created: false };
  const dueAt = new Date(expiry);
  dueAt.setDate(dueAt.getDate() - 30);
  // Never schedule in the past — bump to now.
  const now = new Date();
  if (dueAt < now) dueAt.setTime(now.getTime());

  const inserted = await insertIfMissing(tx, args.caseId, EXPIRY_REMINDER, {
    actorUserId: args.actorUserId,
    assignedUserId: args.caseAssignedUserId ?? args.actorUserId,
    dueAt,
    auditContext: { trigger: 'expiry_reminder', expiresOn: args.expiresOn },
  });
  return { created: inserted };
}
