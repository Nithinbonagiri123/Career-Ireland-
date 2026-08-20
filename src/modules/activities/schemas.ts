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

export type CreateCommunicationInput = z.infer<typeof CreateCommunicationSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusSchema>;
