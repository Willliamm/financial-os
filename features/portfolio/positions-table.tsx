"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Position } from "@/domain/engines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatShares } from "@/domain/value-objects/shares";
import { formatBps } from "@/domain/value-objects/basis-points";
import { normalizeTicker } from "@/domain/value-objects/ticker";
import { formatCents } from "@/infrastructure/money/money";
import { formatDate } from "@/infrastructure/dates/date-utils";
import { cn } from "@/lib/utils";

export interface PositionsTableProps {
  positions: Position[];
  /** ticker -> latest price, so a correction dialog can prefill with the real value. */
  prices: Record<string, number>;
  /** ticker -> quote date, for the "as of" hint under the price. */
  asOf: Record<string, string>;
  accountNameById: Record<string, string>;
  onSetPrice: (ticker: string, currentPriceCents: number) => void;
  onAddLot: (holdingId: string) => void;
}

export function PositionsTable({
  positions, prices, asOf, accountNameById, onSetPrice, onAddLot,
}: PositionsTableProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("forms:columns.ticker")}</TableHead>
            <TableHead>{t("forms:columns.account")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.shares")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.costBasis")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.price")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.marketValue")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.gain")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.weight")}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((p) => {
            const pricePerShare =
              p.hasPrice && p.sharesMicro > 0
                ? Math.round((p.marketValueCents * 1_000_000) / p.sharesMicro)
                : 0;
            // The current stored price, not the derived per-share value above
            // (which is 0 whenever there are no shares yet) — this is what a
            // correction dialog should prefill with.
            const currentPriceCents = prices[normalizeTicker(p.ticker)] ?? 0;
            return (
              <TableRow key={p.holdingId}>
                <TableCell>
                  <div className="font-medium">{p.ticker || p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.name}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {accountNameById[p.accountId] ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatShares(p.sharesMicro)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(p.costBasisCents)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.hasPrice ? (
                    <div className="flex items-center justify-end gap-1">
                      <div>
                        <div>{formatCents(pricePerShare)}</div>
                        {asOf[normalizeTicker(p.ticker)] ? (
                          <div className="text-xs text-muted-foreground">
                            {t("portfolio:asOf", { date: formatDate(asOf[normalizeTicker(p.ticker)]) })}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={t("portfolio:positions.setPrice")}
                        title={t("portfolio:positions.setPrice")}
                        onClick={() => onSetPrice(p.ticker, currentPriceCents)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant="secondary">{t("portfolio:positions.noPrice")}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSetPrice(p.ticker, currentPriceCents)}
                      >
                        {t("portfolio:positions.setPrice")}
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.hasPrice ? formatCents(p.marketValueCents) : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    p.hasPrice && p.unrealizedGainCents > 0 && "text-emerald-600",
                    p.hasPrice && p.unrealizedGainCents < 0 && "text-red-600",
                  )}
                >
                  {p.hasPrice
                    ? `${formatCents(p.unrealizedGainCents)} (${formatBps(p.simpleReturnBps)})`
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.hasPrice ? formatBps(p.weightBps) : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    aria-label={t("portfolio:addLot")}
                    title={t("portfolio:addLot")}
                    onClick={() => onAddLot(p.holdingId)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
