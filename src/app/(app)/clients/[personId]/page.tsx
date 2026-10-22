import { format } from 'date-fns';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Briefcase,
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Coins,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plane,
  Receipt,
  Scroll,
  ShieldCheck,
  UserCheck,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApplicationsPanel } from '@/app/(app)/candidates/[id]/applications-panel';
import {
  EducationSection,
  EmploymentHistorySection,
  QualificationDialog,
  QualificationsSection,
  SkillsSection,
} from '@/app/(app)/candidates/[id]/candidate-details-panel';
import { JustCreatedCard } from '@/app/(app)/candidates/[id]/just-created-card';
import {
  RecordPaymentDialog,
  VerifyPaymentButton,
} from '@/app/(app)/leads/[id]/pro-formas/record-payment-dialog';
import { RefundPaymentButton } from '@/app/(app)/leads/[id]/pro-formas/refund-payment-dialog';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { EditPersonDialog } from '@/components/edit-person-dialog';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusDot } from '@/components/ui/status-dot';
import { requireInternalStaff } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/currency';
import type { EducationEntry, EmploymentHistory } from '@/lib/db/schema/candidate_details';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import type { Occupation } from '@/lib/db/schema/occupations';
import type { DocumentType, Qualification, Skill } from '@/lib/db/schema/reference';
import {
  flagEmojiFromCountryName,
  flagEmojiFromNationality,
  IRISH_IMMIGRATION_STATUSES,
  workEligibilityLabel,
} from '@/lib/iso-countries';
import { statusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';
import type { CommunicationRow } from '@/modules/activities/service';
import type { CandidateApplicationRow } from '@/modules/applications/service';
import { canGrantComplimentary } from '@/modules/billing/complimentary';
import type {
  CandidateQualificationRow,
  CandidateSkillRow,
} from '@/modules/candidate-details/service';
import {
  derivePrimaryOnboardingStatus,
  PRIMARY_STATUS_LABEL,
  PRIMARY_STATUS_TONE,
} from '@/modules/clients/onboarding-status';
import { derivePaymentState } from '@/modules/clients/payment-state';
import { fetchClientWorkspace, fetchJustCreatedDocNumbers } from '@/modules/clients/workspace-data';
import { type CandidateNote, CandidateNotesCard } from './candidate-notes-card';
import { ClientWorkspaceTabs } from './client-workspace-tabs';
import { CandidateDocsTab } from './docs-tab';
import { ClientNextActionIsland } from './next-action-island';
import { NewQuoteButton, QuoteActionsRow } from './quote-actions-row';
import {
  type ActiveServiceRow,
  type ServiceHistoryRow,
  ServicesBillingTab,
} from './services-billing-tab';

export const dynamic = 'force-dynamic';

const LEAD_LABEL: Record<string, string> = {
  NEW: 'New enquiry',
  CONTACTED: 'Contacted',
  // Stage 6F — this used to read "Quote accepted — awaiting payment"
  // which duplicated the payment state. The lead's job is to track
  // intake; payment state lives on the pro-forma / invoice / payment
  // rows and is now surfaced via the single derived primary onboarding
  // status in the workspace header.
  AWAITING_PAYMENT: 'Quote accepted',
  CONVERTED: 'Active client',
  LOST: 'Lost',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  ARCHIVED: 'Archived',
};

const PF_LABEL: Record<string, string> = {
  DRAFT: 'Draft quote',
  ISSUED: 'Quote issued',
  ACCEPTED: 'Client accepted',
  CONVERTED: 'Paid — invoice issued',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  SUPERSEDED: 'Replaced',
};

const INVOICE_LABEL: Record<string, string> = {
  ISSUED: 'Awaiting payment',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  VOIDED: 'Voided',
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: 'Not yet confirmed',
  PROOF_UPLOADED: 'Proof received — awaiting confirmation',
  VERIFIED: 'Payment received',
  REJECTED: 'Rejected',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Fully refunded',
};

export default async function ClientWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ tab?: string; just_created?: string }>;
}) {
  const { personId } = await params;
  const sp = await searchParams;
  // Post-onboarding success banner — /candidates/new redirects here with
  // ?just_created=1; quick links to the freshly issued invoice + receipt.
  const justCreated = sp.just_created === '1' ? await fetchJustCreatedDocNumbers(personId) : null;
  // Stage 6G — needed by the hero's "Assign to me" / "Reassign" buttons.
  const session = await requireInternalStaff();
  // Stage 6G — five tabs: Overview (default) · Profile · Documents & CV ·
  // Applications · Activity. The Overview tab is a read-mostly 3-column
  // card grid matching the reference image; Profile keeps the richer
  // editing panels. Legacy `?tab=billing` + `?tab=documents` still
  // land coherently via the client-side scroll effect in
  // ClientWorkspaceTabs.
  const activeTab = (() => {
    const raw = sp.tab ?? 'overview';
    if (raw === 'billing' || raw === 'documents') return 'overview';
    return raw;
  })();
  const data = await fetchClientWorkspace(personId);
  if (!data) notFound();

  // Stage 6D Wave 2 — lazy load operational tab data by active tab so
  // the workspace page's base cost stays small. Applications +
  // documents only load when their tabs are the current view; Billing
  // / Activity / Overview use the always-loaded workspace data.
  // Stage 6F — the "profile" tab loads skills/quals/employment/
  // education + reference catalogues + occupation list; the
  // "documents-candidate" tab loads docs + requirements + document-
  // type catalogue so the full DocumentsSection + CvSuggestionsPanel
  // can render.
  const [
    applications,
    documents,
    _requirements,
    docTypes,
    skillRows,
    qualificationRows,
    employmentRows,
    educationRows,
    allSkills,
    allQualifications,
    occupations,
    noteRows,
    employerRows,
  ] = await Promise.all([
    // Overview also needs applications + documents counts for the
    // new summary cards; load them for both tabs so the cards populate
    // without a round-trip when the user lands on Overview.
    activeTab === 'applications' || activeTab === 'overview'
      ? import('@/modules/applications/service').then((m) => m.listApplicationsForPerson(personId))
      : Promise.resolve([] as const),
    activeTab === 'documents-candidate' || activeTab === 'overview'
      ? import('@/modules/documents/service').then((m) => m.fetchPersonDocuments(personId))
      : Promise.resolve([] as const),
    activeTab === 'documents-candidate'
      ? import('@/modules/documents/service').then((m) => m.fetchPersonRequirements(personId))
      : Promise.resolve([] as const),
    activeTab === 'documents-candidate'
      ? import('@/modules/document-types/service').then((m) => m.fetchDocumentTypes())
      : Promise.resolve([] as const),
    activeTab === 'profile' || activeTab === 'overview'
      ? import('@/modules/candidate-details/service').then((m) => m.listCandidateSkills(personId))
      : Promise.resolve([] as const),
    activeTab === 'profile' || activeTab === 'overview'
      ? import('@/modules/candidate-details/service').then((m) =>
          m.listCandidateQualifications(personId),
        )
      : Promise.resolve([] as const),
    activeTab === 'profile' || activeTab === 'overview'
      ? import('@/modules/candidate-details/service').then((m) => m.listEmploymentHistory(personId))
      : Promise.resolve([] as const),
    activeTab === 'profile' || activeTab === 'overview'
      ? import('@/modules/candidate-details/service').then((m) => m.listEducationEntries(personId))
      : Promise.resolve([] as const),
    activeTab === 'profile' || activeTab === 'overview'
      ? import('@/modules/skills/service').then((m) => m.fetchSkills())
      : Promise.resolve([] as const),
    activeTab === 'profile' || activeTab === 'overview'
      ? import('@/modules/qualifications/service').then((m) => m.fetchQualifications())
      : Promise.resolve([] as const),
    activeTab === 'profile' || activeTab === 'overview'
      ? import('@/modules/occupations/service').then((m) => m.fetchOccupations())
      : Promise.resolve([] as const),
    // Stage B Wave 3 — internal notes for the Overview Notes card.
    activeTab === 'overview'
      ? import('@/modules/activities/service').then((m) => m.fetchPersonNotes(personId))
      : Promise.resolve([] as const),
    // Stage C workflow collapse — employer options for recording an
    // external application from the Applications tab.
    activeTab === 'applications'
      ? import('@/modules/employers/service').then((m) => m.fetchEmployers())
      : Promise.resolve([] as const),
  ]);

  const {
    person,
    occupationName,
    candidateProfile,
    assignedUserName,
    leads,
    proFormas,
    invoices,
    payments,
    balance,
    nextAction,
  } = data;

  const fullName = `${person.firstName} ${person.lastName}`.trim();
  const location = [person.currentCity, person.currentCountry].filter(Boolean).join(', ');
  const liveLead = leads.find((l) => l.status !== 'ARCHIVED') ?? leads[0] ?? null;
  const csLeadForActivation = leads.find(
    (l) =>
      l.targetBusiness === 'CANDIDATE_SERVICES' &&
      l.status !== 'ARCHIVED' &&
      l.status !== 'CONVERTED',
  );

  // Stage 6G — ONE derived primary status drives the hero's green/amber
  // status chip. Detailed per-record statuses still live on the service
  // billing rows (per quote, per invoice, per payment).
  // Stage B Wave 4 — may this user grant complimentary (€0.00) services?
  // Mirrors the server gate in grantComplimentaryService exactly.
  const canComplimentary = await canGrantComplimentary();
  const primaryStatus = derivePrimaryOnboardingStatus({
    candidateProfile,
    // Stage B Wave 3 — progress sub-states for an activated candidate.
    // Engagement statuses come from real, non-archived service_engagements
    // rows; availabilityStatus (on candidateProfile) is Recruitment's
    // placement mirror and is never written from Candidate Services.
    engagements: data.engagementStatuses,
    leads,
    proFormas,
    payments,
  });
  // Nationality is a demonym ("Indian") but legacy rows may hold a
  // country name ("India") — try both so the flag renders either way.
  const nationalityFlag =
    flagEmojiFromNationality(person.nationality) || flagEmojiFromCountryName(person.nationality);
  const residenceFlag = flagEmojiFromCountryName(person.currentCountry);
  const initials = initialsFromName(fullName);

  // Stage 6G hero — candidate header matching the approved mockup:
  // flat page background (no band), breadcrumb top-left, blue avatar
  // circle, name + status pill, a flat divider-separated contact row,
  // a pill-badge context row, and the action cluster pinned top-right.
  const hero = (
    <section aria-label="Candidate header" className="pt-1">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link href="/candidates" className="hover:text-foreground hover:underline">
          Candidates
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-foreground">{fullName}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 lg:flex-nowrap">
        <div className="flex min-w-0 items-start gap-5">
          <span
            aria-hidden
            className="grid size-20 shrink-0 place-items-center rounded-full bg-sky-100 text-2xl font-semibold text-sky-700 ring-1 ring-sky-200/70"
          >
            {initials}
          </span>
          <div className="min-w-0 space-y-3">
            {/* Stage 6G Screen 04 — name + primary status pill inline so
                the operator sees the onboarding state the moment they
                land on the record (matches the mockup's "Active candidate"
                treatment: large name + rounded green pill with dot). */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">
                {fullName}
              </h1>
              <Badge
                variant={PRIMARY_STATUS_TONE[primaryStatus]}
                className="shrink-0 rounded-full border-transparent px-3 py-1 text-xs"
                title="Primary onboarding status — derived from the authoritative lead, quote, payment and candidate records."
              >
                <span
                  className={cn(
                    'mr-1.5 inline-block size-2 rounded-full',
                    primaryStatus === 'ACTIVE_CANDIDATE'
                      ? 'bg-status-success'
                      : 'bg-current opacity-70',
                  )}
                  aria-hidden
                />
                {PRIMARY_STATUS_LABEL[primaryStatus]}
              </Badge>
            </div>
            {/* Mockup row 1 — flat contact line (NOT pills): icon + value
                items separated by thin vertical dividers. Each item
                collapses out when the field is empty so the row never
                shows a hanging divider. */}
            <HeroMetaRow>
              {person.email && (
                <HeroMetaItem icon={Mail} title="Email">
                  {person.email}
                </HeroMetaItem>
              )}
              {person.phone && (
                <HeroMetaItem icon={Phone} title="Phone">
                  {person.phone}
                </HeroMetaItem>
              )}
              {location && (
                <HeroMetaItem icon={MapPin} title="Current location">
                  {location}
                </HeroMetaItem>
              )}
              {person.nationality && (
                <HeroMetaItem title="Nationality" prefix={nationalityFlag}>
                  {person.nationality}
                </HeroMetaItem>
              )}
            </HeroMetaRow>
            {/* Stage 6G Screen 04 (v3) — professional-context pill row.
                Matches the mockup's second metadata line: profession ·
                years of experience · immigration · assigned-to · active
                since. These were previously scattered across three
                different render blocks; consolidated here so the hero
                reads as two tidy badge rows. */}
            <HeroPillRow>
              {occupationName && (
                <HeroPill icon={Briefcase} title="Primary profession">
                  {occupationName}
                </HeroPill>
              )}
              {candidateProfile?.yearsOfExperience && (
                <HeroPill icon={CalendarCheck} title="Years of experience">
                  {candidateProfile.yearsOfExperience} experience
                </HeroPill>
              )}
              {person.irishImmigrationStatus &&
                person.irishImmigrationStatus !== 'NOT_PROVIDED' && (
                  <HeroPill icon={Plane} title="Irish immigration status">
                    {/* Short form of the catalog label — the mockup pill
                        reads "Not currently in Ireland", not the full
                        "… / no Irish immigration permission" text. */}
                    {
                      (
                        IRISH_IMMIGRATION_STATUSES.find(
                          (s) => s.value === person.irishImmigrationStatus,
                        )?.label ?? person.irishImmigrationStatus
                      ).split(' / ')[0]
                    }
                  </HeroPill>
                )}
              {assignedUserName && (
                <HeroPill icon={UserCheck} title="Assigned to">
                  Assigned to <span className="font-medium">{assignedUserName}</span>
                </HeroPill>
              )}
              {candidateProfile && (
                <HeroPill icon={Clock3} title="Active since">
                  Active since {format(candidateProfile.activatedAt, 'd MMM yyyy')}
                </HeroPill>
              )}
              {candidateProfile && candidateProfile.availabilityStatus !== 'AVAILABLE' && (
                <HeroPill title="Availability">
                  <StatusDot tone={statusTone(candidateProfile.availabilityStatus)} />
                  <span className="ml-1">
                    {candidateProfile.availabilityStatus === 'TEMPORARILY_UNAVAILABLE'
                      ? 'Unavailable'
                      : 'Placed'}
                  </span>
                </HeroPill>
              )}
              {balance.byCurrency.map((c) => (
                <HeroPill
                  key={c.currencyCode}
                  icon={Coins}
                  title={`${c.verified} ${c.currencyCode} received of ${c.agreed} agreed`}
                  tone={Number.parseFloat(c.outstanding) > 0 ? 'warning' : 'success'}
                >
                  {Number.parseFloat(c.outstanding) > 0
                    ? `${formatCurrency(c.outstanding, c.currencyCode)} owed`
                    : `${formatCurrency(c.agreed, c.currencyCode)} settled`}
                </HeroPill>
              ))}
            </HeroPillRow>
          </div>
        </div>
        {/* Right-side action cluster — matches the mockup's four-button
            layout: generous ghost Edit / Assign / Record payment buttons
            and primary Open workspace (routes to Services & Billing where
            the detailed engagement + payment actions live). Default-size
            buttons so they match the mockup's larger pill proportions. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <EditPersonDialog
            person={person}
            candidateProfile={candidateProfile}
            occupations={(occupations as Occupation[]).map((o) => ({
              id: o.id,
              name: o.name,
              isActive: o.isActive,
            }))}
          />
          {candidateProfile && (
            <AssignToMeButton
              entity="candidate"
              id={personId}
              currentUserId={session.user.id}
              currentAssignedUserId={candidateProfile.assignedUserId}
              canReassign={session.user.isOwner}
            />
          )}
          <Link
            href="?tab=services-billing"
            className={cn(
              buttonVariants({ variant: 'default' }),
              'inline-flex items-center gap-1.5',
            )}
          >
            Open workspace
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          {/* Overflow menu — the mockup ends the action row with a "…"
              button. Secondary shortcuts (Record payment jumps to the
              per-invoice Verify/Record-proof buttons on the Services &
              Billing tab) live here instead of crowding the hero. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'shrink-0')}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={
                  <Link href="?tab=services-billing">
                    <Receipt className="mr-1.5 size-4" aria-hidden />
                    Record payment
                  </Link>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </section>
  );

  // Stage 6F Phase 2 — the new top-level "Service billing" section
  // consolidates everything the operator used to find scattered across
  // Overview + Billing tabs. One card per engagement, with the related
  // quotes / invoices / payments nested inside so the actions sit
  // beside the service they refer to. No more "Accepted quotes
  // awaiting payment" floating card redundant with the engagement's
  // own ACCEPTED pro forma — same row, one place.
  // A pro forma is "already surfaced by an engagement row" if either:
  //  (a) its CONVERTED-time engagementId matches one in
  //      balance.engagements, OR
  //  (b) any recorded payment on this pf has an engagementId in that
  //      list — covers the partially-paid-but-ACCEPTED case where
  //      the pf's own engagementId field stays null until the
  //      official invoice is issued.
  // Otherwise it renders as a standalone "Pending quote" card so the
  // operator can still find pre-engagement commitments.
  const engagementIdsFromPayments = new Set(
    payments.map((p) => p.serviceEngagementId).filter((id): id is string => !!id),
  );
  const pfIdsWithEngagement = new Set(
    payments
      .filter((p) => p.proFormaInvoiceId && engagementIdsFromPayments.has(p.serviceEngagementId))
      .map((p) => p.proFormaInvoiceId as string),
  );
  const quotesWithoutEngagement = proFormas.filter(
    (pf) =>
      !pf.engagementId &&
      !pfIdsWithEngagement.has(pf.id) &&
      pf.status !== 'CANCELLED' &&
      pf.status !== 'REJECTED' &&
      pf.status !== 'SUPERSEDED',
  );
  const employerLiabilityInvoices = invoices.filter((i) => i.liability === 'EMPLOYER_LIABILITY');
  // Stage 6F (final) — detail sections collapse by default when the
  // client has multiple services, so the tabs below stay reachable
  // without scrolling past every quote/payment row. Single-service
  // clients keep the detail open so there's no extra click for the
  // common case.
  const collapseByDefault = balance.engagements.length > 1;

  // Stage 6G Screen 06 — derived summary rows for the mockup-matching
  // Services & Billing surface (service picker + active-service cards +
  // service-history table). The detailed engagement cards below
  // (#billing-detail) stay the operational source of truth — these are
  // read-only views over the same workspace data.
  const engagementById = new Map(balance.engagements.map((e) => [e.engagementId, e]));
  // Stage B Wave 4 — engagements whose live invoice is a €0.00
  // complimentary grant get a distinct chip (never "Fully paid").
  const complimentaryEngagements = new Set(
    invoices
      .filter((i) => i.settlementKind === 'COMPLIMENTARY' && i.status !== 'VOIDED')
      .map((i) => i.serviceEngagementId),
  );
  const activeServiceRows: ActiveServiceRow[] = balance.engagements.map((e) => {
    const relatedQuotes = proFormas.filter((p) => p.engagementId === e.engagementId);
    const headerPf =
      relatedQuotes.find((pf) => pf.status === 'CONVERTED') ??
      relatedQuotes.find((pf) => pf.status === 'ACCEPTED') ??
      relatedQuotes[0] ??
      // Pre-conversion the quote isn't linked to the engagement yet —
      // bridge via the payment rows (same trick as the Payments header).
      proFormas.find((pf) =>
        payments.some(
          (p) => p.serviceEngagementId === e.engagementId && p.proFormaInvoiceId === pf.id,
        ),
      );
    const agreedNum = Number.parseFloat(e.agreedAmount);
    const paidNum = Number.parseFloat(e.verifiedPaid);
    const settled = Number.parseFloat(e.outstanding) <= 0;
    return {
      engagementId: e.engagementId,
      serviceName: e.serviceName,
      statusLabel: settled ? 'Active' : 'In progress',
      settled,
      complimentary: complimentaryEngagements.has(e.engagementId),
      pfLine: headerPf
        ? `Pro Forma ${headerPf.number}${
            headerPf.acceptedAt
              ? ` · Accepted ${format(headerPf.acceptedAt, 'dd MMM yyyy · HH:mm')}`
              : headerPf.issuedAt
                ? ` · Issued ${format(headerPf.issuedAt, 'dd MMM yyyy · HH:mm')}`
                : ''
          }`
        : null,
      agreed: e.agreedAmount,
      paid: e.verifiedPaid,
      balance: e.outstanding,
      currencyCode: e.currencyCode,
      pct: agreedNum > 0 ? Math.min(100, Math.max(0, Math.round((paidNum / agreedNum) * 100))) : 0,
    };
  });
  // Verified money per quote — used for quotes that haven't converted
  // into an engagement yet (post-conversion the engagement's own
  // verifiedPaid is authoritative).
  const verifiedByPf = new Map<string, number>();
  for (const p of payments) {
    if (!p.proFormaInvoiceId || p.status !== 'VERIFIED') continue;
    verifiedByPf.set(
      p.proFormaInvoiceId,
      (verifiedByPf.get(p.proFormaInvoiceId) ?? 0) + Number.parseFloat(p.amount),
    );
  }
  const quoteHistoryRows: ServiceHistoryRow[] = proFormas
    .filter(
      (pf) => pf.status !== 'SUPERSEDED' && pf.status !== 'CANCELLED' && pf.status !== 'REJECTED',
    )
    .map((pf) => {
      const eng = pf.engagementId ? engagementById.get(pf.engagementId) : undefined;
      const subtotalNum = Number.parseFloat(pf.subtotal);
      const paidNum = eng ? Number.parseFloat(eng.verifiedPaid) : (verifiedByPf.get(pf.id) ?? 0);
      const balanceNum = Math.max(0, subtotalNum - paidNum);
      return {
        key: `pf-${pf.id}`,
        dateIso: pf.issuedAt ? pf.issuedAt.toISOString() : null,
        service: eng?.serviceName ?? pf.lines[0]?.description ?? 'Pro forma',
        type: 'Quote' as const,
        refLabel: pf.number,
        refHref: `/leads/${pf.sourceLeadId}/pro-formas/${pf.id}`,
        printHref: pf.issuedAt ? `/leads/${pf.sourceLeadId}/pro-formas/${pf.id}/print` : null,
        amount: pf.subtotal,
        paid: paidNum.toFixed(2),
        balance: balanceNum.toFixed(2),
        currencyCode: pf.currencyCode,
        // Stage C1 — payment state comes from the ONE shared derivation
        // so history and the billing cards can never disagree. Draft
        // quotes keep their own label (no payment is expected yet).
        status:
          pf.status === 'DRAFT'
            ? ('Draft quote' as const)
            : derivePaymentState(subtotalNum, paidNum),
      };
    });
  // Direct Payment & Convert engagements never had a quote — their
  // history row anchors to the official invoice instead.
  const pfEngagementIds = new Set(
    proFormas.map((p) => p.engagementId).filter((id): id is string => !!id),
  );
  const directHistoryRows: ServiceHistoryRow[] = balance.engagements
    .filter(
      (e) =>
        !pfEngagementIds.has(e.engagementId) &&
        !payments.some((p) => p.serviceEngagementId === e.engagementId && p.proFormaInvoiceId),
    )
    .map((e) => {
      const inv = invoices.find(
        (i) =>
          i.serviceEngagementId === e.engagementId &&
          i.liability === 'PERSONAL' &&
          i.status !== 'VOIDED',
      );
      // Stage B Wave 4 — a complimentary engagement's history row names
      // the kind; "Paid" would read as money received.
      const isComplimentary = inv?.settlementKind === 'COMPLIMENTARY';
      return {
        key: `eng-${e.engagementId}`,
        dateIso: inv ? inv.issuedAt.toISOString() : null,
        service: e.serviceName,
        type: isComplimentary ? ('Complimentary' as const) : ('Direct payment' as const),
        refLabel: inv?.number ?? null,
        refHref: inv ? `/candidates/${personId}/invoices/${inv.number}` : null,
        printHref: null,
        amount: e.agreedAmount,
        paid: e.verifiedPaid,
        balance: e.outstanding,
        currencyCode: e.currencyCode,
        // Stage C1 — the reported bug lived here: a two-state label
        // printed "Partially paid" for €0 received. Shared derivation
        // now; complimentary keeps its own kind label.
        status: isComplimentary
          ? ('Complimentary' as const)
          : derivePaymentState(e.agreedAmount, e.verifiedPaid),
      };
    });
  const serviceHistoryRows = [...quoteHistoryRows, ...directHistoryRows].sort((a, b) =>
    (b.dateIso ?? '9999').localeCompare(a.dateIso ?? '9999'),
  );

  const serviceBillingSection = (
    <section id="service-billing" className="space-y-5" aria-labelledby="service-billing-heading">
      <ServicesBillingTab
        personId={personId}
        personName={fullName}
        candidateInfo={{
          email: person.email,
          phone: person.phone,
          nationality: person.nationality,
          country: person.currentCountry,
          immigrationStatus: person.irishImmigrationStatus?.replace(/_/g, ' ') ?? null,
        }}
        leadId={csLeadForActivation?.id ?? liveLead?.id ?? ''}
        services={data.services}
        currencies={data.currencies}
        active={activeServiceRows}
        history={serviceHistoryRows}
        canComplimentary={canComplimentary}
      />

      {/* Detailed operational cards — quotes, payment verification,
          refunds, invoices & receipts. The summary surface above links
          here via "View all" / active-service cards. */}
      <div id="billing-detail" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/60 bg-teal-50/40 px-4 py-3">
          <h2
            id="service-billing-heading"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-md bg-teal-100 text-teal-700"
            >
              <CalendarCheck className="size-4" />
            </span>
            Service billing
            <span className="text-xs font-normal text-muted-foreground">
              ({balance.engagements.length} service
              {balance.engagements.length === 1 ? '' : 's'})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {balance.engagements.length > 2 && (
              <a
                href="#workspace-tabs"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Jump to profile tabs ↓
              </a>
            )}
            <NewQuoteButton
              leadId={csLeadForActivation?.id ?? liveLead?.id ?? ''}
              services={data.services}
              currencies={data.currencies}
            />
          </div>
        </div>

        {balance.engagements.length === 0 &&
          quotesWithoutEngagement.length === 0 &&
          proFormas.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <Coins className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  No services on file yet. Use <span className="font-medium">+ New quote</span> to
                  raise the first pro forma.
                </p>
              </CardContent>
            </Card>
          )}

        {/* Pre-engagement quotes (DRAFT / ISSUED / ACCEPTED with no
          serviceEngagement yet). Rare — most quotes become an
          engagement as soon as they're issued — but worth surfacing
          when they do. */}
        {quotesWithoutEngagement.map((pf) => (
          <Card key={`loose-pf-${pf.id}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">Pending quote</CardTitle>
                  <Badge variant={statusTone(pf.status)} className="rounded-full text-[10px]">
                    {PF_LABEL[pf.status] ?? pf.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pf.number} ·{' '}
                  <span className="tabular-nums">
                    {formatCurrency(pf.subtotal, pf.currencyCode)}
                  </span>
                  {pf.issuedAt && <> · issued {format(pf.issuedAt, 'dd MMM yyyy · HH:mm')}</>}
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <QuoteActionsRow pf={pf} services={data.services} currencies={data.currencies} />
            </CardContent>
          </Card>
        ))}

        {/* One card per engagement — the service row the product owner
          asked for: agreed, received, balance, progress, embedded
          quote + invoice + payment actions. */}
        {balance.engagements.map((e) => {
          const relatedQuotes = proFormas.filter((p) => p.engagementId === e.engagementId);
          const relatedInvoices = invoices.filter(
            (i) => i.serviceEngagementId === e.engagementId && i.liability === 'PERSONAL',
          );
          const relatedPayments = payments.filter((p) => p.serviceEngagementId === e.engagementId);
          const agreedCents = Math.max(1, Math.round(Number.parseFloat(e.agreedAmount) * 100));
          const receivedCents = Math.round(Number.parseFloat(e.verifiedPaid) * 100);
          const progressPct = Math.min(100, Math.max(0, (receivedCents / agreedCents) * 100));
          const isSettled = Number.parseFloat(e.outstanding) <= 0;
          const headerPf =
            relatedQuotes.find((pf) => pf.status === 'CONVERTED') ??
            relatedQuotes.find((pf) => pf.status === 'ACCEPTED') ??
            relatedQuotes[0];
          // Stage 6G — short, operator-facing status label for the row
          // badge on the right. Derived from the engagement + payment
          // state, not duplicated with the primary onboarding status in
          // the hero.
          // Stage C1 — payment states come from the shared derivation
          // (settled → "Paid", partial → "Partially paid", none due yet
          // → "Awaiting payment"); engagement-lifecycle rows that carry
          // no payment expectation keep their status fallback.
          const rowStatusLabel =
            isSettled || progressPct > 0 || e.status === 'PENDING_PAYMENT'
              ? derivePaymentState(e.agreedAmount, e.verifiedPaid)
              : e.status.replace(/_/g, ' ').toLowerCase();
          const rowStatusTone = isSettled
            ? 'border-status-success/30 bg-status-success-soft text-status-success'
            : progressPct > 0
              ? 'border-info/30 bg-info/10 text-info'
              : 'border-status-warning/30 bg-status-warning-soft text-status-warning';
          return (
            <Card key={e.engagementId} data-testid="engagement-card" className="py-0">
              <details
                className="group [&_summary::-webkit-details-marker]:hidden"
                {...(collapseByDefault ? {} : { open: true })}
              >
                <summary className="cursor-pointer list-none px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  {/* Row layout — matches the reference image: icon,
                    service name + status pill + pro-forma subtitle on
                    the left; Agreed / Received / Balance columns and
                    progress bar + status badge on the right. */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700"
                    >
                      <Scroll className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-sm">{e.serviceName}</CardTitle>
                        <Badge
                          variant={statusTone(e.status)}
                          className="rounded-full text-[10px] uppercase"
                        >
                          {e.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      {headerPf && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Pro Forma {headerPf.number}
                          {headerPf.acceptedAt && (
                            <> · Accepted {format(headerPf.acceptedAt, 'd MMM yyyy')}</>
                          )}
                          {!headerPf.acceptedAt && headerPf.issuedAt && (
                            <> · Issued {format(headerPf.issuedAt, 'd MMM yyyy')}</>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-6 text-right tabular-nums">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Agreed
                        </div>
                        <div className="text-sm font-medium">
                          {formatCurrency(e.agreedAmount, e.currencyCode)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Received
                        </div>
                        <div
                          className={cn(
                            'text-sm font-medium',
                            isSettled ? 'text-status-success' : 'text-info',
                          )}
                        >
                          {formatCurrency(e.verifiedPaid, e.currencyCode)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Balance
                        </div>
                        <div className="text-sm font-medium">
                          {formatCurrency(e.outstanding, e.currencyCode)}
                        </div>
                      </div>
                    </div>
                    <ChevronDown
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </div>
                  {/* Progress bar + status pill — stretched across the
                    row width so the operator sees the money glance in
                    one line. */}
                  <div className="mt-3 flex items-center gap-3">
                    <div
                      role="progressbar"
                      aria-label={`${progressPct.toFixed(0)}% paid`}
                      aria-valuenow={Math.round(progressPct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          isSettled ? 'bg-status-success' : 'bg-info',
                        )}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                      {progressPct.toFixed(0)}%
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                        rowStatusTone,
                      )}
                    >
                      {rowStatusLabel}
                    </span>
                  </div>
                </summary>
                <div className="space-y-4 px-6 pb-6 pt-0">
                  {/* Quotes attached to this service */}
                  {relatedQuotes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Quotes
                      </p>
                      {relatedQuotes.map((pf) => (
                        <div
                          key={pf.id}
                          className="rounded-md border p-3"
                          data-testid={`quote-row-${pf.number}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">{pf.number}</span>
                            <Badge
                              variant={statusTone(pf.status)}
                              className="rounded-full text-[10px]"
                            >
                              {PF_LABEL[pf.status] ?? pf.status}
                            </Badge>
                            {pf.revision > 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                rev {pf.revision}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {formatCurrency(pf.subtotal, pf.currencyCode)} ·{' '}
                            {pf.issuedAt
                              ? `issued ${format(pf.issuedAt, 'dd MMM yyyy · HH:mm')}`
                              : 'draft'}
                          </div>
                          <div className="mt-2 border-t pt-2">
                            <QuoteActionsRow
                              pf={pf}
                              services={data.services}
                              currencies={data.currencies}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Payments against this service — each row carries its
                  own status (pending/verified/refunded) + verify or
                  refund action. */}
                  {relatedPayments.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Payments
                        </p>
                        {/* Partial-payment continuation — once the quote
                          CONVERTS, QuoteActionsRow stops offering Record
                          payment, so an engagement with an outstanding
                          balance needs its own entry point for the next
                          instalment. */}
                        {!isSettled &&
                          (() => {
                            // Pre-conversion the quote isn't linked to the
                            // engagement yet (pf.engagementId is set at
                            // CONVERT time) — bridge via the payments rows.
                            const paymentPf =
                              headerPf ??
                              proFormas.find((pf) =>
                                relatedPayments.some((p2) => p2.proFormaInvoiceId === pf.id),
                              );
                            return paymentPf ? (
                              <RecordPaymentDialog
                                proFormaInvoiceId={paymentPf.id}
                                currencyCode={e.currencyCode}
                                defaultAmount={e.outstanding}
                              />
                            ) : null;
                          })()}
                      </div>
                      {relatedPayments.map((p) => {
                        const parentPf = proFormas.find(
                          (pf) => pf.engagementId === p.serviceEngagementId,
                        );
                        const canPreIssuanceRefund =
                          (parentPf?.status === 'ACCEPTED' || parentPf?.status === 'ISSUED') &&
                          (p.status === 'VERIFIED' || p.status === 'PARTIALLY_REFUNDED');
                        const relatedInvoice = relatedInvoices.find((i) => i.status !== 'VOIDED');
                        const canPostIssuanceRefund =
                          parentPf?.status === 'CONVERTED' &&
                          relatedInvoice != null &&
                          (p.status === 'VERIFIED' || p.status === 'PARTIALLY_REFUNDED');
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 rounded-md border p-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="tabular-nums font-medium">
                                  {formatCurrency(p.amount, p.currencyCode)}
                                </span>
                                <Badge
                                  variant={statusTone(p.status)}
                                  className="rounded-full text-[10px]"
                                >
                                  {PAYMENT_LABEL[p.status] ?? p.status}
                                </Badge>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {p.method.replace(/_/g, ' ')}
                                {p.proofReference && ` · ref ${p.proofReference}`}
                                {p.receivedAt &&
                                  ` · received ${format(p.receivedAt, 'dd MMM yyyy')}`}
                                {' · recorded '}
                                {format(p.createdAt, 'dd MMM yyyy · HH:mm')}
                              </div>
                            </div>
                            <div className="shrink-0">
                              {(p.status === 'PENDING' || p.status === 'PROOF_UPLOADED') &&
                                data.canVerifyPayments && <VerifyPaymentButton paymentId={p.id} />}
                              {(p.status === 'PENDING' || p.status === 'PROOF_UPLOADED') &&
                                !data.canVerifyPayments && (
                                  <span className="text-[11px] italic text-muted-foreground">
                                    Finance will confirm
                                  </span>
                                )}
                              {canPreIssuanceRefund && (
                                <RefundPaymentButton
                                  paymentId={p.id}
                                  paymentAmount={p.amount}
                                  currencyCode={p.currencyCode}
                                />
                              )}
                              {canPostIssuanceRefund && relatedInvoice && (
                                <Link
                                  href={`/candidates/${personId}/invoices/${relatedInvoice.number}`}
                                  className="text-[11px] text-foreground underline-offset-2 hover:underline"
                                  title="Post-issuance refund — issue a credit note from the invoice detail page"
                                >
                                  Refund via credit note →
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Invoices + receipts attached to this service */}
                  {relatedInvoices.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Invoice &amp; receipts
                      </p>
                      {relatedInvoices.map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between gap-2 rounded-md border p-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Receipt className="size-3.5 text-muted-foreground" aria-hidden />
                              <span className="font-medium">{i.number}</span>
                              <Badge
                                variant={
                                  i.settlementKind === 'COMPLIMENTARY' && i.status !== 'VOIDED'
                                    ? 'info'
                                    : statusTone(i.status)
                                }
                                className="rounded-full text-[10px]"
                              >
                                {i.settlementKind === 'COMPLIMENTARY' && i.status !== 'VOIDED'
                                  ? 'Complimentary'
                                  : (INVOICE_LABEL[i.status] ?? i.status)}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              Total {formatCurrency(i.totalAmount, i.currencyCode)}
                              {i.status !== 'VOIDED' &&
                                Number.parseFloat(i.outstandingAmount) > 0 && (
                                  <>
                                    {' '}
                                    · Outstanding{' '}
                                    {formatCurrency(i.outstandingAmount, i.currencyCode)}
                                  </>
                                )}
                              · issued {format(i.issuedAt, 'dd MMM yyyy · HH:mm')}
                            </div>
                          </div>
                          <Link
                            href={`/candidates/${personId}/invoices/${i.number}`}
                            className="shrink-0 text-foreground underline-offset-2 hover:underline"
                          >
                            View invoice
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </Card>
          );
        })}

        {/* Employer-liability invoices rendered separately so the
          client's own balance isn't inflated by someone else's debt. */}
        {employerLiabilityInvoices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">
                Related invoices · employer liability
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                An employer paid for these services on behalf of the candidate. Shown here for
                context; not counted toward this client's balance.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              {employerLiabilityInvoices.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{i.number}</span>
                      <Badge
                        variant={
                          i.settlementKind === 'COMPLIMENTARY' && i.status !== 'VOIDED'
                            ? 'info'
                            : statusTone(i.status)
                        }
                        className="rounded-full text-[10px]"
                      >
                        {i.settlementKind === 'COMPLIMENTARY' && i.status !== 'VOIDED'
                          ? 'Complimentary'
                          : (INVOICE_LABEL[i.status] ?? i.status)}
                      </Badge>
                    </div>
                    <div className="text-[11px] tabular-nums">
                      Total {formatCurrency(i.totalAmount, i.currencyCode)} · issued{' '}
                      {format(i.issuedAt, 'dd MMM yyyy')}
                    </div>
                  </div>
                  <Link
                    href={`/candidates/${personId}/invoices/${i.number}`}
                    className="shrink-0 text-foreground underline-offset-2 hover:underline"
                  >
                    View invoice
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );

  // Stage 6D Wave 2 — Applications tab reuses the existing per-person
  // query; renders a compact list and links out to the full detail page
  // for state transitions. Loaded only when the Applications tab is
  // active (see activeTab check at the top of this component).
  // Stage C workflow collapse — the Applications tab is the full
  // working surface: record internal/external applications, advance
  // them through interview/offer/accepted, and record the placement
  // that flips the derived "Placed" status. Same component family the
  // candidate pages always used; no new screens.
  const applicationsTab = (
    <ApplicationsPanel
      personId={personId}
      rows={applications as CandidateApplicationRow[]}
      knownEmployers={(
        employerRows as Array<{ id: string; legalName: string; tradingName: string | null }>
      ).map((e) => ({ id: e.id, legalName: e.legalName, tradingName: e.tradingName }))}
    />
  );

  // Stage 6F Phase 2 — Candidate docs tab hosts the full
  // DocumentsSection migrated from the deprecated /candidates/[id]
  // page. Upload, review, void, requirement management are all here;
  // no more deep-link to a redirected profile page.
  // Stage 6F Phase 4 — the CV suggestions panel sits under the
  // documents list so staff can parse an uploaded CV and bulk-accept
  // extracted skills / qualifications / employment history. The
  // panel uses the existing deterministic pdf-parse + mammoth
  // pipeline (no LLM).
  // Stage 6G Screen 05 — Documents & CV tab. Full mockup match built in
  // the dedicated CandidateDocsTab client component (./docs-tab.tsx).
  // Reuses the existing presign + registerUploadAction upload flow and
  // the deterministic buildCvSuggestions / acceptCvSuggestions actions,
  // but presents them in the mockup's 2x2 layout: header + dropzone-with-
  // common-types + Scan CV card + uploaded table + Extracted CV preview.
  const candidateDocsTab = (
    <CandidateDocsTab
      personId={personId}
      documents={documents as DocumentInstance[]}
      documentTypes={(docTypes as DocumentType[])
        .filter((t) => t.isActive && (t.appliesTo === 'PERSON' || t.appliesTo === 'BOTH'))
        .map((t) => ({ id: t.id, name: t.name, code: t.code, hasExpiry: t.hasExpiry }))}
    />
  );

  // Stage 6F Phase 3 — Candidate Profile tab. Reuses the orphaned
  // candidate-details-panel sections (Skills / Qualifications /
  // Employment history) + the new Education section + the extended
  // EditPersonDialog (names, DOB, address, Irish immigration status,
  // profile summary, etc.). All writes land through audit-enabled
  // services; the dialog is role-gated to internal staff.
  const editDialog = (
    <EditPersonDialog
      person={person}
      candidateProfile={candidateProfile}
      occupations={(occupations as Occupation[]).map((o) => ({
        id: o.id,
        name: o.name,
        isActive: o.isActive,
      }))}
    />
  );

  // Stage 6G Overview tab — a 3-column read-mostly grid matching the
  // reference image. Each card has its own Edit/Add control that
  // reuses the same dialogs the Profile tab uses, so the business
  // logic path is identical — this is purely a layout + density
  // change for first-glance readability.
  const personalFullName = [person.firstName, person.middleName, person.lastName]
    .filter(Boolean)
    .join(' ');
  const employmentList = employmentRows as EmploymentHistory[];
  const educationList = educationRows as EducationEntry[];
  const skillList = skillRows as CandidateSkillRow[];
  const qualificationList = qualificationRows as CandidateQualificationRow[];
  // Stage B Wave 3 — notes serialized for the client card (Dates → ISO).
  const notesList: CandidateNote[] = (noteRows as CommunicationRow[]).map((n) => ({
    id: n.id,
    body: n.body,
    staffUserId: n.staffUserId,
    staffName: n.staffName,
    occurredAt: n.occurredAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
  const canModerateNotes = session.user.role === 'ADMIN' || session.user.isOwner;
  const overviewTab = (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Personal details — matches the mockup's grey-header card with
          two-column key-value rows. Flags render inline on Nationality
          and Country of residence rows so the geography is scannable at
          a glance. */}
      <Card className="overflow-hidden lg:row-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md bg-sky-100 text-sky-700"
            >
              <UserRound className="size-3.5" />
            </span>
            Personal details
          </CardTitle>
          {editDialog}
        </CardHeader>
        <CardContent className="space-y-2.5 p-4 text-xs">
          <ProfileRow label="Full name" value={personalFullName || '—'} />
          <ProfileRow
            label="Date of birth"
            icon={person.dateOfBirth ? CalendarCheck : undefined}
            value={
              person.dateOfBirth
                ? format(new Date(`${person.dateOfBirth}T00:00:00Z`), 'd MMMM yyyy')
                : '—'
            }
          />
          <ProfileRow
            label="Nationality"
            value={person.nationality ?? '—'}
            prefix={nationalityFlag}
          />
          <ProfileRow
            label="Country of residence"
            value={person.currentCountry ?? '—'}
            prefix={residenceFlag}
          />
          <ProfileRow
            label="Email"
            icon={person.email ? Mail : undefined}
            value={person.email ?? '—'}
          />
          <ProfileRow
            label="Mobile"
            icon={person.phone ? Phone : undefined}
            value={person.phone ?? '—'}
          />
          <ProfileRow label="City" value={person.currentCity ?? '—'} />
          <ProfileRow
            label="Address"
            value={[person.addressLine1, person.addressLine2].filter(Boolean).join(', ') || '—'}
          />
          <ProfileRow
            label="Irish immigration status"
            value={
              person.irishImmigrationStatus
                ? (IRISH_IMMIGRATION_STATUSES.find((s) => s.value === person.irishImmigrationStatus)
                    ?.label ?? person.irishImmigrationStatus)
                : '—'
            }
          />
          <ProfileRow
            label="Work eligibility"
            value={workEligibilityLabel(candidateProfile?.workEligibility) ?? '—'}
          />
        </CardContent>
      </Card>

      {/* Professional profile — same card chrome as Personal details,
          amber accent on the title icon to visually bind it to the
          mockup's second-column treatment. */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md bg-amber-100 text-amber-700"
            >
              <Briefcase className="size-3.5" />
            </span>
            Professional profile
          </CardTitle>
          {editDialog}
        </CardHeader>
        <CardContent className="space-y-3 p-4 text-xs">
          <ProfileRow label="Primary occupation" value={occupationName ?? '—'} />
          <ProfileRow
            label="Years of experience"
            value={candidateProfile?.yearsOfExperience ?? '—'}
          />
          <div>
            <p className="mb-1 text-muted-foreground">Professional summary</p>
            {candidateProfile?.profileSummary ? (
              <p className="whitespace-pre-wrap text-foreground">
                {candidateProfile.profileSummary}
              </p>
            ) : (
              <p className="italic text-muted-foreground">No summary yet.</p>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-muted-foreground">Skills</p>
              {/* The dedicated SkillsSection (Profile tab) carries its
                  own Add dialog with catalog autosuggest — direct
                  operators there via a shortcut rather than
                  duplicating the UI. */}
              <Link
                href="?tab=profile"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                + Add
              </Link>
            </div>
            {skillList.length === 0 ? (
              <p className="italic text-muted-foreground">No skills recorded yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skillList.slice(0, 10).map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700"
                  >
                    {s.skillName}
                  </span>
                ))}
                {skillList.length > 10 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{skillList.length - 10} more
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stage 6G Screen 04 (v3) — Service Billing summary card. Lives
          as the 3rd column of the Overview grid matching the mockup. The
          full editing surface (quote actions, invoice buttons, payment
          verification, refunds) still lives inside the "Services &
          Billing" tab; this card is read-only + a "View all" link that
          routes operators to the detailed tab. */}
      <Card className="overflow-hidden lg:row-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md bg-teal-100 text-teal-700"
            >
              <CalendarCheck className="size-3.5" />
            </span>
            Service billing{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({balance.engagements.length} service
              {balance.engagements.length === 1 ? '' : 's'})
            </span>
          </CardTitle>
          <NewQuoteButton
            leadId={csLeadForActivation?.id ?? liveLead?.id ?? ''}
            services={data.services}
            currencies={data.currencies}
          />
        </CardHeader>
        <CardContent className="space-y-3 p-4 text-xs">
          {balance.engagements.length === 0 ? (
            <p className="italic text-muted-foreground">
              No services on file yet. Raise a quote from the Services & Billing tab.
            </p>
          ) : (
            balance.engagements.map((e) => {
              const agreedCents = Math.max(1, Math.round(Number.parseFloat(e.agreedAmount) * 100));
              const receivedCents = Math.round(Number.parseFloat(e.verifiedPaid) * 100);
              const progressPct = Math.min(100, Math.max(0, (receivedCents / agreedCents) * 100));
              const isSettled = Number.parseFloat(e.outstanding) <= 0;
              // Mockup shows the engagement's pro-forma reference +
              // accepted date as the row subtitle.
              const pf = proFormas.find((p) => p.engagementId === e.engagementId);
              return (
                <Link
                  key={e.engagementId}
                  href="?tab=services-billing"
                  className="flex items-start gap-2.5 rounded-xl border bg-card p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/40"
                >
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700"
                  >
                    <Receipt className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {e.serviceName}
                      </p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 rounded-full border-transparent text-[10px]',
                          isSettled
                            ? 'bg-status-success-soft text-status-success'
                            : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {isSettled ? 'Active' : 'In progress'}
                      </Badge>
                    </div>
                    {pf && (
                      <p className="truncate text-[10px] text-muted-foreground">
                        Pro Forma {pf.number}
                        {pf.acceptedAt && <> | Accepted {format(pf.acceptedAt, 'd MMM yyyy')}</>}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      <SbCell
                        label="Agreed"
                        value={formatCurrency(e.agreedAmount, e.currencyCode)}
                      />
                      <SbCell
                        label="Received"
                        value={formatCurrency(e.verifiedPaid, e.currencyCode)}
                        tone="success"
                      />
                      <SbCell
                        label="Balance"
                        value={formatCurrency(e.outstanding, e.currencyCode)}
                        tone={isSettled ? 'default' : 'warning'}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            isSettled ? 'bg-status-success' : 'bg-sky-500',
                          )}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {Math.round(progressPct)}%
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 rounded-full border-transparent text-[10px]',
                          isSettled
                            ? 'bg-status-success-soft text-status-success'
                            : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {derivePaymentState(e.agreedAmount, e.verifiedPaid)}
                      </Badge>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Employment history */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Briefcase className="size-4 text-muted-foreground" aria-hidden />
            Employment history
          </CardTitle>
          <Link
            href="?tab=profile"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
          >
            + Add
          </Link>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {employmentList.length === 0 ? (
            <p className="italic text-muted-foreground">No prior roles recorded.</p>
          ) : (
            employmentList.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{r.jobTitle ?? 'Role'}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{r.employerName}</p>
                  {r.description && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                  {r.startDate?.slice(0, 4) ?? '?'} –{' '}
                  {r.isCurrent ? 'Present' : (r.endDate?.slice(0, 4) ?? '?')}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Education & qualifications */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <GraduationCap className="size-4 text-muted-foreground" aria-hidden />
            Education &amp; qualifications
          </CardTitle>
          <Link
            href="?tab=profile"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
          >
            + Add
          </Link>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {educationList.length === 0 ? (
            <p className="italic text-muted-foreground">No education on file yet.</p>
          ) : (
            educationList.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {r.degree
                      ? `${r.degree}${r.fieldOfStudy ? `, ${r.fieldOfStudy}` : ''}`
                      : (r.fieldOfStudy ?? r.institution)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{r.institution}</p>
                </div>
                <span className="shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                  {r.startDate?.slice(0, 4) ?? '?'} – {r.endDate?.slice(0, 4) ?? '?'}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Certifications & licences — mapped from the candidate_qualifications
          table (credentials), kept separate from Education (schooling) per
          the Stage 6F split. */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
            Certifications &amp; licences
          </CardTitle>
          {/* Stage B Wave 2.2 — "+ Add" opens the add dialog right here;
              it used to be a bare link to the Profile tab, which read as
              a broken button. */}
          <QualificationDialog
            personId={personId}
            allQuals={allQualifications as Qualification[]}
            existing={
              new Set(
                qualificationList
                  .map((r) => r.qualificationId)
                  .filter((id): id is string => Boolean(id)),
              )
            }
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
              >
                + Add
              </button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {qualificationList.length === 0 ? (
            <p className="italic text-muted-foreground">No certifications on file yet.</p>
          ) : (
            qualificationList.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{r.qualificationName}</p>
                  {r.institution && (
                    <p className="truncate text-[11px] text-muted-foreground">{r.institution}</p>
                  )}
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full border border-status-success/30 bg-status-success-soft px-2 py-0.5 text-[10px] text-status-success">
                  {r.awardedOn ? 'Valid' : 'On file'}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Stage B Wave 3 — internal Notes card. Communication-log backed:
          author + absolute date & time on every entry; edit/archive only
          for the author or an admin (enforced server-side too). */}
      <CandidateNotesCard
        personId={personId}
        notes={notesList}
        currentUserId={session.user.id}
        canModerate={canModerateNotes}
      />

      {/* Stage 6G Screen 04 (v3 polish) — Documents & CV summary card
          per the approved mockup. Shows the 5 most recent uploads with
          type + date; full upload + review surface still lives on the
          dedicated Documents & CV tab. */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md bg-indigo-100 text-indigo-700"
            >
              <FileText className="size-3.5" />
            </span>
            Documents &amp; CV{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({(documents as DocumentInstance[]).filter((d) => !d.voidedAt).length})
            </span>
          </CardTitle>
          <Link
            href="?tab=documents-candidate"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
          >
            Upload documents <ArrowRight className="size-3" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-xs">
          {(() => {
            const docs = (documents as DocumentInstance[]).filter((d) => !d.voidedAt).slice(0, 5);
            if (docs.length === 0) {
              return (
                <p className="italic text-muted-foreground">
                  No documents on file yet. Upload CVs, passports, qualifications…
                </p>
              );
            }
            return docs.map((d) => (
              <div
                key={d.id}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {d.displayName ?? d.originalFilename}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {d.mimeType.split('/')[1]?.toUpperCase() ?? 'FILE'} ·{' '}
                    {Math.round(d.fileSizeBytes / 1024).toLocaleString()} KB
                  </p>
                </div>
                <time
                  dateTime={new Date(d.createdAt).toISOString()}
                  className="shrink-0 text-right text-[10px] text-muted-foreground tabular-nums"
                  title={format(new Date(d.createdAt), 'd MMM yyyy · HH:mm')}
                >
                  {format(new Date(d.createdAt), 'd MMM yy')}
                </time>
              </div>
            ));
          })()}
        </CardContent>
      </Card>

      {/* Stage 6G Screen 04 (v3 polish) — Applications summary card.
          Matches the mockup's "Applications (0) — No applications yet"
          empty state. Shows the 3 most recent apps when they exist. */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md bg-rose-100 text-rose-700"
            >
              <ClipboardCheck className="size-3.5" />
            </span>
            Applications{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({applications.length})
            </span>
          </CardTitle>
          <Link
            href="?tab=applications"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
          >
            New application <ArrowRight className="size-3" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-xs">
          {applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-full bg-muted/60 text-muted-foreground"
              >
                <ClipboardCheck className="size-4" />
              </span>
              <p className="text-xs font-medium text-foreground">No applications yet</p>
              <p className="max-w-[18ch] text-[11px] text-muted-foreground">
                Add job applications, interviews and placements for this candidate.
              </p>
            </div>
          ) : (
            applications.slice(0, 3).map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {a.requisitionTitle ?? 'Application'}
                  </p>
                  {a.displayCompany && (
                    <p className="truncate text-[11px] text-muted-foreground">{a.displayCompany}</p>
                  )}
                </div>
                <span className="shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
                  {format(new Date(a.appliedAt), 'd MMM yy')}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );

  const profileTab = (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Identity &amp; contact</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Candidate's personal and contact details. Edit any field — changes are audited.
            </p>
          </div>
          {editDialog}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Full name" value={personalFullName || '—'} />
          <Row label="Email" value={person.email ?? '—'} />
          <Row label="Phone" value={person.phone ?? '—'} />
          <Row label="Date of birth" value={person.dateOfBirth ?? '—'} />
          <Row label="Nationality" value={person.nationality ?? '—'} />
          <Row label="Country of residence" value={person.currentCountry ?? '—'} />
          <Row label="City" value={person.currentCity ?? '—'} />
          <Row label="Address line 1" value={person.addressLine1 ?? '—'} />
          <Row label="Address line 2" value={person.addressLine2 ?? '—'} />
          <Row label="Primary profession" value={occupationName ?? '—'} />
          <Row
            label="Irish immigration status"
            value={
              person.irishImmigrationStatus
                ? (IRISH_IMMIGRATION_STATUSES.find((s) => s.value === person.irishImmigrationStatus)
                    ?.label ?? person.irishImmigrationStatus)
                : '—'
            }
          />
          {candidateProfile && (
            <>
              <Row label="Years of experience" value={candidateProfile.yearsOfExperience ?? '—'} />
              <Row
                label="Work eligibility"
                value={workEligibilityLabel(candidateProfile.workEligibility) ?? '—'}
              />
              <Row label="Preferred location" value={candidateProfile.preferredLocation ?? '—'} />
            </>
          )}
          {candidateProfile?.profileSummary && (
            <div className="col-span-full border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Profile summary
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs">{candidateProfile.profileSummary}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <SkillsSection personId={personId} rows={skillList} allSkills={allSkills as Skill[]} />
      <QualificationsSection
        personId={personId}
        rows={qualificationList}
        allQualifications={allQualifications as Qualification[]}
      />
      <EmploymentHistorySection personId={personId} rows={employmentList} />
      <EducationSection personId={personId} rows={educationList} />
    </div>
  );

  // Stage 6F Phase 2 — Activity tab now carries both the lead-journey
  // milestones (which used to live in Overview) and the per-event
  // timeline. One tab holds the full historical narrative, keeping
  // the top-level service-billing section focused on operational
  // state.
  const activityTab = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead journey</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {leads.length === 0 ? (
            <EmptyRow icon={Scroll} text="No enquiry on file yet." />
          ) : (
            leads.map((l) => (
              <div
                key={l.id}
                className="flex items-start justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusTone(l.status)} className="rounded-full text-[10px]">
                      {LEAD_LABEL[l.status] ?? l.status}
                    </Badge>
                    <span className="truncate text-xs text-muted-foreground">
                      {l.targetBusiness.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <time className="text-[11px] text-muted-foreground">
                    Opened {format(l.createdAt, 'dd MMM yyyy · HH:mm')}
                    {l.acceptedAt && ` · Converted ${format(l.acceptedAt, 'dd MMM yyyy · HH:mm')}`}
                  </time>
                </div>
                <Link
                  href={`/leads/${l.id}`}
                  className="shrink-0 text-xs text-foreground underline-offset-2 hover:underline"
                >
                  Open lead
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {data.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to show yet — the timeline fills in as quotes, payments and invoices land.
            </p>
          ) : (
            <ol className="space-y-3 text-sm">
              {data.timeline.map((t) => (
                <li
                  key={t.id}
                  className="relative flex gap-3 border-l-2 border-border pl-4 last:pb-0"
                >
                  <span className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-muted-foreground/60" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.subtitle}</div>
                  </div>
                  <time
                    dateTime={t.at.toISOString()}
                    className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
                    title={format(t.at, 'dd MMM yyyy · HH:mm')}
                  >
                    {format(t.at, 'dd MMM')}
                    <br />
                    {format(t.at, 'HH:mm')}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {justCreated && (
        <JustCreatedCard
          personId={personId}
          invoiceNumber={justCreated.invoiceNumber}
          receiptNumber={justCreated.receiptNumber}
        />
      )}
      {/* 1. Candidate hero — avatar, name, email/phone, status chips,
          "assigned to" line and the action buttons (Edit details,
          Assign to me, Open billing). */}
      {hero}

      {/* 2. Compact next-action bar */}
      {nextAction && (
        <ClientNextActionIsland
          action={nextAction}
          activationLeadId={csLeadForActivation?.id ?? null}
        />
      )}

      {/* Stage 6G Screen 04 (v3) — Service Billing promoted to its own
          top-level tab per the approved mockup. The detailed engagement
          rows now live inside the "Services & Billing" tab; a compact
          summary card appears inside the Overview grid's 3rd column so
          operators still see the headline numbers on landing. */}
      <div id="workspace-tabs" className="scroll-mt-6">
        <ClientWorkspaceTabs
          overview={overviewTab}
          profile={profileTab}
          documentsCandidate={candidateDocsTab}
          servicesBilling={serviceBillingSection}
          applications={applicationsTab}
          activity={activityTab}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-xs">{value}</span>
    </div>
  );
}

function ProfileRow({
  label,
  value,
  prefix,
  icon: Icon,
}: {
  label: string;
  value: string;
  /** Optional flag emoji (or any short visual) rendered before the value. */
  prefix?: string;
  /** Optional lucide icon rendered before the value (mockup shows these
      on the Date of birth / Email / Mobile rows). */
  icon?: LucideIcon;
}) {
  // Tighter two-column row for the Overview profile cards — label on
  // the left, value on the right, both wrapping as needed. `prefix`
  // (used for flags on Nationality / Country rows) sits inline before
  // the value so the geography reads at a glance.
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-right text-foreground">
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        {prefix && (
          <span aria-hidden className="leading-none">
            {prefix}
          </span>
        )}
        {value}
      </span>
    </div>
  );
}

/**
 * Stage 6G Screen 04 (v3) — compact Agreed / Received / Balance cell
 * used inside the Overview tab's Service Billing summary card. Three
 * tones so Received reads success and non-zero Balance reads warning.
 */
function SbCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneCls =
    tone === 'success'
      ? 'text-status-success'
      : tone === 'warning'
        ? 'text-status-warning'
        : 'text-foreground';
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-semibold tabular-nums', toneCls)}>{value}</p>
    </div>
  );
}

function EmptyRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {text}
    </div>
  );
}

/**
 * Stage 6G Screen 04 (v3) — hero pill row + pill badge primitives.
 * Matches the approved mockup: each metadata item is its own rounded
 * white badge (soft border + ring + icon + value). Two separate rows:
 * identity (email · phone · location · nationality) and professional
 * context (profession · YoE · immigration · assigned · active since).
 *
 * `tone="warning"` / `tone="success"` paint the pill with the status
 * palette so the balance pill (money owed vs settled) stays legible
 * against the soft-blue hero gradient.
 */
function HeroPillRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** Mockup hero row 1 — flat icon+value items separated by thin dividers. */
function HeroMetaRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-y-1.5 text-sm">{children}</div>;
}

function HeroMetaItem({
  icon: Icon,
  prefix,
  children,
  title,
}: {
  icon?: LucideIcon;
  prefix?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="mr-3 flex min-w-0 items-center gap-1.5 pr-3 text-foreground/80 last:mr-0 last:pr-0 sm:border-r sm:border-border/80 sm:last:border-r-0"
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      {prefix && (
        <span aria-hidden className="leading-none">
          {prefix}
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

function HeroPill({
  icon: Icon,
  prefix,
  children,
  title,
  tone = 'default',
}: {
  icon?: LucideIcon;
  prefix?: string;
  children: React.ReactNode;
  title?: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneCls =
    tone === 'warning'
      ? 'border-status-warning/40 bg-status-warning-soft text-status-warning'
      : tone === 'success'
        ? 'border-status-success/40 bg-status-success-soft text-status-success'
        : 'border-border/60 bg-background/90 text-foreground';
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-sm ring-1 ring-black/5',
        toneCls,
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      {prefix && (
        <span aria-hidden className="leading-none">
          {prefix}
        </span>
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

function initialsFromName(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}
