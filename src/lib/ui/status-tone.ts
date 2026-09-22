import type { StatusTone } from '@/components/ui/status-dot';

/**
 * Central enum-status → visual-tone map. Tables and detail pages import
 * this instead of reinventing colour mappings inline. Add new enums here
 * so the palette stays under one roof — if you find a status that isn't
 * listed, treat it as `neutral` and add it to the map rather than picking
 * a colour ad-hoc.
 *
 * Tones map to <Badge variant> and <StatusDot tone> from the status
 * palette in globals.css.
 */
const TONE_MAP: Record<string, StatusTone> = {
  // Candidate availability
  AVAILABLE: 'success',
  TEMPORARILY_UNAVAILABLE: 'warning',
  PLACED: 'info',

  // Candidate lifecycle
  ACTIVE: 'success',
  ONBOARDING: 'info',
  RETIRED: 'neutral',
  MERGED: 'neutral',
  ARCHIVED: 'neutral',

  // Task / activity
  OPEN: 'info',
  IN_PROGRESS: 'info',
  DONE: 'success',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  ON_HOLD: 'warning',

  // Task priority
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',

  // Application / match / shortlist
  APPLIED: 'info',
  UNDER_REVIEW: 'info',
  SHORTLISTED: 'info',
  INTERVIEW: 'info',
  INTERVIEWED: 'info',
  OFFER: 'success',
  OFFERED: 'success',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  DISMISSED: 'neutral',

  // Offer lifecycle
  SENT: 'info',
  NEGOTIATING: 'info',
  EXPIRED: 'neutral',

  // Interview
  SCHEDULED: 'info',
  NO_SHOW: 'danger',
  RESCHEDULED: 'warning',

  // Interview outcome
  PASS: 'success',
  FAIL: 'danger',
  HOLD: 'warning',

  // Placement
  PROPOSED: 'info',
  CONFIRMED: 'success',
  STARTED: 'info',
  TERMINATED_EARLY: 'danger',

  // Requisition
  DRAFT: 'neutral',
  PARTIALLY_FILLED: 'warning',
  FILLED: 'success',
  CLOSED: 'neutral',

  // Immigration
  DOCUMENTS_PENDING: 'warning',
  SUBMITTED: 'info',
  UNDER_AUTHORITY_REVIEW: 'info',
  APPROVED: 'success',

  // Payment / invoice / receipt
  PENDING: 'warning',
  PROOF_UPLOADED: 'info',
  VERIFIED: 'success',
  ISSUED: 'info',
  PAID: 'success',
  VOIDED: 'danger',
  FAILED: 'danger',
  REFUNDED: 'neutral',

  // Engagement
  REQUESTED: 'info',
  PENDING_PAYMENT: 'warning',

  // Employer / lead / prospect
  PROSPECT: 'info',
  NEW: 'info',
  CONTACTED: 'info',
  AWAITING_PAYMENT: 'warning',
  CONVERTED: 'success',
  LOST: 'danger',

  // Document review
  MISSING: 'warning',
  PROVIDED: 'info',

  // Notification / read state
  UNREAD: 'info',
  READ: 'neutral',

  // Upload request state
  REVOKED: 'danger',

  // Generic revoke label used in link-history rows
  ACTIVE_LINK: 'success',
};

export function statusTone(status: string): StatusTone {
  return TONE_MAP[status] ?? 'neutral';
}
