"use client";

import { Lock, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { LockResult } from "@/infrastructure/sync/lock-manager";

/**
 * Shown inside an editor when the resource is locked by another session, or
 * when a previous lock had expired and was taken over.
 */
export function LockBanner({ lock }: { lock: LockResult | null }) {
  const { t } = useTranslation();
  if (!lock) return null;

  if (lock.mode === "readonly") {
    const name = lock.heldBy?.name ?? t("common:locks.anotherUser");
    const rawEmail = lock.heldBy?.email ?? "";
    const email = rawEmail ? ` (${rawEmail})` : "";
    return (
      <Alert variant="destructive">
        <Lock className="size-4" />
        <AlertTitle>{t("common:locks.readonlyTitle")}</AlertTitle>
        <AlertDescription>
          {t("common:locks.readonlyBody", { name, email })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Unlock className="size-4" />
      <AlertTitle>{t("common:locks.ownerTitle")}</AlertTitle>
      <AlertDescription>{t("common:locks.ownerBody")}</AlertDescription>
    </Alert>
  );
}
