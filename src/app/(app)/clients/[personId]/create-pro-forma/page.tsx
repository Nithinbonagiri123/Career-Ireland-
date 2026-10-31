import { ArrowLeft, ExternalLink, FileText, Globe, Mail, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { fetchClientWorkspace } from '@/modules/clients/workspace-data';
import { CreateProFormaForm } from './create-pro-forma-form';

export const dynamic = 'force-dynamic';

/**
 * Stage 6G Screen 08 — dedicated Create Pro Forma page. Reached from
 * the candidate's Services & Billing tab (selected services arrive as
 * ?services=<id,id>). A slim candidate hero sits above the form; the
 * quote itself is written by the same createProForma / issueProForma
 * actions the workspace composer uses.
 */
export default async function CreateProFormaPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ services?: string }>;
}) {
  await requireInternalStaff();
  const { personId } = await params;
  const sp = await searchParams;
  const data = await fetchClientWorkspace(personId);
  if (!data) notFound();
  const { person, candidateProfile, leads } = data;

  const fullName = `${person.firstName} ${person.lastName}`.trim();
  const location = [person.currentCity, person.currentCountry].filter(Boolean).join(', ');
  const csLead = leads.find(
    (l) =>
      l.targetBusiness === 'CANDIDATE_SERVICES' &&
      l.status !== 'ARCHIVED' &&
      l.status !== 'CONVERTED',
  );
  const liveLead = leads.find((l) => l.status !== 'ARCHIVED') ?? leads[0] ?? null;
  const leadId = csLead?.id ?? liveLead?.id ?? '';
  const preselectedIds = (sp.services ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const initials =
    `${person.firstName?.[0] ?? ''}${person.lastName?.[0] ?? ''}`.toUpperCase() || '?';

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <FadeUp>
        {/* ── Slim candidate hero ────────────────────────────────── */}
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/candidates" className="rounded-sm hover:text-foreground hover:underline">
                Candidates
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="min-w-0">
              <Link
                href={`/clients/${personId}`}
                className="rounded-sm hover:text-foreground hover:underline [overflow-wrap:anywhere]"
              >
                {fullName}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="font-medium text-foreground">
              Create pro forma
            </li>
          </ol>
        </nav>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-full bg-sky-100 text-lg font-semibold text-sky-700 sm:size-16 sm:text-xl dark:bg-sky-500/15 dark:text-sky-300"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-2xl">
                  {fullName}
                </h1>
                {candidateProfile?.lifecycleStatus === 'ACTIVE' && (
                  <Badge className="rounded-full border-transparent bg-status-success-soft text-status-success">
                    Active candidate
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {person.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" aria-hidden /> {person.email}
                  </span>
                )}
                {person.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5" aria-hidden /> {person.phone}
                  </span>
                )}
                {location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden /> {location}
                  </span>
                )}
                {person.nationality && (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="size-3.5" aria-hidden /> {person.nationality}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/clients/${personId}?tab=services-billing`}
              className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center')}
            >
              <ArrowLeft className="mr-1.5 size-4" aria-hidden />
              Back to Candidate
            </Link>
            <Link
              href={`/clients/${personId}`}
              className={cn(buttonVariants(), 'inline-flex items-center')}
            >
              View Profile
              <ExternalLink className="ml-1.5 size-4" aria-hidden />
            </Link>
          </div>
        </div>

        {/* ── Page title card ───────────────────────────────────── */}
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
          >
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create pro forma</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Prepare a pro forma — a quote, not a tax invoice — for this candidate&apos;s selected
              services.
            </p>
          </div>
        </div>
      </FadeUp>

      <FadeUp delay={0.05} className="mt-5">
        {leadId ? (
          <CreateProFormaForm
            personId={personId}
            leadId={leadId}
            person={{
              name: fullName,
              email: person.email,
              phone: person.phone,
              nationality: person.nationality,
              location: location || null,
            }}
            services={data.services}
            currencies={data.currencies}
            preselectedIds={preselectedIds}
          />
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              This candidate has no open Candidate Services lead, so a pro forma can&apos;t be
              raised here. Create a lead first from the Leads page.
            </p>
            <Link
              href="/leads"
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-4 inline-flex')}
            >
              Go to Leads
            </Link>
          </div>
        )}
      </FadeUp>
    </div>
  );
}
