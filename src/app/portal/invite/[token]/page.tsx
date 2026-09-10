import { AlertCircle, Lock } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchInvitation } from '@/modules/portal/service';
import { AcceptInviteForm } from './accept-form';

export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await fetchInvitation(token);
  const now = new Date();
  const invalid = !invitation || invitation.acceptedAt || invitation.expiresAt < now;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <FadeUp className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Lock className="size-4" />
            </div>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>
              {invalid
                ? 'This invitation is not valid'
                : `Welcome to Ireland Career Gateway — activate your ${invitation?.userType === 'CANDIDATE' ? 'candidate' : 'employer'} portal`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invalid ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {!invitation
                    ? 'Invitation link not found.'
                    : invitation.acceptedAt
                      ? 'This invitation was already used. If you forgot your password, ask Ireland Career Gateway staff to reset it.'
                      : 'This invitation has expired. Ask Ireland Career Gateway staff for a new link.'}
                </span>
              </div>
            ) : (
              <AcceptInviteForm token={token} email={invitation.email} />
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
