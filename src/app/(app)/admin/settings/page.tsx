import { Settings2 } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchAppSettings } from '@/modules/settings/service';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings · Ireland Career Gateway' };

/**
 * Company letterhead + printable-document configuration. Every invoice
 * and receipt in the app reads from this record; nothing here is
 * hardcoded in source. See memory `no-hardcoded-document-content`.
 */
export default async function AdminSettingsPage() {
  await requirePermission('main', 'admin', 'manage');
  const settings = await fetchAppSettings();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Settings2}
          badge="Admin"
          title="Company settings"
          description="Letterhead + footer copy used on every invoice and receipt. Edits here take effect on the next printable render — no deploy needed."
          breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Settings' }]}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <SettingsForm initial={settings} />
      </FadeUp>
    </div>
  );
}
