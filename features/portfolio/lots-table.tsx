"use client";

import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { LotView } from "@/domain/engines";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatShares } from "@/domain/value-objects/shares";
import { formatCents } from "@/infrastructure/money/money";
import { formatDate } from "@/infrastructure/dates/date-utils";
import { cn } from "@/lib/utils";

export interface LotsTableProps {
  views: LotView[];
}

export function LotsTable({ views }: LotsTableProps) {
  const { t } = useTranslation();

  const byTicker = new Map<string, LotView[]>();
  for (const v of [...views].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))) {
    const list = byTicker.get(v.ticker);
    if (list) list.push(v);
    else byTicker.set(v.ticker, [v]);
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("forms:columns.tradeDate")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.shares")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.costBasis")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.marketValue")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.gain")}</TableHead>
            <TableHead>{t("portfolio:lots.longTerm")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...byTicker.entries()].map(([ticker, lots]) => (
            <Fragment key={ticker}>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={6} className="font-medium">{ticker}</TableCell>
              </TableRow>
              {lots.map((v) => (
                <TableRow key={v.lotId}>
                  <TableCell>{formatDate(v.tradeDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatShares(v.sharesMicro)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{formatCents(v.costBasisCents)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCents(v.costPerShareCents)} {t("portfolio:lots.perShare")}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {v.hasPrice ? formatCents(v.marketValueCents) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      v.hasPrice && v.unrealizedGainCents > 0 && "text-emerald-600",
                      v.hasPrice && v.unrealizedGainCents < 0 && "text-red-600",
                    )}
                  >
                    {v.hasPrice ? formatCents(v.unrealizedGainCents) : "—"}
                  </TableCell>
                  <TableCell>
                    {v.isLongTerm ? (
                      <Badge variant="secondary">{t("portfolio:lots.longTerm")}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("portfolio:lots.daysToLongTerm", { count: v.daysToLongTerm })}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
