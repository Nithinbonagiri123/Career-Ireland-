import { and, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { invoices, receipts } from '@/lib/db/schema/billing';
import { documentInstances } from '@/lib/db/schema/documents';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import { documentTypes } from '@/lib/db/schema/reference';

/**
 * "Documents hub" — every downloadable / openable artifact in the CRM
 * merged into one flat list. Powers `/documents` so operators don't have
 * to bounce through candidate profiles to grab a CV, an invoice, or a
 * receipt.
 *
 * Three sources are unioned:
 *   1. Uploaded S3 documents (CVs, passports, payment proofs…)
 *   2. Invoices (INV-YYYY-NNNNNN) — link opens the print page
 *   3. Receipts (RCT-YYYY-NNNNNN) — link opens the print page
 *
 * All rows are flattened to one shape so the client table has a single
 * render path with per-kind branches for the actions column.
 */

export type DocumentHubKind = 'UPLOADED' | 'INVOICE' | 'RECEIPT';

export type DocumentsHubRow = {
  /** Stable key for React + downstream mutations. Instance id for
      uploaded docs; invoice/receipt id for financial ones. */
  id: string;
  kind: DocumentHubKind;
  ownerId: string;
  ownerKind: 'PERSON' | 'EMPLOYER';
  ownerName: string;
  /** Category label: "CV / Résumé", "Invoice", "Receipt". */
  typeLabel: string;
  /** Filename OR INV/RCT number — what the operator scans for. */
  reference: string;
  createdAt: Date;

  // Uploaded-only:
  fileSizeBytes?: number;
  status?: string;
  version?: number;
  documentInstanceId?: string;

  // Financial-only:
  amount?: string;
  currencyCode?: string;
  financialStatus?: 'ISSUED' | 'PAID' | 'VOIDED';
  number?: string;
};

export async function fetchDocumentsHub(input: {
  kind: 'ALL' | DocumentHubKind;
  createdRange?: DateRange;
  ownerQ?: string;
  /** Optional: restrict every source to a specific client (person or employer). */
  ownerId?: string;
  ownerKind?: 'PERSON' | 'EMPLOYER';
}): Promise<DocumentsHubRow[]> {
  await requireInternalStaff();
  const q = input.ownerQ?.trim();
  const like = q ? `%${q}%` : null;
  const scope =
    input.ownerId && input.ownerKind
      ? { id: input.ownerId, kind: input.ownerKind }
      : null;

  const wantUploaded = input.kind === 'ALL' || input.kind === 'UPLOADED';
  const wantInvoices = input.kind === 'ALL' || input.kind === 'INVOICE';
  const wantReceipts = input.kind === 'ALL' || input.kind === 'RECEIPT';

  const [uploaded, invRows, rctRows] = await Promise.all([
    wantUploaded ? fetchUploaded(input.createdRange, like, scope) : Promise.resolve([]),
    wantInvoices ? fetchInvoices(input.createdRange, like, scope) : Promise.resolve([]),
    wantReceipts ? fetchReceipts(input.createdRange, like, scope) : Promise.resolve([]),
  ]);

  // Interleave by createdAt DESC.
  return [...uploaded, ...invRows, ...rctRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/**
 * Client folders for the /documents landing view. One entry per
 * person/employer that has at least one artifact (uploaded file OR
 * invoice OR receipt). Computed by grouping the same rows the hub
 * fetches — no separate SQL — so the counts always match the "open
 * folder" table exactly.
 */
export type ClientFolder = {
  ownerId: string;
  ownerKind: 'PERSON' | 'EMPLOYER';
  ownerName: string;
  filesCount: number;
  invoicesCount: number;
  receiptsCount: number;
  totalCount: number;
  lastActivity: Date;
};

export async function fetchDocumentClientFolders(input: {
  ownerQ?: string;
}): Promise<ClientFolder[]> {
  const rows = await fetchDocumentsHub({ kind: 'ALL', ownerQ: input.ownerQ });
  const folders = new Map<string, ClientFolder>();
  for (const row of rows) {
    if (!row.ownerId) continue;
    const key = `${row.ownerKind}:${row.ownerId}`;
    let f = folders.get(key);
    if (!f) {
      f = {
        ownerId: row.ownerId,
        ownerKind: row.ownerKind,
        ownerName: row.ownerName,
        filesCount: 0,
        invoicesCount: 0,
        receiptsCount: 0,
        totalCount: 0,
        lastActivity: row.createdAt,
      };
      folders.set(key, f);
    }
    if (row.kind === 'UPLOADED') f.filesCount++;
    else if (row.kind === 'INVOICE') f.invoicesCount++;
    else if (row.kind === 'RECEIPT') f.receiptsCount++;
    f.totalCount++;
    if (row.createdAt.getTime() > f.lastActivity.getTime()) {
      f.lastActivity = row.createdAt;
    }
  }
  return Array.from(folders.values()).sort(
    (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime(),
  );
}

async function fetchUploaded(
  range: DateRange | undefined,
  like: string | null,
  scope: { id: string; kind: 'PERSON' | 'EMPLOYER' } | null,
): Promise<DocumentsHubRow[]> {
  const wheres: SQL[] = [isNull(documentInstances.voidedAt)];
  const rangeCond = range ? dateRangeWhere(documentInstances.createdAt, range) : undefined;
  if (rangeCond) wheres.push(rangeCond);
  if (scope) {
    wheres.push(
      scope.kind === 'PERSON'
        ? eq(documentInstances.ownerPersonId, scope.id)
        : eq(documentInstances.ownerEmployerId, scope.id),
    );
  }

  const rows = await db
    .select({
      instance: documentInstances,
      typeName: documentTypes.name,
      personFirst: persons.firstName,
      personLast: persons.lastName,
      employerLegalName: employers.legalName,
    })
    .from(documentInstances)
    .innerJoin(documentTypes, eq(documentTypes.id, documentInstances.documentTypeId))
    .leftJoin(persons, eq(persons.id, documentInstances.ownerPersonId))
    .leftJoin(employers, eq(employers.id, documentInstances.ownerEmployerId))
    .where(and(...wheres))
    .orderBy(desc(documentInstances.createdAt));

  return rows
    .map((r): DocumentsHubRow => {
      const ownerName =
        r.personFirst && r.personLast
          ? `${r.personFirst} ${r.personLast}`
          : (r.employerLegalName ?? '(unknown)');
      return {
        id: r.instance.id,
        kind: 'UPLOADED',
        ownerId: r.instance.ownerPersonId ?? r.instance.ownerEmployerId ?? '',
        ownerKind: r.instance.ownerPersonId ? 'PERSON' : 'EMPLOYER',
        ownerName,
        typeLabel: r.typeName,
        reference: r.instance.displayName ?? r.instance.originalFilename,
        createdAt: r.instance.createdAt,
        fileSizeBytes: r.instance.fileSizeBytes,
        status: r.instance.status,
        version: r.instance.version,
        documentInstanceId: r.instance.id,
      };
    })
    .filter((r) => (like ? r.ownerName.toLowerCase().includes(like.replace(/%/g, '').toLowerCase()) : true));
}

async function fetchInvoices(
  range: DateRange | undefined,
  like: string | null,
  scope: { id: string; kind: 'PERSON' | 'EMPLOYER' } | null,
): Promise<DocumentsHubRow[]> {
  const wheres: SQL[] = [];
  const rangeCond = range ? dateRangeWhere(invoices.issuedAt, range) : undefined;
  if (rangeCond) wheres.push(rangeCond);
  if (scope) {
    wheres.push(
      scope.kind === 'PERSON'
        ? eq(invoices.payerPersonId, scope.id)
        : eq(invoices.payerEmployerId, scope.id),
    );
  }
  // Owner name search runs across both person and employer names; do it
  // as an OR ilike so a single query covers both payer types.
  if (like) {
    const person = or(ilike(persons.firstName, like), ilike(persons.lastName, like));
    const employer = ilike(employers.legalName, like);
    const combined = or(person, employer);
    if (combined) wheres.push(combined);
  }

  const rows = await db
    .select({
      invoice: invoices,
      personFirst: persons.firstName,
      personLast: persons.lastName,
      employerLegalName: employers.legalName,
    })
    .from(invoices)
    .leftJoin(persons, eq(persons.id, invoices.payerPersonId))
    .leftJoin(employers, eq(employers.id, invoices.payerEmployerId))
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(invoices.issuedAt));

  return rows.map((r): DocumentsHubRow => {
    const ownerName =
      r.personFirst && r.personLast
        ? `${r.personFirst} ${r.personLast}`
        : (r.employerLegalName ?? '(unknown)');
    return {
      id: r.invoice.id,
      kind: 'INVOICE',
      ownerId: r.invoice.payerPersonId ?? r.invoice.payerEmployerId ?? '',
      ownerKind: r.invoice.payerPersonId ? 'PERSON' : 'EMPLOYER',
      ownerName,
      typeLabel: 'Invoice',
      reference: r.invoice.number,
      createdAt: r.invoice.issuedAt,
      amount: r.invoice.totalAmount,
      currencyCode: r.invoice.currencyCode,
      financialStatus: r.invoice.status,
      number: r.invoice.number,
    };
  });
}

async function fetchReceipts(
  range: DateRange | undefined,
  like: string | null,
  scope: { id: string; kind: 'PERSON' | 'EMPLOYER' } | null,
): Promise<DocumentsHubRow[]> {
  const wheres: SQL[] = [];
  const rangeCond = range ? dateRangeWhere(receipts.issuedAt, range) : undefined;
  if (rangeCond) wheres.push(rangeCond);
  if (scope) {
    wheres.push(
      scope.kind === 'PERSON'
        ? eq(receipts.payerPersonId, scope.id)
        : eq(receipts.payerEmployerId, scope.id),
    );
  }
  if (like) {
    const person = or(ilike(persons.firstName, like), ilike(persons.lastName, like));
    const employer = ilike(employers.legalName, like);
    const combined = or(person, employer);
    if (combined) wheres.push(combined);
  }

  const rows = await db
    .select({
      receipt: receipts,
      personFirst: persons.firstName,
      personLast: persons.lastName,
      employerLegalName: employers.legalName,
    })
    .from(receipts)
    .leftJoin(persons, eq(persons.id, receipts.payerPersonId))
    .leftJoin(employers, eq(employers.id, receipts.payerEmployerId))
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(receipts.issuedAt));

  return rows.map((r): DocumentsHubRow => {
    const ownerName =
      r.personFirst && r.personLast
        ? `${r.personFirst} ${r.personLast}`
        : (r.employerLegalName ?? '(unknown)');
    return {
      id: r.receipt.id,
      kind: 'RECEIPT',
      ownerId: r.receipt.payerPersonId ?? r.receipt.payerEmployerId ?? '',
      ownerKind: r.receipt.payerPersonId ? 'PERSON' : 'EMPLOYER',
      ownerName,
      typeLabel: 'Receipt',
      reference: r.receipt.number,
      createdAt: r.receipt.issuedAt,
      amount: r.receipt.amount,
      currencyCode: r.receipt.currencyCode,
      number: r.receipt.number,
    };
  });
}
