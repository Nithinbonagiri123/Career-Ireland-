import { formatDistanceToNow } from 'date-fns';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { DocumentUploader } from '@/components/document-uploader';
import { EmptyState } from '@/components/empty-state';
import { FadeUp } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePortalCandidate } from '@/lib/auth/session';
import { fetchMyRequirementsAndDocuments } from '@/modules/documents/service';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  MISSING: 'outline',
  PROVIDED: 'secondary',
  ACCEPTED: 'default',
  REJECTED: 'outline',
} as const;

export default async function MyDocumentsPage() {
  const session = await requirePortalCandidate();
  const { requirements, documents } = await fetchMyRequirementsAndDocuments();
  const personId = session.user.personId;

  const outstanding = requirements.filter((r) => r.status === 'MISSING' || r.status === 'REJECTED');

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Your documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the documents Career Ireland needs. Staff will review each upload; you'll see the
          status here.
        </p>
      </FadeUp>

      <FadeUp delay={0.05} className="mb-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              What you still need to provide{' '}
              <span className="ml-1 text-xs text-muted-foreground">({outstanding.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requirements.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No document requirements yet"
                description="Career Ireland hasn't set requirements for your profile yet. Check back later."
              />
            ) : (
              <ul className="divide-y">
                {requirements.map((req) => (
                  <li key={req.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{req.documentTypeName}</p>
                      {req.hasExpiry && (
                        <p className="text-[10px] text-muted-foreground">Expiry date required</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={STATUS_VARIANT[req.status]} className="rounded-full">
                        {req.status}
                      </Badge>
                      {(req.status === 'MISSING' || req.status === 'REJECTED') && (
                        <DocumentUploader
                          ownerType="PERSON"
                          ownerId={personId}
                          documentTypeId={req.documentTypeId}
                          fulfilRequirementId={req.id}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              All uploads{' '}
              <span className="ml-1 text-xs text-muted-foreground">({documents.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nothing uploaded yet"
                description="Files you upload will appear here for you and Career Ireland to reference."
              />
            ) : (
              <ul className="divide-y">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{d.originalFilename}</p>
                      <p className="text-[10px] text-muted-foreground">
                        v{d.version} · {formatDistanceToNow(d.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {d.status.replace(/_/g, ' ')}
                      </Badge>
                      <Link
                        href={`/api/documents/${d.id}/download`}
                        prefetch={false}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        Download
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
