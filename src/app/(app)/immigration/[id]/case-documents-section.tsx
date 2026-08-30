'use client';

import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, ClipboardCheck, FileText, Paperclip, Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DocumentUploader } from '@/components/document-uploader';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DocumentInstance } from '@/lib/db/schema/documents';
import type { DocumentType } from '@/lib/db/schema/reference';
import {
  addCaseDocumentRequirementAction,
  attachCaseDocumentAction,
  detachCaseDocumentAction,
  removeCaseDocumentRequirementAction,
  updateCaseDocumentRequirementAction,
} from '@/modules/immigration/actions';
import type { CaseDocumentRequirementRow, CaseDocumentRow } from '@/modules/immigration/service';

const STATUS_VARIANT: Record<
  CaseDocumentRequirementRow['status'],
  'default' | 'secondary' | 'outline'
> = {
  MISSING: 'outline',
  PROVIDED: 'secondary',
  ACCEPTED: 'default',
  REJECTED: 'outline',
};

// ─── Add requirement dialog ───────────────────────────────────────────────────

function AddRequirementDialog({
  caseId,
  documentTypes,
  existing,
}: {
  caseId: string;
  documentTypes: DocumentType[];
  existing: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [isMandatory, setIsMandatory] = useState<'MANDATORY' | 'OPTIONAL'>('MANDATORY');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  const available = documentTypes.filter((t) => t.isActive && !existing.has(t.id));

  const submit = () => {
    startTransition(async () => {
      const r = await addCaseDocumentRequirementAction({
        immigrationCaseId: caseId,
        documentTypeId: typeId,
        isMandatory,
        notes,
      });
      if (r.ok) {
        toast.success('Requirement added');
        setOpen(false);
        setTypeId('');
        setNotes('');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="mr-1 size-3.5" /> Add requirement
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add document requirement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="type">Document type</Label>
            <select
              id="type"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mand">Mandatory level</Label>
            <select
              id="mand"
              value={isMandatory}
              onChange={(e) => setIsMandatory(e.target.value as 'MANDATORY' | 'OPTIONAL')}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="MANDATORY">Mandatory</option>
              <option value="OPTIONAL">Optional</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rnotes">Notes</Label>
            <Input id="rnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !typeId}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Attach existing doc dialog ───────────────────────────────────────────────

function AttachDocDialog({
  caseId,
  requirementId,
  beneficiaryDocuments,
  alreadyAttachedIds,
}: {
  caseId: string;
  requirementId?: string;
  beneficiaryDocuments: DocumentInstance[];
  alreadyAttachedIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [docId, setDocId] = useState('');
  const [pending, startTransition] = useTransition();

  const available = beneficiaryDocuments.filter((d) => !alreadyAttachedIds.has(d.id));

  const submit = () => {
    startTransition(async () => {
      const r = await attachCaseDocumentAction({
        immigrationCaseId: caseId,
        documentInstanceId: docId,
        caseRequirementId: requirementId,
      });
      if (r.ok) {
        toast.success('Document attached');
        setOpen(false);
        setDocId('');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost">
            <Paperclip className="mr-1 size-3.5" /> Attach existing
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach an existing document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick from documents already uploaded on the beneficiary's profile — e.g. their passport
            reused across cases.
          </p>
          <div className="space-y-1">
            <Label htmlFor="doc">Document</Label>
            <select
              id="doc"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select…</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.originalFilename} (v{d.version}, {d.status.toLowerCase()})
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !docId}>
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function CaseDocumentsSection({
  caseId,
  beneficiaryPersonId,
  requirements,
  attachedDocs,
  documentTypes,
  beneficiaryDocuments,
}: {
  caseId: string;
  beneficiaryPersonId: string;
  requirements: CaseDocumentRequirementRow[];
  attachedDocs: CaseDocumentRow[];
  documentTypes: DocumentType[];
  beneficiaryDocuments: DocumentInstance[];
}) {
  const [, startTransition] = useTransition();
  const attachedIds = new Set(attachedDocs.map((d) => d.documentInstanceId));
  const existingReqTypeIds = new Set(requirements.map((r) => r.documentTypeId));

  const setStatus = (requirementId: string, status: CaseDocumentRequirementRow['status']) => {
    startTransition(async () => {
      const r = await updateCaseDocumentRequirementAction(
        { requirementId, status, notes: '' },
        caseId,
      );
      if (r.ok) toast.success('Status updated');
      else toast.error(r.error.message);
    });
  };

  const removeReq = (requirementId: string) => {
    if (!confirm('Remove this requirement from the case?')) return;
    startTransition(async () => {
      const r = await removeCaseDocumentRequirementAction({ requirementId }, caseId);
      if (r.ok) toast.success('Requirement removed');
      else toast.error(r.error.message);
    });
  };

  const detachDoc = (documentInstanceId: string) => {
    startTransition(async () => {
      const r = await detachCaseDocumentAction({
        immigrationCaseId: caseId,
        documentInstanceId,
      });
      if (r.ok) toast.success('Document detached');
      else toast.error(r.error.message);
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4" /> Case documents
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Track which documents this case requires and which have been supplied. Passport and
            other reusable docs can be attached from the beneficiary's profile.
          </p>
        </div>
        <AddRequirementDialog
          caseId={caseId}
          documentTypes={documentTypes}
          existing={existingReqTypeIds}
        />
      </CardHeader>
      <CardContent className="space-y-8">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Requirements checklist
            </h3>
            <Badge variant="secondary" className="rounded-full">
              {requirements.length}
            </Badge>
          </div>
          {requirements.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No requirements yet"
              description="Add the documents this case needs — passport, medical, police clearance, etc."
            />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {requirements.map((req) => (
                <li key={req.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{req.documentTypeName}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {req.documentTypeCode}
                      {req.hasExpiry ? ' · expiry tracked' : ''}
                      {req.isMandatory === 'OPTIONAL' ? ' · optional' : ''}
                    </p>
                  </div>
                  <select
                    value={req.status}
                    onChange={(e) =>
                      setStatus(req.id, e.target.value as CaseDocumentRequirementRow['status'])
                    }
                    className="h-8 rounded-md border bg-transparent px-2 py-0 text-xs"
                    aria-label="Requirement status"
                  >
                    <option value="MISSING">MISSING</option>
                    <option value="PROVIDED">PROVIDED</option>
                    <option value="ACCEPTED">ACCEPTED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                  <Badge variant={STATUS_VARIANT[req.status]} className="rounded-full">
                    {req.status}
                  </Badge>
                  <DocumentUploader
                    ownerType="PERSON"
                    ownerId={beneficiaryPersonId}
                    documentTypeId={req.documentTypeId}
                  />
                  <AttachDocDialog
                    caseId={caseId}
                    requirementId={req.id}
                    beneficiaryDocuments={beneficiaryDocuments}
                    alreadyAttachedIds={attachedIds}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeReq(req.id)}
                    aria-label="Remove requirement"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Attached documents
            </h3>
            <Badge variant="secondary" className="rounded-full">
              {attachedDocs.length}
            </Badge>
          </div>
          {attachedDocs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents attached yet"
              description="Upload against a requirement above, or attach an existing document from the beneficiary's profile."
            />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {attachedDocs.map((d) => (
                <li key={d.documentInstanceId} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.document.originalFilename}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {d.documentType.name} · v{d.document.version} ·{' '}
                      {d.document.status.toLowerCase()} · attached{' '}
                      {formatDistanceToNow(d.attachedAt, { addSuffix: true })}
                    </p>
                  </div>
                  {d.caseRequirementId && (
                    <Badge variant="secondary" className="rounded-full">
                      <CheckCircle2 className="mr-1 size-3" /> Linked
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => detachDoc(d.documentInstanceId)}
                    aria-label="Detach document"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
