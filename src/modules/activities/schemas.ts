import { z } from 'zod';

const OptUuid = z.string().uuid().optional().or(z.literal(''));

export const CreateCommunicationSchema = z
  .object({
    type: z.enum(['EMAIL', 'PHONE', 'MEETING', 'INTERNAL_NOTE', 'OTHER']),
    direction: z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']),
    occurredAt: z.string().datetime().optional().or(z.literal('')),
    subject: z.string().max(255).optional().or(z.literal('')),
    body: z.string().max(10000).optional().or(z.literal('')),
    personId: OptUuid,
    employerId: OptUuid,
    employerContactId: OptUuid,
    jobRequisitionId: OptUuid,
    serviceEngagementId: OptUuid,
    immigrationCaseId: OptUuid,
    followUpRequired: z.boolean(),
  })
  .refine(
    (v) =>
      Boolean(
        v.personId ||
          v.employerId ||
          v.employerContactId ||
          v.jobRequisitionId ||
          v.serviceEngagementId ||
          v.immigrationCaseId,
      ),
    { message: 'Communication must reference at least one subject', path: ['personId'] },
  );

export const CreateTaskSchema = z
  .object({
    title: z.string().min(2).max(255),
    description: z.string().max(4000).optional().or(z.literal('')),
    dueAt: z.string().datetime().optional().or(z.literal('')),
    assignedUserId: z.string().uuid(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    personId: OptUuid,
    employerId: OptUuid,
    jobRequisitionId: OptUuid,
    serviceEngagementId: OptUuid,
    immigrationCaseId: OptUuid,
  })
  .refine(
    (v) =>
      Boolean(
        v.personId ||
          v.employerId ||
          v.jobRequisitionId ||
          v.serviceEngagementId ||
          v.immigrationCaseId,
      ),
    { message: 'Task must reference at least one subject', path: ['personId'] },
  );

export const UpdateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
});

export const UpdateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(2).max(255),
  description: z.string().max(4000).optional().or(z.literal('')),
  dueAt: z.string().datetime().optional().or(z.literal('')),
  assignedUserId: z.string().uuid(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
});

export const ArchiveTaskSchema = z.object({
  taskId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UpdateCommunicationSchema = z.object({
  communicationId: z.string().uuid(),
  type: z.enum(['EMAIL', 'PHONE', 'MEETING', 'INTERNAL_NOTE', 'OTHER']),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']),
  occurredAt: z.string().datetime().optional().or(z.literal('')),
  subject: z.string().max(255).optional().or(z.literal('')),
  body: z.string().max(10000).optional().or(z.literal('')),
  followUpRequired: z.boolean(),
});

export const ArchiveCommunicationSchema = z.object({
  communicationId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type CreateCommunicationInput = z.infer<typeof CreateCommunicationSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type ArchiveTaskInput = z.infer<typeof ArchiveTaskSchema>;
export type UpdateCommunicationInput = z.infer<typeof UpdateCommunicationSchema>;
export type ArchiveCommunicationInput = z.infer<typeof ArchiveCommunicationSchema>;
