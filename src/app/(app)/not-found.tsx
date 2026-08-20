import { Construction } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { buttonVariants } from '@/components/ui/button';

export default function ModuleNotFound() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 md:px-10">
      <FadeUp>
        <EmptyState
          icon={Construction}
          title="This module hasn't been built yet"
          description="You've landed on a route that's on the roadmap but not shipped. Check the sidebar for what's live today."
          action={
            <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Back to dashboard
            </Link>
          }
        />
      </FadeUp>
    </div>
  );
}
