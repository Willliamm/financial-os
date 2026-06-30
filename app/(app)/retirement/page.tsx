"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PiggyBank } from "lucide-react";
import type { AccountType, InvestmentAccount } from "@/domain/entities";
import { useFinancialContext } from "@/lib/queries/financial-data";
import {
  projectRetirement,
  projectedRetirementBalanceCents,
} from "@/domain/engines";
import { formatCents } from "@/infrastructure/money/money";
import { formatBps } from "@/domain/value-objects/basis-points";
import { currentYear } from "@/infrastructure/dates/date-utils";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EChart } from "@/components/charts/echart";
import { lineMoneyOption, toDollars } from "@/components/charts/chart-helpers";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const RETIREMENT_TYPES = new Set<AccountType>([
  "401k",
  "solo_401k",
  "ira",
  "roth_ira",
  "hsa",
  "cash_balance_plan",
]);

const TYPE_LABELS: Record<string, string> = {
  "401k": "401(k)",
  solo_401k: "Solo 401(k)",
  ira: "IRA",
  roth_ira: "Roth IRA",
  hsa: "HSA",
  cash_balance_plan: "Cash Balance Plan",
};

const RETIREMENT_AGE = 65;

export default function RetirementPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();

  const primary = context.people.find((p) => !p.deletedAt) ?? null;
  const currentAge =
    primary && primary.birthYear
      ? Math.max(0, currentYear() - primary.birthYear)
      : 40;

  const accounts = useMemo(
    () =>
      context.investmentAccounts.filter(
        (a) => !a.deletedAt && RETIREMENT_TYPES.has(a.accountType),
      ),
    [context.investmentAccounts],
  );

  const inputFor = (a: InvestmentAccount) => ({
    currentBalanceCents: a.currentBalanceCents,
    monthlyContributionCents: a.contributionMonthlyCents,
    expectedReturnBps: a.expectedReturnBps,
    currentAge,
    retirementAge: RETIREMENT_AGE,
  });

  const totalBalanceCents = accounts.reduce(
    (sum, a) => sum + a.currentBalanceCents,
    0,
  );
  const monthlyContributionCents = accounts.reduce(
    (sum, a) => sum + a.contributionMonthlyCents,
    0,
  );
  const projectedTotalCents = accounts.reduce(
    (sum, a) => sum + projectedRetirementBalanceCents(inputFor(a)),
    0,
  );

  const chartOption = useMemo(() => {
    const totalYears = Math.max(0, RETIREMENT_AGE - currentAge);
    const categories: number[] = [];
    for (let i = 0; i <= totalYears; i++) {
      categories.push(currentYear() + i);
    }
    const totals = new Array<number>(totalYears + 1).fill(0);
    for (const a of accounts) {
      for (const row of projectRetirement(inputFor(a))) {
        if (row.year < totals.length) {
          totals[row.year] += row.balanceCents;
        }
      }
    }
    return lineMoneyOption(categories, [
      {
        name: t("retirement:chart.series"),
        data: totals.map(toDollars),
        area: true,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, currentAge, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("retirement:header.title")}
        description={t("retirement:header.description", { age: RETIREMENT_AGE })}
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={<PiggyBank className="size-8" />}
          title={t("retirement:empty.title")}
          description={t("retirement:empty.description")}
          action={
            <Link href="/investments" className={buttonVariants()}>
              {t("retirement:empty.addAccount")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label={t("retirement:kpi.retirementBalance")}
              value={formatCents(totalBalanceCents, { compact: true })}
              sub={t("retirement:kpi.accounts", { count: accounts.length })}
            />
            <KpiCard
              label={t("retirement:kpi.projectedAtAge", { age: RETIREMENT_AGE })}
              value={formatCents(projectedTotalCents, { compact: true })}
              tone="positive"
              sub={t("retirement:kpi.fromAgeToday", { age: currentAge })}
            />
            <KpiCard
              label={t("retirement:kpi.monthlyContributions")}
              value={formatCents(monthlyContributionCents)}
              sub={t("retirement:kpi.perYear", { amount: formatCents(monthlyContributionCents * 12) })}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("retirement:chart.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <EChart option={chartOption} height={320} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("retirement:cards.accounts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("retirement:table.account")}</TableHead>
                    <TableHead>{t("retirement:table.type")}</TableHead>
                    <TableHead className="text-right">{t("retirement:table.balance")}</TableHead>
                    <TableHead className="text-right">{t("retirement:table.monthly")}</TableHead>
                    <TableHead className="text-right">{t("retirement:table.return")}</TableHead>
                    <TableHead className="text-right">
                      {t("retirement:table.projectedAt", { age: RETIREMENT_AGE })}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        {TYPE_LABELS[a.accountType] ?? a.accountType}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(a.currentBalanceCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(a.contributionMonthlyCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBps(a.expectedReturnBps)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(
                          projectedRetirementBalanceCents(inputFor(a)),
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
