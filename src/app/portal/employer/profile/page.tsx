import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalEmployer } from '@/lib/auth/session';
import { fetchEmployerSelf } from '@/modules/portal/employer-repository';

export const dynamic = 'force-dynamic';

export default async function EmployerProfilePage() {
  const session = await requirePortalEmployer();
  const employer = await fetchEmployerSelf(session.user.employerId);
  if (!employer) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Company profile</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{employer.legalName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Trading name" value={employer.tradingName ?? '—'} />
            <Field label="Industry" value={employer.industry ?? '—'} />
            <Field label="Website" value={employer.website ?? '—'} />
            <Field
              label="Location"
              value={[employer.city, employer.country].filter(Boolean).join(', ') || '—'}
            />
            <div className="border-t pt-3 text-xs text-muted-foreground">
              To update any of this information, contact Career Ireland — they'll edit it and the
              changes will appear here.
            </div>
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
