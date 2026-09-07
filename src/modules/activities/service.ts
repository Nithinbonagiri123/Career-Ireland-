import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type CommunicationLog,
  communicationLogs,
  type Task,
  tasks,
} from '@/lib/db/schema/activities';
import { users } from '@/lib/db/schema/users';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type ArchiveCommunicationInput,
  ArchiveCommunicationSchema,
  type ArchiveTaskInput,
  ArchiveTaskSchema,
  type CreateCommunicationInput,
  CreateCommunicationSchema,
  type CreateTaskInput,
  CreateTaskSchema,
  type UpdateCommunicationInput,
  UpdateCommunicationSchema,
  type UpdateTaskInput,
  UpdateTaskSchema,
  type UpdateTaskStatusInput,
  UpdateTaskStatusSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

function blankToUndef(v: string | undefined | null): string | undefined {
  return v && v.trim().length > 0 ? v : undefined;
}

export type CommunicationRow = CommunicationLog & { staffName: string };
export type TaskRow = Task & { assignedName: string };

export async function fetchRecentCommunications(limit = 50): Promise<CommunicationRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ c: communicationLogs, staffName: users.fullName })
    .from(communicationLogs)
    .innerJoin(users, eq(users.id, communicationLogs.staffUserId))
    .where(isNull(communicationLogs.archivedAt))
    .orderBy(desc(communicationLogs.occurredAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.c, staffName: r.staffName }));
}

export async function fetchTasks(): Promise<TaskRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ t: tasks, assignedName: users.fullName })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.assignedUserId))
    .where(isNull(tasks.archivedAt))
    .orderBy(asc(tasks.status), asc(tasks.dueAt), desc(tasks.createdAt));
  return rows.map((r) => ({ ...r.t, assignedName: r.assignedName }));
}

export async function fetchTasksForImmigrationCase(caseId: string): Promise<TaskRow[]> {
  await requireInternalStaff();
  const rows = await db
    .select({ t: tasks, assignedName: users.fullName })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.assignedUserId))
    .where(and(eq(tasks.immigrationCaseId, caseId), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.status), asc(tasks.dueAt), desc(tasks.createdAt));
  return rows.map((r) => ({ ...r.t, assignedName: r.assignedName }));
}

export async function createCommunication(
  input: CreateCommunicationInput,
): Promise<CommunicationLog> {
  const session = await requireInternalStaff();
  const parsed = CreateCommunicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid communication',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(communicationLogs)
      .values({
        type: d.type,
        direction: d.direction,
        occurredAt: d.occurredAt ? new Date(d.occurredAt) : new Date(),
        staffUserId: session.user.id,
        subject: blankToNull(d.subject),
        body: blankToNull(d.body),
        personId: blankToUndef(d.personId),
        employerId: blankToUndef(d.employerId),
        employerContactId: blankToUndef(d.employerContactId),
        jobRequisitionId: blankToUndef(d.jobRequisitionId),
        serviceEngagementId: blankToUndef(d.serviceEngagementId),
        immigrationCaseId: blankToUndef(d.immigrationCaseId),
        followUpRequired: d.followUpRequired,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'communication_log',
      entityId: created.id,
      action: 'CREATED',
      after: {
        type: created.type,
        subject: created.subject,
        followUpRequired: created.followUpRequired,
      },
    });

    // If follow-up requested, auto-create a task assigned to the staff user.
    if (d.followUpRequired) {
      const [task] = await tx
        .insert(tasks)
        .values({
          title: `Follow up: ${created.subject ?? created.type}`,
          description: created.body,
          assignedUserId: session.user.id,
          priority: 'NORMAL',
          personId: created.personId,
          employerId: created.employerId,
          jobRequisitionId: created.jobRequisitionId,
          serviceEngagementId: created.serviceEngagementId,
          immigrationCaseId: created.immigrationCaseId,
        })
        .returning();
      if (task) {
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'task',
          entityId: task.id,
          action: 'CREATED',
          after: { title: task.title },
          context: { via: 'communication_follow_up', communicationLogId: created.id },
        });
      }
    }

    return created;
  });
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const session = await requireInternalStaff();
  const parsed = CreateTaskSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid task',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(tasks)
      .values({
        title: d.title,
        description: blankToNull(d.description),
        dueAt: d.dueAt ? new Date(d.dueAt) : null,
        assignedUserId: d.assignedUserId,
        priority: d.priority,
        personId: blankToUndef(d.personId),
        employerId: blankToUndef(d.employerId),
        jobRequisitionId: blankToUndef(d.jobRequisitionId),
        serviceEngagementId: blankToUndef(d.serviceEngagementId),
        immigrationCaseId: blankToUndef(d.immigrationCaseId),
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'task',
      entityId: created.id,
      action: 'CREATED',
      after: {
        title: created.title,
        assignedUserId: created.assignedUserId,
        priority: created.priority,
      },
    });
    return created;
  });
}

