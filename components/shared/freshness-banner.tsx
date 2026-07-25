"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { SubjectFreshness } from "@/domain/engines";
import { planConfidenceBps } from "@/domain/engines";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatBps } from "@/domain/value-objects/basis-points";

export interface FreshnessBannerProps {
  rows: SubjectFreshness[];
}

/**
 * Names the data that is too old to trust. Renders nothing when everything is
 * fresh — a banner that is always on is a banner nobody reads.
 */
export function FreshnessBanner({ rows }: FreshnessBannerProps) {
  const { t } = useTranslation();
  const stale = rows.filter((r) => r.level === "stale");
  if (stale.length === 0) return null;

  const names = stale
    .slice(0, 3)
    .map((r) => r.label)
    .join(", ");

  return (
    <Alert>
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>
        {t("observations:freshness.bannerTitle", { count: stale.length })}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{t("observations:freshness.bannerBody", { names })}</span>
        <span className="text-muted-foreground">
          {t("observations:freshness.confidence")}:{" "}
          {formatBps(planConfidenceBps(rows))}
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href="/observations">{t("observations:title")}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
