"use client";

import {
  AlertTriangle,
  Check,
  CloudOff,
  Loader2,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/infrastructure/dates/date-utils";
import { useSyncStore, type SyncStatus } from "@/lib/stores/sync-store";

const STATUS_META: Record<
  SyncStatus,
  { labelKey: string; icon: React.ReactNode; className: string }
> = {
  idle: {
    labelKey: "common:status.upToDate",
    icon: <Check className="size-3.5" />,
    className: "text-muted-foreground",
  },
  synced: {
    labelKey: "common:status.synced",
    icon: <Check className="size-3.5" />,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  dirty: {
    labelKey: "common:status.localChanges",
    icon: <CloudOff className="size-3.5" />,
    className: "text-amber-600 dark:text-amber-400",
  },
  syncing: {
    labelKey: "common:status.syncing",
    icon: <Loader2 className="size-3.5 animate-spin" />,
    className: "text-blue-600 dark:text-blue-400",
  },
  offline: {
    labelKey: "common:status.offline",
    icon: <WifiOff className="size-3.5" />,
    className: "text-muted-foreground",
  },
  failed: {
    labelKey: "common:status.syncFailed",
    icon: <AlertTriangle className="size-3.5" />,
    className: "text-red-600 dark:text-red-400",
  },
  conflict: {
    labelKey: "common:status.conflicts",
    icon: <AlertTriangle className="size-3.5" />,
    className: "text-red-600 dark:text-red-400",
  },
};

export function SyncStatusPill() {
  const { t } = useTranslation();
  const status = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pendingCount);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const meta = STATUS_META[status];

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn("flex items-center gap-1.5 font-medium", meta.className)}>
        {meta.icon}
        {t(meta.labelKey)}
        {pending > 0 && status !== "syncing" ? (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5">
            {pending}
          </Badge>
        ) : null}
      </span>
      <span className="hidden text-muted-foreground sm:inline">
        · {formatRelative(lastSyncedAt)}
      </span>
    </div>
  );
}

export function SyncNowButton({
  size = "sm",
  variant = "outline",
}: {
  size?: "sm" | "default";
  variant?: "outline" | "default" | "secondary";
}) {
  const { t } = useTranslation();
  const sync = useSyncStore((s) => s.sync);
  const status = useSyncStore((s) => s.status);
  const online = useSyncStore((s) => s.online);
  const syncing = status === "syncing";

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => void sync()}
      disabled={syncing || !online}
    >
      <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
      {syncing ? t("common:status.syncing") : t("common:actions.syncNow")}
    </Button>
  );
}
