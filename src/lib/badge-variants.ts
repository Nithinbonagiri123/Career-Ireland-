/**
 * Canonical status → badge-variant + human-readable-label mappings.
 *
 * Every table was defining its own `STATUS_VARIANT` and `STATUS_LABEL`
 * const local to the file. When we tweaked one, the others drifted.
 * They all live here now.
 *
 * `variant` is a shadcn Badge variant — one of the string literals the
 * `<Badge />` component accepts. `label` is what appears on-screen.
 *
 * Add a new entity? Append a mapping below. Reading side stays trivial:
 *
 *   <Badge variant={TASK_STATUS[row.status].variant}>
 *     {TASK_STATUS[row.status].label}
 *   </Badge>
 */

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

type BadgeEntry = { variant: BadgeVariant; label: string };

/** Task priority — LOW/NORMAL/HIGH/URGENT. */
export const TASK_PRIORITY: Record<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT', BadgeEntry> = {
  LOW: { variant: 'outline', label: 'Low' },
  NORMAL: { variant: 'secondary', label: 'Normal' },
  HIGH: { variant: 'default', label: 'High' },
  URGENT: { variant: 'destructive', label: 'Urgent' },
};

/** Task status — OPEN/IN_PROGRESS/DONE/CANCELLED. */
export const TASK_STATUS: Record<'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED', BadgeEntry> = {
  OPEN: { variant: 'secondary', label: 'Open' },
  IN_PROGRESS: { variant: 'default', label: 'In progress' },
  DONE: { variant: 'outline', label: 'Done' },
  CANCELLED: { variant: 'outline', label: 'Cancelled' },
};

/** Immigration case status — OPEN → CLOSED lifecycle. */
export const IMMIGRATION_CASE_STATUS: Record<
  | 'OPEN'
  | 'DOCUMENTS_PENDING'
  | 'SUBMITTED'
  | 'UNDER_AUTHORITY_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED',
  BadgeEntry
> = {
  OPEN: { variant: 'secondary', label: 'Open' },
  DOCUMENTS_PENDING: { variant: 'outline', label: 'Documents pending' },
  SUBMITTED: { variant: 'default', label: 'Submitted' },
  UNDER_AUTHORITY_REVIEW: { variant: 'default', label: 'Under review' },
  APPROVED: { variant: 'default', label: 'Approved' },
  REJECTED: { variant: 'destructive', label: 'Rejected' },
  CLOSED: { variant: 'outline', label: 'Closed' },
};

/** Requisition status. */
export const REQUISITION_STATUS: Record<
  | 'DRAFT'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CLOSED'
  | 'CANCELLED',
  BadgeEntry
> = {
  DRAFT: { variant: 'outline', label: 'Draft' },
  OPEN: { variant: 'secondary', label: 'Open' },
  IN_PROGRESS: { variant: 'default', label: 'In progress' },
  PARTIALLY_FILLED: { variant: 'default', label: 'Partially filled' },
  FILLED: { variant: 'default', label: 'Filled' },
  CLOSED: { variant: 'outline', label: 'Closed' },
  CANCELLED: { variant: 'outline', label: 'Cancelled' },
};

/** Document requirement fulfilment status. */
export const REQUIREMENT_STATUS: Record<
  'MISSING' | 'PROVIDED' | 'ACCEPTED' | 'REJECTED',
  BadgeEntry
> = {
  MISSING: { variant: 'outline', label: 'Missing' },
  PROVIDED: { variant: 'secondary', label: 'Provided' },
  ACCEPTED: { variant: 'default', label: 'Accepted' },
  REJECTED: { variant: 'destructive', label: 'Rejected' },
};

/** Employer relationship status. */
export const EMPLOYER_STATUS: Record<
  'PROSPECT' | 'ACTIVE' | 'ON_HOLD' | 'ARCHIVED',
  BadgeEntry
> = {
  PROSPECT: { variant: 'outline', label: 'Prospect' },
  ACTIVE: { variant: 'default', label: 'Active' },
  ON_HOLD: { variant: 'secondary', label: 'On hold' },
  ARCHIVED: { variant: 'outline', label: 'Archived' },
};

/** Campaign status. */
export const CAMPAIGN_STATUS: Record<'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED', BadgeEntry> = {
  DRAFT: { variant: 'outline', label: 'Draft' },
  ACTIVE: { variant: 'default', label: 'Active' },
  COMPLETED: { variant: 'secondary', label: 'Completed' },
  CANCELLED: { variant: 'outline', label: 'Cancelled' },
};

/** Prospect status. */
export const PROSPECT_STATUS: Record<
  'NEW' | 'SCREENED' | 'CONVERTED_TO_CANDIDATE' | 'RETAINED_IN_POOL' | 'NOT_SUITABLE',
  BadgeEntry
> = {
  NEW: { variant: 'secondary', label: 'New' },
  SCREENED: { variant: 'default', label: 'Screened' },
  CONVERTED_TO_CANDIDATE: { variant: 'default', label: 'Converted' },
  RETAINED_IN_POOL: { variant: 'outline', label: 'In pool' },
  NOT_SUITABLE: { variant: 'outline', label: 'Not suitable' },
};