export async function updateTaskStatus(input: UpdateTaskStatusInput): Promise<Task> {
  const session = await requireInternalStaff();
  const parsed = UpdateTaskStatusSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(tasks).where(eq(tasks.id, parsed.taskId)).limit(1);
    if (!before) throw new BusinessRuleError('TASK_NOT_FOUND', 'Task not found');
    if (before.status === parsed.status) return before;
    const [after] = await tx
      .update(tasks)
      .set({
        status: parsed.status,
        completedAt: parsed.status === 'DONE' ? new Date() : null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(tasks.id, parsed.taskId))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'task',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });
    return after;
  });
}

// ─── Task update + archive ────────────────────────────────────────────────────

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const session = await requireInternalStaff();
  const parsed = UpdateTaskSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(tasks).where(eq(tasks.id, parsed.taskId)).limit(1);
    if (!before) throw new BusinessRuleError('TASK_NOT_FOUND', 'Task not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ARCHIVED', 'Archived tasks cannot be edited');
    }
    const [after] = await tx
      .update(tasks)
      .set({
        title: parsed.title.trim(),
        description: blankToNull(parsed.description),
        dueAt: blankToUndef(parsed.dueAt) ? new Date(parsed.dueAt as string) : null,
        assignedUserId: parsed.assignedUserId,
        priority: parsed.priority,
        updatedAt: sql`NOW()`,
      })
      .where(eq(tasks.id, parsed.taskId))
      .returning();
    if (!after) throw new Error('task update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'task',
      entityId: after.id,
      action: 'UPDATED',
      before: {
        title: before.title,
        priority: before.priority,
        assignedUserId: before.assignedUserId,
        dueAt: before.dueAt,
      },
      after: {
        title: after.title,
        priority: after.priority,
        assignedUserId: after.assignedUserId,
        dueAt: after.dueAt,
      },
    });
    return after;
  });
}

export async function archiveTask(input: ArchiveTaskInput): Promise<Task> {
  const session = await requireInternalStaff();
  const parsed = ArchiveTaskSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(tasks).where(eq(tasks.id, parsed.taskId)).limit(1);
    if (!before) throw new BusinessRuleError('TASK_NOT_FOUND', 'Task not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Task is already archived');
    }
    const [after] = await tx
      .update(tasks)
      .set({
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        updatedAt: sql`NOW()`,
      })
      .where(eq(tasks.id, parsed.taskId))
      .returning();
    if (!after) throw new Error('task archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'task',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

// ─── Communication update + archive ───────────────────────────────────────────

export async function updateCommunication(
  input: UpdateCommunicationInput,
): Promise<CommunicationLog> {
  const session = await requireInternalStaff();
  const parsed = UpdateCommunicationSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(communicationLogs)
      .where(eq(communicationLogs.id, parsed.communicationId))
      .limit(1);
    if (!before) throw new BusinessRuleError('COMM_NOT_FOUND', 'Communication not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ARCHIVED', 'Archived communications cannot be edited');
    }
    const [after] = await tx
      .update(communicationLogs)
      .set({
        type: parsed.type,
        direction: parsed.direction,
        occurredAt: blankToUndef(parsed.occurredAt)
          ? new Date(parsed.occurredAt as string)
          : before.occurredAt,
        subject: blankToNull(parsed.subject),
        body: blankToNull(parsed.body),
        followUpRequired: parsed.followUpRequired,
        updatedAt: sql`NOW()`,
      })
      .where(eq(communicationLogs.id, parsed.communicationId))
      .returning();
    if (!after) throw new Error('communication update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'communication_log',
      entityId: after.id,
      action: 'UPDATED',
      before: {
        subject: before.subject,
        type: before.type,
        direction: before.direction,
      },
      after: {
        subject: after.subject,
        type: after.type,
        direction: after.direction,
      },
    });
    return after;
  });
}

export async function archiveCommunication(
  input: ArchiveCommunicationInput,
): Promise<CommunicationLog> {
  const session = await requireInternalStaff();
  const parsed = ArchiveCommunicationSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(communicationLogs)
      .where(eq(communicationLogs.id, parsed.communicationId))
      .limit(1);
    if (!before) throw new BusinessRuleError('COMM_NOT_FOUND', 'Communication not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Communication is already archived');
    }
    const [after] = await tx
      .update(communicationLogs)
      .set({
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        updatedAt: sql`NOW()`,
      })
      .where(eq(communicationLogs.id, parsed.communicationId))
      .returning();
    if (!after) throw new Error('comm archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'communication_log',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}
