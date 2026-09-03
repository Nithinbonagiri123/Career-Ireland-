'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Reason-prompting confirmation dialog. Replaces `window.prompt()` — the native
 * prompt is silently blocked by modern browsers when triggered from within a
 * base-ui dropdown that closes on selection, so the user sees nothing happen.
 *
 * Usage:
 *   const [target, setTarget] = useState<X | null>(null);
 *   <PromptDialog
 *     open={target !== null}
 *     onCancel={() => setTarget(null)}
 *     title="Restore Jane to AVAILABLE?"
 *     label="Reason (audited)"
 *     minLength={3}
 *     confirmLabel="Restore"
 *     confirmVariant="default"
 *     pending={busy === target?.id}
 *     onConfirm={(reason) => { doAction(target!, reason); }}
 *   />
 */
export function PromptDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  label,
  placeholder,
  minLength = 3,
  maxLength = 500,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'default',
  pending = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  pending?: boolean;
}) {
  const [reason, setReason] = useState('');

  // Reset when the dialog opens or the target changes.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const canSubmit = reason.trim().length >= minLength && !pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <div className="space-y-1">
            <Label htmlFor="prompt-dialog-reason">{label ?? 'Reason'}</Label>
            <Input
              id="prompt-dialog-reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) {
                  e.preventDefault();
                  onConfirm(reason.trim());
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              At least {minLength} characters. Written to the audit log.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => onConfirm(reason.trim())}
            disabled={!canSubmit}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
