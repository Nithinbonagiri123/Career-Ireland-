'use client';

import { Award, GraduationCap, Plus, Star, StarOff, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { Qualification, Skill } from '@/lib/db/schema/reference';
import {
  attachRequisitionQualificationAction,
  attachRequisitionSkillAction,
  detachRequisitionQualificationAction,
  detachRequisitionSkillAction,
} from '@/modules/requisitions/actions';
import type {
  RequisitionQualificationRow,
  RequisitionSkillRow,
} from '@/modules/requisitions/service';

// ─── Skills ───────────────────────────────────────────────────────────────────

function AttachSkillDialog({
  requisitionId,
  allSkills,
  existing,
}: {
  requisitionId: string;
  allSkills: Skill[];
  existing: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [skillId, setSkillId] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [weight, setWeight] = useState('1');
  const [pending, startTransition] = useTransition();

  const available = allSkills.filter((s) => s.isActive && !existing.has(s.id));

  const submit = () => {
    startTransition(async () => {
      const r = await attachRequisitionSkillAction({
        jobRequisitionId: requisitionId,
        skillId,
        isRequired,
        weight: Number(weight) || 1,
      });
      if (r.ok) {
        toast.success('Skill added to requisition');
        setOpen(false);
        setSkillId('');
        setIsRequired(true);
        setWeight('1');
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
            <Plus className="mr-1 size-3.5" /> Add skill
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add required skill</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="skill">Skill</Label>
            <select
              id="skill"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select…</option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="req"
              checked={isRequired}
              onCheckedChange={(v) => setIsRequired(v === true)}
            />
            <Label htmlFor="req" className="text-sm font-normal">
              Required (unchecked = nice to have)
            </Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="weight">Weight (1–10)</Label>
            <Input
              id="weight"
              type="number"
              min={1}
              max={10}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Higher weight → higher score contribution during matching.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !skillId}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequisitionSkillsSection({
  requisitionId,
  rows,
  allSkills,
}: {
  requisitionId: string;
  rows: RequisitionSkillRow[];
  allSkills: Skill[];
}) {
  const [, startTransition] = useTransition();
  const existing = new Set(rows.map((r) => r.skillId));

  const detach = (skillId: string) => {
    startTransition(async () => {
      const r = await detachRequisitionSkillAction({
        jobRequisitionId: requisitionId,
        skillId,
      });
      if (r.ok) toast.success('Skill removed');
      else toast.error(r.error.message);
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="size-4" /> Required skills
            <Badge variant="secondary" className="ml-1 rounded-full">
              {rows.length}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Structured skill requirements — used by matching to score candidates.
          </p>
        </div>
        <AttachSkillDialog
          requisitionId={requisitionId}
          allSkills={allSkills}
          existing={existing}
        />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No structured skills yet"
            description="Add the specific skills required for this job — improves matching accuracy."
          />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <li
                key={r.skillId}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs"
              >
                {r.isRequired ? (
                  <Star className="size-3 text-amber-500" />
                ) : (
                  <StarOff className="size-3 text-muted-foreground" />
                )}
                <span className="font-medium">{r.skillName}</span>
                <span className="text-muted-foreground">· w{r.weight}</span>
                <button
                  type="button"
                  onClick={() => detach(r.skillId)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                  aria-label={`Remove ${r.skillName}`}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Qualifications ───────────────────────────────────────────────────────────

function AttachQualDialog({
  requisitionId,
  allQuals,
  existing,
}: {
  requisitionId: string;
  allQuals: Qualification[];
  existing: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [qualId, setQualId] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [pending, startTransition] = useTransition();

  const available = allQuals.filter((q) => q.isActive && !existing.has(q.id));

  const submit = () => {
    startTransition(async () => {
      const r = await attachRequisitionQualificationAction({
        jobRequisitionId: requisitionId,
        qualificationId: qualId,
        isRequired,
      });
      if (r.ok) {
        toast.success('Qualification added');
        setOpen(false);
        setQualId('');
        setIsRequired(true);
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
            <Plus className="mr-1 size-3.5" /> Add qualification
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add required qualification</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="qual">Qualification</Label>
            <select
              id="qual"
              value={qualId}
              onChange={(e) => setQualId(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select…</option>
              {available.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="qreq"
              checked={isRequired}
              onCheckedChange={(v) => setIsRequired(v === true)}
            />
            <Label htmlFor="qreq" className="text-sm font-normal">
              Required (unchecked = preferred)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !qualId}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequisitionQualificationsSection({
  requisitionId,
  rows,
  allQualifications,
}: {
  requisitionId: string;
  rows: RequisitionQualificationRow[];
  allQualifications: Qualification[];
}) {
  const [, startTransition] = useTransition();
  const existing = new Set(rows.map((r) => r.qualificationId));

  const detach = (qualificationId: string) => {
    startTransition(async () => {
      const r = await detachRequisitionQualificationAction({
        jobRequisitionId: requisitionId,
        qualificationId,
      });
      if (r.ok) toast.success('Qualification removed');
      else toast.error(r.error.message);
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="size-4" /> Required qualifications
            <Badge variant="secondary" className="ml-1 rounded-full">
              {rows.length}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Certifications or diplomas the candidate must have.
          </p>
        </div>
        <AttachQualDialog
          requisitionId={requisitionId}
          allQuals={allQualifications}
          existing={existing}
        />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No qualifications required"
            description="Add certifications this role demands, or leave empty if not applicable."
          />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <li
                key={r.qualificationId}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs"
              >
                {r.isRequired ? (
                  <Star className="size-3 text-amber-500" />
                ) : (
                  <StarOff className="size-3 text-muted-foreground" />
                )}
                <span className="font-medium">{r.qualificationName}</span>
                <button
                  type="button"
                  onClick={() => detach(r.qualificationId)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted"
                  aria-label={`Remove ${r.qualificationName}`}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
