// Full implementation lands when audit_events table exists (Milestone 5.2).
// Kept as an interface so services can already call it and be swapped later.

export interface AuditContext {
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  context?: Record<string, unknown>;
  revertsEventId?: string;
}

export async function recordAudit(_ctx: AuditContext): Promise<void> {
  // No-op until Milestone 5.2 wires up the audit_events table.
}
