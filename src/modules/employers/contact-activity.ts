/**
 * Plain-English Activity lines for employer-contact audit events, e.g.
 * "Bob Smith added as primary contact (replaced Alice Primary)".
 *
 * Reads the before/after/context the contact service writes. Older events
 * (written before names and replacements were recorded) still get a sensible
 * line from whatever fields they have.
 */

type Snapshot = { fullName?: unknown; isPrimary?: unknown } | null | undefined;
type Context =
  | {
      via?: unknown;
      replacedPrimary?: unknown;
      replacedBy?: unknown;
      leftWithoutPrimary?: unknown;
    }
  | null
  | undefined;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function names(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x : str((x as { fullName?: unknown })?.fullName)))
    .filter((x): x is string => Boolean(x));
}

/** "A", "A and B", "A, B and C". */
export function joinNames(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function describeContactEvent(
  action: string,
  before: unknown,
  after: unknown,
  context: unknown,
): string {
  const b = (before ?? null) as Snapshot;
  const a = (after ?? null) as Snapshot;
  const c = (context ?? null) as Context;
  const name = str(a?.fullName) ?? str(b?.fullName) ?? 'A contact';
  const replaced = names(c?.replacedPrimary);
  const replacedSuffix = replaced.length ? ` (replaced ${joinNames(replaced)})` : '';

  if (action === 'CREATED') {
    if (!str(a?.fullName)) return 'Contact added';
    return a?.isPrimary === true
      ? `${name} added as primary contact${replacedSuffix}`
      : `${name} added as a contact`;
  }

  if (action === 'DELETED') {
    if (b?.isPrimary === true) {
      return c?.leftWithoutPrimary === true
        ? `${name} (primary contact) removed — no primary contact now`
        : `${name} (primary contact) removed`;
    }
    return `${name} removed from contacts`;
  }

  if (action === 'UPDATED') {
    if (c?.via === 'primary_contact_change') {
      const by = str((c.replacedBy as { fullName?: unknown } | undefined)?.fullName);
      return by
        ? `${name} is no longer the primary contact (replaced by ${by})`
        : `${name} is no longer the primary contact`;
    }
    const oldName = str(b?.fullName);
    const renamed = oldName && str(a?.fullName) && oldName !== str(a?.fullName);
    const prefix = renamed ? `${oldName} renamed to ${name}` : null;
    if (b?.isPrimary === false && a?.isPrimary === true) {
      return `${prefix ? `${prefix}; ` : `${name} `}made primary contact${replacedSuffix}`;
    }
    if (b?.isPrimary === true && a?.isPrimary === false) {
      return `${prefix ? `${prefix}; ` : `${name} `}is no longer the primary contact — no primary contact now`;
    }
    return prefix ?? `${name}'s contact details updated`;
  }

  return `Contact ${name} ${action.replace(/_/g, ' ').toLowerCase()}`;
}
