"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { FilingStatus, Household, TaxAssumption } from "@/domain/entities";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { useEntityActions } from "@/features/data-studio/use-entity-actions";
import { useWorkbookStore } from "@/lib/stores";
import { loadFinancialContext } from "@/infrastructure/db/repositories";
import { currentYear } from "@/infrastructure/dates/date-utils";
import { APP_SCHEMA_VERSION, LOCK_TTL_SECONDS } from "@/lib/constants";
import { PageHeader } from "@/components/shared/page-header";
import { MoneyInput } from "@/components/forms/money-input";
import { PercentInput } from "@/components/forms/percent-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { ResetLocalData } from "@/components/settings/reset-local-data";

const FILING_STATUS_VALUES: FilingStatus[] = [
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
];

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "CAD", "AUD", "BRL", "JPY"];

const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "BR", label: "Brazil" },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const { update, create } = useEntityActions();
  const workbook = useWorkbookStore((s) => s.workbook);

  const household = context.household;
  const ty = currentYear();
  const assumption =
    context.taxAssumptions.find((t) => t.year === ty && !t.deletedAt) ?? null;

  const [hh, setHh] = useState({
    name: "",
    baseCurrency: "USD",
    country: "",
    state: "",
    city: "",
    filingStatus: "single" as FilingStatus,
  });

  const [tax, setTax] = useState({
    federalEffectiveRateBps: 0,
    stateEffectiveRateBps: 0,
    standardDeductionCents: 0,
  });

  const [autoSync, setAutoSync] = useState(true);
  const [savingHh, setSavingHh] = useState(false);
  const [savingTax, setSavingTax] = useState(false);

  useEffect(() => {
    if (household) {
      setHh({
        name: household.name,
        baseCurrency: household.baseCurrency,
        country: household.country,
        state: household.state,
        city: household.city,
        filingStatus: household.filingStatus,
      });
    }
  }, [household]);

  useEffect(() => {
    if (assumption) {
      setTax({
        federalEffectiveRateBps: assumption.federalEffectiveRateBps,
        stateEffectiveRateBps: assumption.stateEffectiveRateBps,
        standardDeductionCents: assumption.standardDeductionCents,
      });
    }
  }, [assumption]);

  useEffect(() => {
    const stored = localStorage.getItem("fos_auto_sync");
    if (stored !== null) setAutoSync(stored === "true");
  }, []);

  function toggleAutoSync(value: boolean) {
    setAutoSync(value);
    localStorage.setItem("fos_auto_sync", String(value));
  }

  async function saveHousehold() {
    if (!household) return;
    setSavingHh(true);
    try {
      await update<Household>(
        "household",
        { id: household.id, ...hh },
        { sync: true },
      );
    } finally {
      setSavingHh(false);
    }
  }

  async function saveTax() {
    setSavingTax(true);
    try {
      if (assumption) {
        await update<TaxAssumption>(
          "tax_assumption",
          { id: assumption.id, ...tax },
          { sync: true },
        );
      } else if (household) {
        await create<TaxAssumption>(
          "tax_assumption",
          {
            householdId: household.id,
            year: ty,
            filingStatus: hh.filingStatus,
            federalEffectiveRateBps: tax.federalEffectiveRateBps,
            stateEffectiveRateBps: tax.stateEffectiveRateBps,
            selfEmploymentTaxRateBps: 0,
            ficaRateBps: 0,
            standardDeductionCents: tax.standardDeductionCents,
            itemizedDeductionCents: 0,
          },
          { sync: true },
        );
      }
    } finally {
      setSavingTax(false);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings:title")}
        description={t("settings:description")}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("common:language")}</CardTitle>
          <CardDescription>
            {t("settings:languageDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <LanguageSwitcher />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings:household.title")}</CardTitle>
          <CardDescription>
            {t("settings:household.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!household ? (
            <p className="text-sm text-muted-foreground">
              {t("settings:household.empty")}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="hh-name">{t("settings:household.name")}</Label>
                  <Input
                    id="hh-name"
                    value={hh.name}
                    onChange={(e) => setHh({ ...hh, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hh-currency">
                    {t("settings:household.baseCurrency")}
                  </Label>
                  <Select
                    value={hh.baseCurrency}
                    onValueChange={(v) => setHh({ ...hh, baseCurrency: v })}
                  >
                    <SelectTrigger id="hh-currency" className="w-full">
                      <SelectValue placeholder={t("settings:selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hh-country">
                    {t("settings:household.country")}
                  </Label>
                  <Select
                    value={hh.country}
                    onValueChange={(v) => setHh({ ...hh, country: v })}
                  >
                    <SelectTrigger id="hh-country" className="w-full">
                      <SelectValue placeholder={t("settings:selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hh-state">
                    {t("settings:household.state")}
                  </Label>
                  <Input
                    id="hh-state"
                    value={hh.state}
                    onChange={(e) => setHh({ ...hh, state: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hh-city">{t("settings:household.city")}</Label>
                  <Input
                    id="hh-city"
                    value={hh.city}
                    onChange={(e) => setHh({ ...hh, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hh-filing">
                    {t("settings:household.filingStatusLabel")}
                  </Label>
                  <Select
                    value={hh.filingStatus}
                    onValueChange={(v) =>
                      setHh({ ...hh, filingStatus: v as FilingStatus })
                    }
                  >
                    <SelectTrigger id="hh-filing" className="w-full">
                      <SelectValue placeholder={t("settings:selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {FILING_STATUS_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`settings:filingStatus.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => void saveHousehold()} disabled={savingHh}>
                {savingHh ? <Loader2 className="size-4 animate-spin" /> : null}
                {savingHh
                  ? t("common:status.saving")
                  : t("settings:household.save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings:tax.title", { year: ty })}</CardTitle>
          <CardDescription>
            {t("settings:tax.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tax-fed">{t("settings:tax.federalRate")}</Label>
              <PercentInput
                id="tax-fed"
                value={tax.federalEffectiveRateBps}
                onChange={(bps) =>
                  setTax({ ...tax, federalEffectiveRateBps: bps })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax-state">{t("settings:tax.stateRate")}</Label>
              <PercentInput
                id="tax-state"
                value={tax.stateEffectiveRateBps}
                onChange={(bps) =>
                  setTax({ ...tax, stateEffectiveRateBps: bps })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax-deduction">
                {t("settings:tax.standardDeduction")}
              </Label>
              <MoneyInput
                id="tax-deduction"
                value={tax.standardDeductionCents}
                onChange={(cents) =>
                  setTax({ ...tax, standardDeductionCents: cents })
                }
              />
            </div>
          </div>
          <Button
            onClick={() => void saveTax()}
            disabled={savingTax || (!assumption && !household)}
          >
            {savingTax ? <Loader2 className="size-4 animate-spin" /> : null}
            {savingTax
              ? t("common:status.saving")
              : assumption
                ? t("settings:tax.save")
                : t("settings:tax.create")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings:sync.title")}</CardTitle>
          <CardDescription>
            {t("settings:sync.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {t("settings:sync.autoTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings:sync.autoDescription")}
              </p>
            </div>
            <Switch checked={autoSync} onCheckedChange={toggleAutoSync} />
          </div>

          <Separator />

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {t("settings:sync.lockTimeout")}
              </dt>
              <dd className="tabular-nums">{LOCK_TTL_SECONDS}s</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {t("settings:sync.schemaVersion")}
              </dt>
              <dd className="tabular-nums">{APP_SCHEMA_VERSION}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {t("settings:sync.workbook")}
              </dt>
              <dd className="truncate">
                {workbook?.name ?? t("settings:notConnected")}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">
                {t("settings:sync.workbookId")}
              </dt>
              <dd className="truncate font-mono text-xs">
                {workbook?.id ?? t("common:dash")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings:backup.title")}</CardTitle>
          <CardDescription>
            {t("settings:backup.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void handleExport()}>
            <Download className="size-4" />
            {t("settings:backup.export")}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>{t("settings:reset.title")}</CardTitle>
          <CardDescription>{t("settings:reset.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetLocalData />
        </CardContent>
      </Card>
    </div>
  );
}
