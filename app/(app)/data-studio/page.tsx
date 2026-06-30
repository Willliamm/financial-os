"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncNowButton, SyncStatusPill } from "@/components/sync/sync-status";
import { useFinancialContext } from "@/lib/queries/financial-data";
import {
  DATA_STUDIO_MODULES,
  getEntityConfig,
} from "@/features/data-studio/registry";
import { selectEntities } from "@/features/data-studio/list-screen";

export default function DataStudioPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dataStudio:page.title")}
        description={t("dataStudio:page.description")}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <SyncStatusPill />
          <SyncNowButton />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DATA_STUDIO_MODULES.map((type) => {
          const config = getEntityConfig(type);
          const count = selectEntities(context, type).length;
          const Icon = config.icon;
          return (
            <Card key={type} className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center rounded-md bg-accent">
                    <Icon className="size-4" />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums">{count}</span>
                </div>
                <div>
                  <p className="font-medium">{t(config.plural)}</p>
                  <p className="text-sm text-muted-foreground">{t(config.description)}</p>
                </div>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link href={config.href}>
                    {t("common:actions.edit")}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
