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

  // Task / activity
  OPEN: 'info',
  IN_PROGRESS: 'info',
  DONE: 'success',
  CANCELLED: 'neutral',

  // Task priority
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',

  // Application / match / shortlist
  APPLIED: 'info',
  SHORTLISTED: 'info',
  INTERVIEWED: 'info',
  OFFERED: 'success',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  DISMISSED: 'neutral',

  // Requisition
  DRAFT: 'neutral',
  PARTIALLY_FILLED: 'warning',
  FILLED: 'success',
  CLOSED: 'neutral',

  // Payment / invoice / receipt
  PENDING: 'warning',
  VERIFIED: 'success',
  ISSUED: 'info',
  PAID: 'success',
  VOIDED: 'danger',
  FAILED: 'danger',
  REFUNDED: 'neutral',

  // Document review
  MISSING: 'warning',
  PROVIDED: 'info',

  // Notification / read state
  UNREAD: 'info',
  READ: 'neutral',
};

export function statusTone(status: string): StatusTone {
  return TONE_MAP[status] ?? 'neutral';
}
