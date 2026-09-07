import { asc } from 'drizzle-orm';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Globe,
  MapPin,
  Pencil,
  Plus,
  Send,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignToMeButton } from '@/components/assign-to-me-button';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { InvitePortalDialog } from '@/components/portal/invite-portal-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { occupations } from '@/lib/db/schema/occupations';
import { statusTone } from '@/lib/ui/status-tone';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchEmployer, fetchEmployerContacts, fetchEmployers } from '@/modules/employers/service';
import { fetchRequisitionsForEmployer } from '@/modules/requisitions/service';
import { RequisitionDialog } from '../../requisitions/requisition-dialog';
import { EmployerDialog } from '../employer-dialog';
import { ContactDialog } from './contact-dialog';

export const dynamic = 'force-dynamic';

export default async function EmployerDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const { id } = await params;
  const employer = await fetchEmployer(id);
  if (!employer) notFound();

  const [contacts, requisitions, employersAll, currencies, occupationList] = await Promise.all([
    fetchEmployerContacts(id),
    fetchRequisitionsForEmployer(id),
    fetchEmployers(),
    fetchCurrencies(),
    db.select().from(occupations).orderBy(asc(occupations.name)),
  ]);

  const location = [employer.city, employer.country].filter(Boolean).join(', ');

  const metaStrip = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      <Badge variant={statusTone(employer.relationshipStatus)} className="rounded-full">
        {employer.relationshipStatus.replace(/_/g, ' ')}
      </Badge>
      {employer.industry && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">
          <Briefcase className="size-3" aria-hidden />
          {employer.industry}
        </span>
      )}
      {location && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-3" aria-hidden />
          {location}
        </span>
      )}
      {employer.website && (
        <a
          href={employer.website}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <Globe className="size-3" aria-hidden />
          {employer.website.replace(/^https?:\/\//, '')}
        </a>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          title={employer.legalName}
          description={employer.tradingName ? `Trading as ${employer.tradingName}` : undefined}
          breadcrumbs={[{ label: 'Employers', href: '/employers' }, { label: employer.legalName }]}
          meta={metaStrip}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <AssignToMeButton
                entity="employer"
                id={employer.id}
                currentUserId={session.user.id}
                currentAssignedUserId={employer.assignedUserId}
              />
              <EmployerDialog
                initial={employer}
                trigger={
                  <Button size="sm" variant="outline">
                    <Pencil className="mr-1.5 size-4" /> Edit
                  </Button>
                }
              />
              <InvitePortalDialog
                target={{ kind: 'EMPLOYER', employerId: employer.id }}
                defaultFullName={employer.legalName}
                trigger={
                  <Button size="sm" variant="outline">
                    <Send className="mr-1.5 size-4" /> Invite to portal
                  </Button>
                }
              />
              <RequisitionDialog
                employers={employersAll}
                currencies={currencies}
                occupations={occupationList}
                defaultEmployerId={employer.id}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" /> New requisition
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Contacts</CardTitle>
            <ContactDialog
              employerId={employer.id}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="mr-1.5 size-4" /> Add contact
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <EmptyState
                icon={User}
                title="No contacts yet"
                description="Add HR / hiring manager contacts for this employer."
              />
            ) : (
              <ul className="divide-y">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {c.fullName}
                        {c.isPrimary && (
                          <Badge variant="default" className="rounded-full text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.jobTitle ?? '—'} · {c.email ?? c.phone ?? 'no contact'}
                      </div>
                    </div>
                    <ContactDialog
                      employerId={employer.id}
                      initial={c}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Edit ${c.fullName}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1} className="mb-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              Requisitions{' '}
              <span className="ml-1 text-xs text-muted-foreground">({requisitions.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requisitions.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No requisitions yet"
                description="Create a job requisition for this employer with the button above."
              />
            ) : (
              <ul className="divide-y">
                {requisitions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.positionsFilled} / {r.positionsRequired} filled ·{' '}
                        {r.employmentType.replace(/_/g, ' ')}
                        {r.location ? ` · ${r.location}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusTone(r.status)} className="rounded-full">
                        {r.status.replace(/_/g, ' ')}
                      </Badge>
                      <Link
                        href={`/requisitions/${r.id}`}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Open <ArrowRight className="ml-1.5 size-3.5" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      {employer.notes && (
        <FadeUp delay={0.15}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{employer.notes}</p>
            </CardContent>
          </Card>
        </FadeUp>
      )}
    </div>
  );
}
