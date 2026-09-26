'use client';

import { MapPin, Phone, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import type { Person } from '@/lib/db/schema/persons';

/**
 * Read-only summary card shown alongside PersonPicker once a person is
 * selected. Purpose: prove to the operator that they picked the right
 * record — email, phone, location visible without navigating away.
 *
 * The user's request phrased it as 'copy and paste the details' — this
 * is the softer version: the details are visible + one click takes you
 * to the full profile in a new tab. Data stays canonical on the person
 * record (no duplication into the case) — the spec's core §3 invariant.
 */
export function PersonPreviewCard({ person }: { person: Person }) {
  const fullName = `${person.firstName} ${person.lastName}`.trim();
  const location = [person.currentCity, person.currentCountry].filter(Boolean).join(', ');
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
            <UserIcon className="size-3.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{fullName}</p>
            {person.email && (
              <p className="truncate text-[11px] text-muted-foreground">{person.email}</p>
            )}
          </div>
        </div>
        <Link
          href={`/candidates/${person.id}`}
          target="_blank"
          className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          Open profile ↗
        </Link>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {person.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3" /> {person.phone}
          </span>
        )}
        {location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" /> {location}
          </span>
        )}
        {person.nationality && (
          <span className="inline-flex items-center gap-1">🌐 {person.nationality}</span>
        )}
        {!person.phone && !location && !person.nationality && (
          <span className="italic text-muted-foreground/60">
            No contact or location on file — add from the candidate profile.
          </span>
        )}
      </div>
    </div>
  );
}
