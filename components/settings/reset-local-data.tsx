"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resetLocalData } from "@/lib/reset";

/**
 * Danger-zone action: wipe all locally stored financial data after an explicit
 * confirmation, then reload so the app re-bootstraps from a clean state. Useful
 * to clear leftover demo data or when switching Google accounts.
 */
export function ResetLocalData() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      await resetLocalData();
      toast.success(t("settings:reset.done"));
      // Reload so every store re-initializes against the fresh database.
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("settings:reset.failed"), { description: message });
      setResetting(false);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="size-4" />
          {t("settings:reset.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings:reset.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings:reset.confirmDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={resetting}>
              {t("common:actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => void handleReset()}
            disabled={resetting}
          >
            {resetting ? <Loader2 className="size-4 animate-spin" /> : null}
            {resetting
              ? t("settings:reset.resetting")
              : t("settings:reset.confirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
