import type { AuditEventWithActor } from '@/modules/audit/repository';

/**
 * Turn a raw audit row into a single human-readable sentence. Written
 * for the audit-log table so an owner reading the log sees "Signed in
 * from Chrome on macOS · 127.0.0.1" instead of a wall of key=value
 * JSON.
 *
 * Strategy:
 *   1. Explicit templates for events an owner will look at often
 *      (session, permissions, exports, documents, HR, applications,
 *      matching).
 *   2. A default template `"<verb> a <entity name>"` for everything
 *      else, so a new module wiring up recordAudit still produces a
 *      readable line without a code change here.
 *
 * Every string is deterministic and takes no dependency on the raw
 * JSON payload shape beyond what the corresponding recordAudit call
 * site writes — if a field is missing we degrade to a shorter sentence
 * rather than throw or render `undefined`.
 */

const ENTITY_LABELS: Record<string, string> = {
  session: 'session',
  data_export: 'data export',
  document_instance: 'document',
  user_permission: 'permissions',
  attendance_session: 'attendance record',
  attendance_break_session: 'break',
  job_application: 'application',
  job_requisition: 'requisition',
  candidate_profile: 'candidate profile',
  candidate_match: 'match',
  candidate_qualification: 'candidate qualification',
  candidate_skill: 'candidate skill',
  candidate_email_account: 'candidate email account',
  candidate_document_requirement: 'document requirement',
  document_requirement_rule: 'document requirement rule',
  document_type: 'document type',
  person: 'person',
  employer: 'employer',
  employer_contact: 'employer contact',
  employment_history: 'employment history',
  immigration_case: 'immigration case',
  placement: 'placement',
  advertisement: 'advertisement',
  recruitment_campaign: 'campaign',
  service_catalog_item: 'service',
  service_package: 'service package',
  service_engagement: 'engagement',
  communication_log: 'communication',
  currency: 'currency',
  occupation: 'occupation',
  occupation_category: 'occupation category',
  qualification: 'qualification',
  skill: 'skill',
  staff_profile: 'staff profile',
  shortlist_entry: 'shortlist entry',
  task: 'task',
  invoice: 'invoice',
  receipt: 'receipt',
  payment: 'payment',
};

const ACTION_VERBS: Record<string, string> = {
  CREATED: 'Created',
  UPDATED: 'Updated',
  DELETED: 'Deleted',
  ARCHIVED: 'Archived',
  UNARCHIVED: 'Unarchived',
  UPLOADED: 'Uploaded',
  DOWNLOADED: 'Downloaded',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  SHORTLISTED: 'Shortlisted',
  DISMISSED: 'Dismissed',
  RESCHEDULED: 'Rescheduled',
  ISSUED: 'Issued',
  VERIFIED: 'Verified',
  VOIDED: 'Voided',
  CONVERTED: 'Converted',
  RECORDED: 'Recorded',
  GRANTED: 'Granted',
  REVOKED: 'Revoked',
  ROLE_CHANGED: 'Changed the role of',
  STATUS_CHANGED: 'Changed the status of',
  LIFECYCLE_CHANGED: 'Moved lifecycle of',
  AVAILABILITY_CHANGED: 'Changed availability of',
  PASSWORD_ROTATED: 'Rotated the password for',
  DRAFT_CREATED: 'Drafted',
  DRAFT_DISCARDED: 'Discarded the draft of',
  SKILL_ATTACHED: 'Attached a skill to',
  SKILL_DETACHED: 'Removed a skill from',
  QUALIFICATION_ATTACHED: 'Attached a qualification to',
  QUALIFICATION_DETACHED: 'Removed a qualification from',
  DOCUMENT_ATTACHED: 'Attached a document to',
  DOCUMENT_DETACHED: 'Removed a document from',
  REQUIREMENTS_MATERIALIZED: 'Generated document requirements for',
  MATCHING_RUN: 'Ran matching for',
  MERGED_INTO: 'Merged into another',
};

function labelEntity(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, ' ');
}

function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * Trim a full user-agent header down to the browser + OS the owner
 * actually cares about. Never throws — an unrecognisable UA becomes
 * "unknown browser".
 */
function humaniseUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'unknown browser';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : 'unknown browser';
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
      ? 'Android'
      : /Mac OS X/i.test(ua)
        ? 'macOS'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'unknown OS';
  return `${browser} on ${os}`;
}

function ctxString(ctx: unknown, key: string): string | null {
  if (!ctx || typeof ctx !== 'object') return null;
  const v = (ctx as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : null;
}

function ctxNumber(ctx: unknown, key: string): number | null {
  if (!ctx || typeof ctx !== 'object') return null;
  const v = (ctx as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : null;
}

/**
 * Turn one audit row into a human sentence. The audit page's
 * `<AuditTable />` calls this in the Details column.
 */
export function describeEvent(row: AuditEventWithActor): string {
  const { entityType, action, context, before, after } = row;

  // ── Session events ──────────────────────────────────────────────
  if (entityType === 'session') {
    if (action === 'LOGIN') {
      const ip = ctxString(context, 'ip') ?? 'unknown IP';
      const ua = humaniseUserAgent(ctxString(context, 'userAgent'));
      return `Signed in from ${ua} · ${ip}`;
    }
    if (action === 'LOGOUT') {
      const ip = ctxString(context, 'ip');
      return ip ? `Signed out · ${ip}` : 'Signed out';
    }
    if (action === 'AUTH_DENIED') {
      const reason = ctxString(context, 'reason');
      const path = ctxString(context, 'path');
      if (reason === 'permission') {
        const business = ctxString(context, 'business');
        const mod = ctxString(context, 'module');
        const verb = ctxString(context, 'verb');
        const scope =
          business && mod && verb ? `${business}.${mod}.${verb}` : 'a restricted action';
        return path
          ? `Denied access to ${path} — needs ${scope}`
          : `Denied access — needs ${scope}`;
      }
      if (reason === 'role') {
        const actual = ctxString(context, 'actual');
        return path
          ? `Denied access to ${path} — role ${actual} not allowed`
          : `Denied access — role ${actual} not allowed`;
      }
      return path ? `Denied access to ${path}` : 'Denied access';
    }
  }

  // ── Data exports ────────────────────────────────────────────────
  if (entityType === 'data_export' && action === 'EXPORTED') {
    const resource = ctxString(context, 'resource');
    const rows = ctxNumber(context, 'rowCount');
    if (resource && rows !== null) {
      return `Downloaded ${resource} — ${rows} row${rows === 1 ? '' : 's'}`;
    }
    return resource ? `Downloaded ${resource}` : 'Downloaded a CSV export';
  }

  // ── Documents ───────────────────────────────────────────────────
  if (entityType === 'document_instance') {
    if (action === 'DOWNLOADED') return 'Opened a document';
    if (action === 'UPLOADED') return 'Uploaded a new document version';
    if (action === 'DELETED') return 'Deleted a document';
  }

  // ── Permissions ─────────────────────────────────────────────────
  if (entityType === 'user_permission') {
    if (action === 'GRANTED') {
      const count = (after as { count?: number } | null)?.count;
      return count !== undefined
        ? `Granted ${count} permission${count === 1 ? '' : 's'}`
        : 'Granted permissions';
    }
    if (action === 'REVOKED') {
      const count = (before as { count?: number } | null)?.count;
      return count !== undefined
        ? `Revoked ${count} permission${count === 1 ? '' : 's'}`
        : 'Revoked permissions';
    }
    if (action === 'RESET_TO_ROLE') {
      const role = (after as { role?: string } | null)?.role;
      const count = (after as { count?: number } | null)?.count;
      if (role && count !== undefined) return `Reset permissions to the ${role} preset (${count})`;
      if (role) return `Reset permissions to the ${role} preset`;
      return 'Reset permissions to preset';
    }
  }

  // ── HR ──────────────────────────────────────────────────────────
  if (entityType === 'attendance_session') {
    if (action === 'CREATED') return 'Clocked in';
    if (action === 'STATUS_CHANGED') {
      const closed = (after as { clockOutAt?: unknown } | null)?.clockOutAt;
      if (closed) return 'Clocked out';
      return 'Updated an attendance record';
    }
    if (action === 'UPDATED') return 'Corrected an attendance record';
  }
  if (entityType === 'attendance_break_session') {
    if (action === 'CREATED') return 'Started a break';
    if (action === 'STATUS_CHANGED') {
      const closed = (after as { breakEndedAt?: unknown } | null)?.breakEndedAt;
      if (closed) return 'Ended a break';
    }
  }

  // ── Applications / recruitment ──────────────────────────────────
  if (entityType === 'job_application') {
    if (action === 'CREATED') return 'Created a new application';
    if (action === 'STATUS_CHANGED') return 'Moved an application through the funnel';
    if (action === 'SHORTLISTED') return 'Shortlisted a candidate';
    if (action === 'REJECTED') return 'Rejected an application';
  }
  if (entityType === 'candidate_match' && action === 'MATCHING_RUN') {
    const scored = ctxNumber(context, 'candidatesScored');
    const upserted = ctxNumber(context, 'upserted');
    if (scored !== null && upserted !== null) {
      return `Ran matching — ${scored} candidates scored, ${upserted} matches saved`;
    }
    return 'Ran matching';
  }
  if (entityType === 'shortlist_entry' && action === 'CREATED') {
    return 'Added a candidate to a shortlist';
  }
  if (entityType === 'placement') {
    if (action === 'CREATED') return 'Created a placement';
    if (action === 'STATUS_CHANGED') return 'Changed a placement status';
  }
  if (entityType === 'advertisement') {
    if (action === 'CREATED') return 'Created an advertisement';
    if (action === 'STATUS_CHANGED') return 'Changed an advertisement status';
    if (action === 'ARCHIVED') return 'Archived an advertisement';
  }
  if (entityType === 'recruitment_campaign' && action === 'CREATED') return 'Started a campaign';

  // ── Candidate lifecycle ─────────────────────────────────────────
  if (entityType === 'candidate_profile') {
    if (action === 'CREATED') return 'Created a candidate profile';
    if (action === 'LIFECYCLE_CHANGED') return 'Changed a candidate lifecycle stage';
    if (action === 'AVAILABILITY_CHANGED') return 'Changed a candidate availability';
    if (action === 'DRAFT_DISCARDED') return 'Discarded a candidate draft';
    if (action === 'REQUIREMENTS_MATERIALIZED') return 'Generated document requirements';
  }

  // ── Commerce ────────────────────────────────────────────────────
  if (entityType === 'service_engagement' && action === 'CREATED') return 'Created an engagement';
  if (entityType === 'invoice') {
    if (action === 'ISSUED') return 'Issued an invoice';
    if (action === 'VOIDED') return 'Voided an invoice';
  }
  if (entityType === 'payment' && action === 'VERIFIED') return 'Verified a payment';

  // ── Fallback: "<verb> a <entity>" ───────────────────────────────
  const entity = labelEntity(entityType);
  const verb = ACTION_VERBS[action];
  if (verb) {
    // Some verbs already end with a preposition and expect an object.
    if (
      action === 'ROLE_CHANGED' ||
      action === 'STATUS_CHANGED' ||
      action === 'LIFECYCLE_CHANGED' ||
      action === 'AVAILABILITY_CHANGED' ||
      action === 'PASSWORD_ROTATED' ||
      action === 'MATCHING_RUN' ||
      action === 'REQUIREMENTS_MATERIALIZED' ||
      action === 'SKILL_ATTACHED' ||
      action === 'SKILL_DETACHED' ||
      action === 'QUALIFICATION_ATTACHED' ||
      action === 'QUALIFICATION_DETACHED' ||
      action === 'DOCUMENT_ATTACHED' ||
      action === 'DOCUMENT_DETACHED'
    ) {
      return `${verb} ${articleFor(entity)} ${entity}`;
    }
    if (action === 'MERGED_INTO') return `Merged into another ${entity}`;
    // Plain "Verb a entity" — Created a job requisition, Uploaded a document, etc.
    return `${verb} ${articleFor(entity)} ${entity}`;
  }

  // Unknown action — degrade to a title-cased phrase.
  const words = action.toLowerCase().replace(/_/g, ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${articleFor(entity)} ${entity}`;
}
