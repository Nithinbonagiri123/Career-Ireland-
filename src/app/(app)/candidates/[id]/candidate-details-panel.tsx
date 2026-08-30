'use client';

import { Award, Briefcase, GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
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
import type { EmploymentHistory } from '@/lib/db/schema/candidate_details';
import type { Qualification, Skill } from '@/lib/db/schema/reference';
import {
  addCandidateQualificationAction,
  addCandidateSkillAction,
  removeCandidateQualificationAction,
  removeCandidateSkillAction,
  removeEmploymentHistoryAction,
  updateCandidateQualificationAction,
  updateCandidateSkillAction,
  upsertEmploymentHistoryAction,
} from '@/modules/candidate-details/actions';
import type {
  CandidateQualificationRow,
  CandidateSkillRow,
} from '@/modules/candidate-details/service';

// ─── Skills ───────────────────────────────────────────────────────────────────

const PROF_LABEL = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
} as const;

function SkillDialog({
  personId,
  allSkills,
  existing,
  editingRow,
  onDone,
}: {
  personId: string;
  allSkills: Skill[];
  existing: Set<string>;
  editingRow?: CandidateSkillRow;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [skillId, setSkillId] = useState(editingRow?.skillId ?? '');
  const [proficiency, setProficiency] = useState<keyof typeof PROF_LABEL>(
    editingRow?.proficiency ?? 'INTERMEDIATE',
  );
  const [years, setYears] = useState(editingRow?.yearsExperience?.toString() ?? '');
  const [notes, setNotes] = useState(editingRow?.notes ?? '');
  const [pending, startTransition] = useTransition();

  const availableSkills = allSkills.filter(
    (s) => s.isActive && (s.id === skillId || !existing.has(s.id)),
  );

  const submit = () => {
    startTransition(async () => {
      const yearsN = years.trim().length === 0 ? null : Number(years);
      const r = editingRow
        ? await updateCandidateSkillAction(
            {
              id: editingRow.id,
              proficiency,
              yearsExperience: yearsN,
              notes,
            },
            personId,
          )
        : await addCandidateSkillAction({
            personId,
            skillId,
            proficiency,
            yearsExperience: yearsN,
            notes,
          });
      if (r.ok) {
        toast.success(editingRow ? 'Skill updated' : 'Skill added');
        setOpen(false);
        onDone();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          editingRow ? (
            <Button size="sm" variant="ghost" aria-label="Edit skill">
              <Pencil className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="outline">
              <Plus className="mr-1 size-3.5" /> Add skill
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRow ? 'Edit skill' : 'Add skill'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!editingRow && (
            <div className="space-y-1">
              <Label htmlFor="skill">Skill</Label>
              <select
                id="skill"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select…</option>
                {availableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="prof">Proficiency</Label>
            <select
              id="prof"
              value={proficiency}
              onChange={(e) => setProficiency(e.target.value as keyof typeof PROF_LABEL)}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              {Object.entries(PROF_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="years">Years of experience</Label>
            <Input
              id="years"
              type="number"
              min={0}
              max={80}
              value={years}
              onChange={(e) => setYears(e.target.value)}
              placeholder="e.g. 3"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || (!editingRow && !skillId)}>
            {editingRow ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillsSection({
  personId,
  rows,
  allSkills,
}: {
  personId: string;
  rows: CandidateSkillRow[];
  allSkills: Skill[];
}) {
  const [, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const existing = new Set(rows.map((r) => r.skillId));

  const remove = (id: string) => {
    if (!confirm('Remove this skill?')) return;
    startTransition(async () => {
      const r = await removeCandidateSkillAction({ id }, personId);
      if (r.ok) toast.success('Skill removed');
      else toast.error(r.error.message);
      refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="size-4" /> Skills
          <Badge variant="secondary" className="ml-1 rounded-full">
            {rows.length}
          </Badge>
        </CardTitle>
        <SkillDialog
          personId={personId}
          allSkills={allSkills}
          existing={existing}
          onDone={refresh}
          key={`add-${tick}`}
        />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No skills recorded"
            description="Add the skills this candidate has — used for matching."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.skillName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {PROF_LABEL[r.proficiency]}
                    {r.yearsExperience ? ` · ${r.yearsExperience}y` : ''}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <SkillDialog
                    personId={personId}
                    allSkills={allSkills}
                    existing={existing}
                    editingRow={r}
                    onDone={refresh}
                    key={`edit-${r.id}-${tick}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="Remove skill"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Qualifications ───────────────────────────────────────────────────────────

function QualificationDialog({
  personId,
  allQuals,
  existing,
  editingRow,
  onDone,
}: {
  personId: string;
  allQuals: Qualification[];
  existing: Set<string>;
  editingRow?: CandidateQualificationRow;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [qualId, setQualId] = useState(editingRow?.qualificationId ?? '');
  const [awardedOn, setAwardedOn] = useState(editingRow?.awardedOn ?? '');
  const [institution, setInstitution] = useState(editingRow?.institution ?? '');
  const [refNumber, setRefNumber] = useState(editingRow?.referenceNumber ?? '');
  const [notes, setNotes] = useState(editingRow?.notes ?? '');
  const [pending, startTransition] = useTransition();

  const available = allQuals.filter((q) => q.isActive && (q.id === qualId || !existing.has(q.id)));

  const submit = () => {
    startTransition(async () => {
      const r = editingRow
        ? await updateCandidateQualificationAction(
            {
              id: editingRow.id,
              awardedOn,
              institution,
              referenceNumber: refNumber,
              notes,
            },
            personId,
          )
        : await addCandidateQualificationAction({
            personId,
            qualificationId: qualId,
            awardedOn,
            institution,
            referenceNumber: refNumber,
            notes,
          });
      if (r.ok) {
        toast.success(editingRow ? 'Qualification updated' : 'Qualification added');
        setOpen(false);
        onDone();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          editingRow ? (
            <Button size="sm" variant="ghost" aria-label="Edit qualification">
              <Pencil className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="outline">
              <Plus className="mr-1 size-3.5" /> Add qualification
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRow ? 'Edit qualification' : 'Add qualification'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!editingRow && (
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
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="awardedOn">Awarded on</Label>
              <Input
                id="awardedOn"
                type="date"
                value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="institution">Institution</Label>
              <Input
                id="institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref">Reference / certificate number</Label>
            <Input id="ref" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qnotes">Notes</Label>
            <Input id="qnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || (!editingRow && !qualId)}>
            {editingRow ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QualificationsSection({
  personId,
  rows,
  allQualifications,
}: {
  personId: string;
  rows: CandidateQualificationRow[];
  allQualifications: Qualification[];
}) {
  const [, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const existing = new Set(rows.map((r) => r.qualificationId));

  const remove = (id: string) => {
    if (!confirm('Remove this qualification?')) return;
    startTransition(async () => {
      const r = await removeCandidateQualificationAction({ id }, personId);
      if (r.ok) toast.success('Qualification removed');
      else toast.error(r.error.message);
      refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-4" /> Qualifications
          <Badge variant="secondary" className="ml-1 rounded-full">
            {rows.length}
          </Badge>
        </CardTitle>
        <QualificationDialog
          personId={personId}
          allQuals={allQualifications}
          existing={existing}
          onDone={refresh}
          key={`add-${tick}`}
        />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No qualifications recorded"
            description="Add certifications and diplomas — used to match candidates to jobs that require them."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.qualificationName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.institution ? `${r.institution}` : 'Institution not set'}
                    {r.awardedOn ? ` · ${r.awardedOn}` : ''}
                    {r.referenceNumber ? ` · ref ${r.referenceNumber}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <QualificationDialog
                    personId={personId}
                    allQuals={allQualifications}
                    existing={existing}
                    editingRow={r}
                    onDone={refresh}
                    key={`edit-${r.id}-${tick}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="Remove qualification"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Employment history ───────────────────────────────────────────────────────

function EmploymentDialog({
  personId,
  editingRow,
  onDone,
}: {
  personId: string;
  editingRow?: EmploymentHistory;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [employerName, setEmployerName] = useState(editingRow?.employerName ?? '');
  const [jobTitle, setJobTitle] = useState(editingRow?.jobTitle ?? '');
  const [location, setLocation] = useState(editingRow?.location ?? '');
  const [startDate, setStartDate] = useState(editingRow?.startDate ?? '');
  const [endDate, setEndDate] = useState(editingRow?.endDate ?? '');
  const [isCurrent, setIsCurrent] = useState(editingRow?.isCurrent ?? false);
  const [description, setDescription] = useState(editingRow?.description ?? '');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await upsertEmploymentHistoryAction({
        id: editingRow?.id,
        personId,
        employerName,
        jobTitle,
        location,
        startDate,
        endDate: isCurrent ? '' : endDate,
        isCurrent,
        description,
      });
      if (r.ok) {
        toast.success(editingRow ? 'Employment updated' : 'Employment added');
        setOpen(false);
        onDone();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          editingRow ? (
            <Button size="sm" variant="ghost" aria-label="Edit role">
              <Pencil className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="outline">
              <Plus className="mr-1 size-3.5" /> Add role
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRow ? 'Edit role' : 'Add employment history'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="empName">Employer *</Label>
            <Input
              id="empName"
              value={employerName}
              onChange={(e) => setEmployerName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="jobTitle">Job title</Label>
              <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isCurrent}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="current"
              checked={isCurrent}
              onCheckedChange={(v) => setIsCurrent(v === true)}
            />
            <Label htmlFor="current" className="text-sm font-normal">
              Currently working here
            </Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional summary of role"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || employerName.trim().length === 0}>
            {editingRow ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmploymentHistorySection({
  personId,
  rows,
}: {
  personId: string;
  rows: EmploymentHistory[];
}) {
  const [, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const remove = (id: string) => {
    if (!confirm('Remove this employment entry?')) return;
    startTransition(async () => {
      const r = await removeEmploymentHistoryAction({ id }, personId);
      if (r.ok) toast.success('Employment removed');
      else toast.error(r.error.message);
      refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="size-4" /> Employment history
          <Badge variant="secondary" className="ml-1 rounded-full">
            {rows.length}
          </Badge>
        </CardTitle>
        <EmploymentDialog personId={personId} onDone={refresh} key={`add-${tick}`} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No prior roles recorded"
            description="Add past jobs to strengthen the candidate CV."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.jobTitle ? `${r.jobTitle} · ` : ''}
                    {r.employerName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.startDate ?? '?'} – {r.isCurrent ? 'present' : (r.endDate ?? '?')}
                    {r.location ? ` · ${r.location}` : ''}
                  </p>
                  {r.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <EmploymentDialog
                    personId={personId}
                    editingRow={r}
                    onDone={refresh}
                    key={`edit-${r.id}-${tick}`}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(r.id)}
                    aria-label="Remove role"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
