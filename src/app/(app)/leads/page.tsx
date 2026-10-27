import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock3, PhoneCall, UserPlus, Users } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { FadeUp } from '@/components/motion/motion-primitives';
import { ScopeFilter } from '@/components/scope-filter';
import { requireAnyPermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import type { Lead } from '@/lib/db/schema/leads';
import { parseAssignmentScope } from '@/lib/scope';
import { cn } from '@/lib/utils';
import { resolveCurrentWorkspace } from '@/lib/workspace';
import { fetchInvoiceableServicesFor } from '@/modules/billing/read';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchLeads } from '@/modules/leads/service';
import { fetchOccupations } from '@/modules/occupations/service';
import { CreateLeadDialog } from './create-lead-dialog';
import { LeadsInlineFilterBar } from './leads-filter-bar';
import { LeadsTable } from './leads-table';

/** Workspace → lead target business. `main` returns undefined so the
 *  Main dashboard view keeps showing every lead across all three lines. */
function targetBusinessForWorkspace(ws: string): Lead['targetBusiness'] | undefined {
  if (ws === 'candidate_services') return 'CANDIDATE_SERVICES';
  if (ws === 'recruitment') return 'RECRUITMENT';
  if (ws === 'immigration') return 'IMMIGRATION';
  return undefined;
}

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string; created?: string; from?: string; to?: string }>;
}) {
  // R0 — leads serve every workspace; the recruitment sidebar used to
  // demand the candidate-services grant.
  const session = await requireAnyPermission([
    { business: 'candidate_services', module: 'leads', verb: 'view' },
    { business: 'recruitment', module: 'leads', verb: 'view' },
    { business: 'main', module: 'leads', verb: 'view' },
  ]);
  const { assigned, created, from, to } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  const workspace = await resolveCurrentWorkspace();
  const targetBusiness = workspace ? targetBusinessForWorkspace(workspace.current) : undefined;
  const [leads, invoiceableServices, currencies, occupations] = await Promise.all([
    fetchLeads(scope, createdRange, targetBusiness),
    fetchInvoiceableServicesFor('PERSON'),
    fetchCurrencies(),
    fetchOccupations(),
  ]);

  const totalCount = leads.length;
  const convertedCount = leads.filter((l) => l.status === 'CONVERTED').length;
  const contactedCount = leads.filter((l) => l.status === 'CONTACTED').length;
  const awaitingPaymentCount = leads.filter((l) => l.status === 'AWAITING_PAYMENT').length;
  const newCount = leads.filter((l) => l.status === 'NEW').length;

  // Unique assignees + nationalities for the inline filter chip
  // dropdowns. Derived from the current result set so the dropdowns
  // only offer values the operator can actually match.
  const assigneeMap = new Map<string, string>();
  for (const l of leads) {
    if (l.assignedUserId && l.assignedUserName && !assigneeMap.has(l.assignedUserId)) {
      assigneeMap.set(l.assignedUserId, l.assignedUserName);
    }
  }
  const assignees = Array.from(assigneeMap.entries())
    .map(([id, fullName]) => ({ id, fullName }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const nationalities = Array.from(
    new Set(
      leads
        .map((l) => l.personNationality ?? l.personCountry)
        .filter((v): v is string => Boolean(v)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="relative">
      {/* Stage 6G Screen 01 — soft-blue hero band matching the
          approved mockup. Hero carries only the title + the two
          primary actions (Download CSV + New lead). Date range and
          scope filters moved into the inline filter row below so
          the hero stays uncluttered. */}
      <section
        aria-label="Leads header"
        className="relative overflow-hidden rounded-b-3xl bg-gradient-to-br from-sky-200/70 via-sky-100/40 to-background px-4 pb-6 pt-8 sm:px-6 md:px-10"
      >
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-note-yellow text-note-yellow-ink shadow-sm ring-1 ring-black/5"
              >
                <UserPlus className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Leads</h1>
                <p className="mt-1 max-w-2xl text-sm text-foreground/70">
                  {targetBusiness === 'RECRUITMENT'
                    ? 'Employer enquiries. Qualify, assign and convert into an employer profile and requisition — no payment required to convert.'
                    : 'Every candidate begins as a Lead. Convert via verified payment or a staff manual override (audited).'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <CsvExportButton href="/api/export/leads" />
              <CreateLeadDialog
                invoiceableServices={invoiceableServices}
                currencies={currencies}
                occupations={occupations.map((o) => ({
                  id: o.id,
                  name: o.name,
                  isActive: o.isActive,
                }))}
              />
            </div>
          </div>

          {/* 4 KPI tiles — Total · Converted · Contacted · Awaiting
              Payment. Compact variant that matches the approved
              mockup's proportions (number dominant, label small,
              hint even smaller). */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              icon={Users}
              label="Total leads"
              value={totalCount}
              hint="Every lead on file"
              tone="blue"
            />
            <KpiTile
              icon={CheckCircle2}
              label="Converted"
              value={convertedCount}
              hint="Successfully converted"
              tone="green"
            />
            <KpiTile
              icon={PhoneCall}
              label="Contacted"
              value={contactedCount + newCount}
              hint="In active discussion"
              tone="amber"
            />
            <KpiTile
              icon={Clock3}
              label="Awaiting Payment"
              value={awaitingPaymentCount}
              hint="Quote accepted, awaiting funds"
              tone="rose"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-5 sm:px-6 md:px-10">
        {/* Scope filter (mine / all / unassigned) — preserved from
            the previous build. Sits above the inline chip row so the
            operator still has the three-way toggle without hunting
            through a dropdown. */}
        <FadeUp delay={0.03}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <ScopeFilter current={scope} />
            <DateRangeFilter />
          </div>
        </FadeUp>
        {/* Inline filter chip bar — Search + Status + Assigned to +
            Created + Nationality + More Filters. Matches the mockup's
            placement above the table. */}
        <FadeUp delay={0.04}>
          <LeadsInlineFilterBar
            countries={nationalities}
            occupations={occupations.map((o) => ({ id: o.id, name: o.name }))}
            assignees={assignees}
          />
        </FadeUp>

        {scope === 'mine' && leads.length === 0 && (
          <FadeUp delay={0.06}>
            <EmptyMineNudge resourceLabel="leads" seeAllHref="/leads?assigned=all" />
          </FadeUp>
        )}
        <FadeUp delay={0.08}>
          <div className="mt-4">
            <LeadsTable
              leads={leads}
              currentUserId={session.user.id}
              currentUserRole={session.user.role}
              invoiceableServices={invoiceableServices}
              occupations={occupations.map((o) => ({ id: o.id, name: o.name }))}
              countries={Array.from(
                new Set(leads.map((l) => l.personCountry).filter((c): c is string => Boolean(c))),
              ).sort((a, b) => a.localeCompare(b))}
            />
          </div>
        </FadeUp>
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<'blue' | 'green' | 'amber' | 'rose', string> = {
  blue: 'bg-sky-500 text-white',
  green: 'bg-emerald-500 text-white',
  amber: 'bg-amber-500 text-white',
  rose: 'bg-rose-500 text-white',
};

/**
 * Stage 6G Screen 01 — compact KPI tile. Icon medallion on the
 * left, big number + small label on the right, hint underneath.
 */
function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone: 'blue' | 'green' | 'amber' | 'rose';
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/90 px-4 py-3 shadow-sm ring-1 ring-border/60">
      <span
        className={cn('grid size-9 shrink-0 place-items-center rounded-full', TONE_CLASSES[tone])}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-semibold leading-none tabular-nums text-foreground">{value}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
