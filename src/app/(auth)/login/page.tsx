import { Lock } from 'lucide-react';
import { Suspense } from 'react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <FadeUp className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Lock className="size-4" />
            </div>
            <CardTitle>Sign in to Career Ireland</CardTitle>
            <CardDescription>Internal staff access only.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
