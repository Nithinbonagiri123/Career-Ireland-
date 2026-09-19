import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { fetchAppSettings } from '@/modules/settings/service';
import { validateUploadRequest } from '@/modules/document-upload-requests/service';
import { UploadForm } from './upload-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Upload your documents' };

/**
 * Public "please upload your documents" page. No login, token in URL
 * is the credential. Renders in one of three states:
 *   1. Valid token → upload form with one row per requested requirement.
 *   2. Invalid / expired / revoked → generic "no longer valid" screen.
 *   3. Already completed → thank-you screen.
 *
 * We deliberately do not leak which failure mode caused #2 — makes
 * token enumeration pointless.
 */
export default async function UploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [validated, settings] = await Promise.all([
    validateUploadRequest(token),
    fetchAppSettings(),
  ]);

  if (!validated) {
    return (
      <Shell legalName={settings.legalName}>
        <div className="mx-auto max-w-lg rounded-xl border bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto size-10 text-status-warning" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">
            This upload link is no longer valid
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The link may have expired, already been used, or been revoked. If you still need to
            send documents, please reply to the last message you received from us and we'll issue a
            new link.
          </p>
        </div>
      </Shell>
    );
  }

  const alreadyFulfilled = validated.requirements.every((r) => r.fulfilled);

  return (
    <Shell legalName={settings.legalName}>
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">
            Hi {validated.candidateName.split(' ')[0] || 'there'} — please upload your documents
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Upload each item below to complete your onboarding. The link expires on{' '}
            <time className="whitespace-nowrap font-medium text-slate-900">
              {format(validated.request.expiresAt, "d MMM yyyy 'at' HH:mm")}
            </time>
            .
          </p>
        </header>

        {alreadyFulfilled ? (
          <div className="rounded-xl border border-status-success/40 bg-status-success-soft p-6 text-center">
            <CheckCircle2 className="mx-auto size-8 text-status-success" />
            <h2 className="mt-3 text-lg font-semibold text-status-success">
              All documents received
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Thank you. Our team will review your uploads and get back to you shortly. You can
              close this window.
            </p>
          </div>
        ) : (
          <UploadForm token={token} initialRequirements={validated.requirements} />
        )}

        <p className="text-center text-xs text-slate-500">
          Trouble uploading? Reply to the email you received and we'll help.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, legalName }: { children: React.ReactNode; legalName: string }) {
  return (
    <main className="min-h-screen bg-slate-50 py-10 sm:py-16">
      <div className="mx-auto mb-8 flex items-center justify-center gap-3">
        <Image
          src="/logo-icg.png"
          alt={legalName}
          width={200}
          height={155}
          priority
          className="h-14 w-auto object-contain"
        />
      </div>
      <div className="px-4">{children}</div>
    </main>
  );
}
