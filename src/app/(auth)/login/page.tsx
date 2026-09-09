import Image from 'next/image';
import { Suspense } from 'react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { LoginForm } from './login-form';
import { LoginHero } from './login-hero';

export const metadata = { title: 'Log in · Ireland Career Gateway' };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/60 px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-4 flex items-center gap-3 pl-1">
          <Image
            src="/logo-mark.png"
            alt=""
            width={620}
            height={600}
            priority
            className="size-10 object-contain"
          />
          <div className="text-2xl font-medium text-muted-foreground/70 md:text-3xl">Log in</div>
        </div>

        <FadeUp>
          <div className="flex min-h-[560px] overflow-hidden rounded-2xl border bg-card shadow-lg shadow-foreground/5">
            <div className="flex w-full flex-col justify-center px-8 py-10 md:w-1/2 md:px-14">
              <div className="mx-auto w-full max-w-sm">
                <div className="mb-6 flex justify-center">
                  <Image
                    src="/logo.png"
                    alt="Ireland Career Gateway"
                    width={848}
                    height={1200}
                    priority
                    className="h-24 w-auto object-contain"
                  />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">Welcome back!</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Enter your Credentials to access your account
                </p>

                <div className="mt-8">
                  <Suspense fallback={null}>
                    <LoginForm />
                  </Suspense>
                </div>

                <p className="mt-8 text-center text-xs text-muted-foreground">
                  Access is invite-only. Contact your administrator if you need an account.
                </p>
              </div>
            </div>

            <LoginHero />
          </div>
        </FadeUp>
      </div>
    </div>
  );
}
