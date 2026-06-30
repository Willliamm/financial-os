"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckCircle2,
  CloudOff,
  Download,
  RefreshCcw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuthStore, useWorkbookStore, useSyncStore } from "@/lib/stores";
import { getDb } from "@/infrastructure/db/dexie";
import { resolveConflict } from "@/infrastructure/sync/conflict-resolver";
import { importWorkbook } from "@/infrastructure/sync/sync-engine";
import { getGoogleClients, isUsingMockGoogle } from "@/infrastructure/google";
import { loadFinancialContext } from "@/infrastructure/db/repositories";
import {
  formatRelative,
  isOlderThanSeconds,
} from "@/infrastructure/dates/date-utils";
import { PageHeader } from "@/components/shared/page-header";
import { SyncNowButton } from "@/components/sync/sync-status";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Turn a raw entity-type string like "income_source" into "Income Source". */
function humanize(s: string): string {
  return s
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function StatusCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
        {sub ? (
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function SyncCenterPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const workbook = useWorkbookStore((s) => s.workbook);

  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const conflictCount = useSyncStore((s) => s.conflictCount);
  const online = useSyncStore((s) => s.online);
  const workbookId = useSyncStore((s) => s.workbookId);
  const refreshCounts = useSyncStore((s) => s.refreshCounts);

  const queue =
    useLiveQuery(
      () => getDb().syncQueue.orderBy("createdAt").reverse().toArray(),
      [],
    ) ?? [];

  const commands =
    useLiveQuery(
      () =>
        getDb().commands.orderBy("createdAt").reverse().limit(20).toArray(),
      [],
    ) ?? [];

  const locks =
    useLiveQuery(
      () => getDb().locks.where("status").equals("active").toArray(),
      [],
    ) ?? [];

  const conflicts =
    useLiveQuery(
      () => getDb().conflicts.where("status").equals("open").toArray(),
      [],
    ) ?? [];

  const activeLocks = locks.filter(
    (l) => !isOlderThanSeconds(l.expiresAt, 0),
  );

  const connection = isUsingMockGoogle()
    ? t("sync:demoMode")
    : (user?.email ?? t("sync:notSignedIn"));

  async function handleReimport() {
    if (!workbookId) {
      toast.error(t("sync:toast.noWorkbook"));
      return;
    }
    try {
      const summary = await importWorkbook(getGoogleClients(), workbookId);
      await refreshCounts();
      toast.success(t("sync:toast.reimportSuccess", { count: summary.imported }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("sync:toast.reimportFailed"), { description: message });
    }
  }

  async function handleExport() {
    try {
      const ctx = await loadFinancialContext();
      const blob = new Blob([JSON.stringify(ctx, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `financial-os-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t("sync:toast.backupDownloaded"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("sync:toast.exportFailed"), { description: message });
    }
  }

  async function handleResolve(id: string, resolution: "local" | "remote") {
    await resolveConflict(id, resolution);
    await refreshCounts();
    toast.success(
      resolution === "local"
        ? t("sync:toast.keptYours")
        : t("sync:toast.usedRemote"),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sync:title")}
        description={t("sync:description")}
      >
        <SyncNowButton />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard label={t("sync:googleConnection")} value={connection} />
        <StatusCard
          label={t("sync:workbook")}
          value={workbook?.name ?? t("sync:notConnected")}
          sub={workbook?.id ?? workbookId ?? undefined}
        />
        <StatusCard
          label={t("sync:lastSync")}
          value={formatRelative(lastSyncedAt)}
          sub={t("sync:statusLabel", { status })}
        />
        <StatusCard
          label={t("sync:pendingChanges")}
          value={String(pendingCount)}
        />
        <StatusCard
          label={t("sync:conflictsTitle")}
          value={String(conflictCount)}
        />
        <StatusCard
          label={t("sync:connectionLabel")}
          value={online ? t("common:status.online") : t("common:status.offline")}
          sub={online ? undefined : t("sync:offlineSubtext")}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void handleReimport()}>
          <RefreshCcw className="size-4" />
          {t("sync:reimport")}
        </Button>
        <Button variant="outline" onClick={() => void handleExport()}>
          <Download className="size-4" />
          {t("sync:exportBackup")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {conflicts.length > 0 ? (
              <CloudOff className="size-4 text-red-600 dark:text-red-400" />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            )}
            {t("sync:conflictsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("sync:noConflicts")}
            </p>
          ) : (
            <div className="space-y-3">
              {conflicts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{humanize(c.entityType)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("sync:versionInfo", {
                        local: c.localVersion,
                        remote: c.remoteVersion,
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleResolve(c.id, "local")}
                    >
                      {t("sync:keepMine")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleResolve(c.id, "remote")}
                    >
                      {t("sync:useRemote")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sync:queueTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {queue.length === 0 ? (
            <EmptyState
              icon={<Wifi className="size-7" />}
              title={t("sync:queueEmptyTitle")}
              description={t("sync:queueEmptyDescription")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sync:table.entity")}</TableHead>
                  <TableHead>{t("sync:table.operation")}</TableHead>
                  <TableHead>{t("sync:table.status")}</TableHead>
                  <TableHead className="text-right">
                    {t("sync:table.attempts")}
                  </TableHead>
                  <TableHead>{t("sync:table.created")}</TableHead>
                  <TableHead>{t("sync:table.error")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {humanize(item.entityType)}
                    </TableCell>
                    <TableCell>{item.operation}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.attempts}
                    </TableCell>
                    <TableCell>{formatRelative(item.createdAt)}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-red-600 dark:text-red-400">
                      {item.errorMessage ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sync:commandsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {commands.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("sync:noCommands")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sync:table.type")}</TableHead>
                  <TableHead>{t("sync:table.status")}</TableHead>
                  <TableHead>{t("sync:table.created")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commands.map((cmd) => (
                  <TableRow key={cmd.id}>
                    <TableCell className="font-medium">{humanize(cmd.type)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{cmd.status}</Badge>
                    </TableCell>
                    <TableCell>{formatRelative(cmd.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sync:locksTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activeLocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("sync:noLocks")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sync:table.resource")}</TableHead>
                  <TableHead>{t("sync:table.owner")}</TableHead>
                  <TableHead>{t("sync:table.expires")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeLocks.map((lock) => (
                  <TableRow key={lock.resourceKey}>
                    <TableCell className="font-medium">
                      {lock.resourceKey}
                    </TableCell>
                    <TableCell>{lock.ownerName}</TableCell>
                    <TableCell>{formatRelative(lock.expiresAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!online ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <WifiOff className="size-4" />
          {t("sync:offlineFooter")}
        </p>
      ) : null}
    </div>
  );
}
