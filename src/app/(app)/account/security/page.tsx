import { KeyRound } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/lib/auth/session';
import { ChangePasswordForm } from './change-password-form';

export const metadata = { title: 'Account · Security' };

export default async function AccountSecurityPage() {
  const session = await requireSession();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        icon={KeyRound}
        title="Security"
        description="Update your password. Changing your password signs you out of every device."
      />

      <div className="grid gap-6 md:grid-cols-[1fr_260px] md:items-start">
        <FadeUp>
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>
                Signed in as <span className="font-medium">{session.user.email}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </FadeUp>

        <FadeUp delay={0.05}>
          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-sm">Password guidance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>Use at least 12 characters — a passphrase works well.</p>
              <p>Mix upper and lower case, digits, and a symbol.</p>
              <p>Never reuse a password from another site.</p>
              <p>All active sessions are revoked when you change it.</p>
            </CardContent>
          </Card>
        </FadeUp>
      </div>
    </div>
  );
}
