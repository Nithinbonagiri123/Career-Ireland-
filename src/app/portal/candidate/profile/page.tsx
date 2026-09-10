import { notFound } from 'next/navigation';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalCandidate } from '@/lib/auth/session';
import { fetchCandidateSelf } from '@/modules/portal/candidate-repository';

export const dynamic = 'force-dynamic';

const AVAILABILITY_LABEL = {
  AVAILABLE: 'Available',
  TEMPORARILY_UNAVAILABLE: 'Temporarily unavailable',
  PLACED: 'Placed',
} as const;

export default async function CandidateProfilePage() {
  const session = await requirePortalCandidate();
  const self = await fetchCandidateSelf(session.user.personId);
  if (!self) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Your profile</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {self.person.firstName} {self.person.lastName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Field label="Email" value={self.person.email ?? '—'} />
            <Field label="Phone" value={self.person.phone ?? '—'} />
            <Field label="Date of birth" value={self.person.dateOfBirth ?? '—'} />
            <Field label="Nationality" value={self.person.nationality ?? '—'} />
            <Field
              label="Location"
              value={
                [self.person.currentCity, self.person.currentCountry].filter(Boolean).join(', ') ||
                '—'
              }
            />
            {self.profile && (
              <>
                <div className="border-t pt-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Candidate status
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="rounded-full">
                      {AVAILABILITY_LABEL[self.profile.availabilityStatus]}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full text-[10px]">
                      {self.profile.lifecycleStatus}
                    </Badge>
                  </div>
                </div>
                {self.profile.preferredLocation && (
                  <Field label="Preferred location" value={self.profile.preferredLocation} />
                )}
                {self.profile.profileSummary && (
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      Summary
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{self.profile.profileSummary}</p>
                  </div>
                )}
              </>
            )}
            <div className="border-t pt-3 text-xs text-muted-foreground">
              To update anything on this profile, contact Ireland Career Gateway — they'll edit and
              the changes will appear here.
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
