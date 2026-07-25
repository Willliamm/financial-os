"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ObservationSubjectType } from "@/domain/entities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/forms/money-input";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { useMarkValue } from "@/features/observations/use-mark-value";

export interface MarkValueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  subjectLabel: string;
  /** Prefills the value field so a small correction is one keystroke. */
  currentValueCents: number;
}

export function MarkValueDialog({
  open,
  onOpenChange,
  householdId,
  subjectType,
  subjectId,
  subjectLabel,
  currentValueCents,
}: MarkValueDialogProps) {
  const { t } = useTranslation();
  const markValue = useMarkValue();

  const [observedAt, setObservedAt] = useState(todayIsoDate);
  const [valueCents, setValueCents] = useState(currentValueCents);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset to the subject's current state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setObservedAt(todayIsoDate());
      setValueCents(currentValueCents);
      setNote("");
      setSaving(false);
    }
  }, [open, currentValueCents]);

  async function handleSave() {
    setSaving(true);
    try {
      await markValue({
        householdId,
        subjectType,
        subjectId,
        observedAt,
        valueCents,
        note,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("observations:dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("observations:dialog.subtitle", { subject: subjectLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mark-date">{t("observations:dialog.date")}</Label>
            <Input
              id="mark-date"
              type="date"
              value={observedAt}
              max={todayIsoDate()}
              onChange={(e) => setObservedAt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="mark-value">{t("observations:dialog.value")}</Label>
            <MoneyInput
              id="mark-value"
              value={valueCents}
              onChange={setValueCents}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="mark-note">{t("observations:dialog.note")}</Label>
            <Textarea
              id="mark-note"
              rows={2}
              value={note}
              placeholder={t("observations:dialog.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("observations:dialog.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !observedAt}>
            {saving
              ? t("observations:dialog.saving")
              : t("observations:dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
