/**
 * Per-lot views: cost basis, market value and holding period.
 *
 * Pure. The caller supplies `asOf`; this engine never reads a clock.
 *
 * Holding period follows the US rule: the clock starts the day AFTER the trade
 * date, and the gain is long-term only when the position has been held for
 * MORE than one year. So a lot bought on 14 Mar 2025 first qualifies on
 * 15 Mar 2026 — not on the 14th. A 365-day counter gets this wrong across leap
 * years, which is why this uses calendar arithmetic.
 */

import type { FinancialContext } from "@/domain/context";
import type { Lot } from "@/domain/entities";
import { costPerShareCents, sharesValueCents, type ShareMicros } from "@/domain/value-objects/shares";
import { addDaysIso, addYearsIso, diffCalendarDays } from "@/infrastructure/dates/date-utils";
import type { MoneyCents } from "@/infrastructure/money/money";
import { lotCostBasisCents, type PriceMap } from "./portfolio-engine";

export interface LotView {
  lotId: string;
  holdingId: string;
  ticker: string;
  tradeDate: string;
  sharesMicro: ShareMicros;
  costBasisCents: MoneyCents;
  costPerShareCents: MoneyCents;
  marketValueCents: MoneyCents;
  unrealizedGainCents: MoneyCents;
  hasPrice: boolean;
  daysHeld: number;
  /** First date on which a sale would be long-term. */
  longTermOn: string;
  isLongTerm: boolean;
  /** 0 when already long-term. */
  daysToLongTerm: number;
}

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function isOpen(lot: Lot): boolean {
  return notDeleted(lot) && lot.status === "open";
}

export function buildLotViews(
  context: FinancialContext,
  prices: PriceMap,
  asOf: string,
): LotView[] {
  const tickerByHolding = new Map(
    context.holdings.filter(notDeleted).map((h) => [h.id, h.ticker]),
  );

  return context.lots
    .filter(isOpen)
    .filter((l) => tickerByHolding.has(l.holdingId))
    .map((lot) => {
      const ticker = tickerByHolding.get(lot.holdingId) as string;
      const price = prices[ticker];
      const hasPrice = typeof price === "number" && price > 0;
      const costBasisCents = lotCostBasisCents(lot);
      const marketValueCents = hasPrice
        ? sharesValueCents(lot.sharesMicro, price)
        : 0;

      const longTermOn = addDaysIso(addYearsIso(lot.tradeDate, 1), 1);
      const isLongTerm = asOf >= longTermOn;

      return {
        lotId: lot.id,
        holdingId: lot.holdingId,
        ticker,
        tradeDate: lot.tradeDate,
        sharesMicro: lot.sharesMicro,
        costBasisCents,
        costPerShareCents: costPerShareCents(costBasisCents, lot.sharesMicro),
        marketValueCents,
        unrealizedGainCents: hasPrice ? marketValueCents - costBasisCents : 0,
        hasPrice,
        daysHeld: Math.max(0, diffCalendarDays(lot.tradeDate, asOf)),
        longTermOn,
        isLongTerm,
        daysToLongTerm: isLongTerm
          ? 0
          : Math.max(0, diffCalendarDays(asOf, longTermOn)),
      };
    });
}

/** Priced lots currently below cost, biggest paper loss first. */
export function lotsAtALoss(views: LotView[]): LotView[] {
  return views
    .filter((v) => v.hasPrice && v.unrealizedGainCents < 0)
    .sort((a, b) => a.unrealizedGainCents - b.unrealizedGainCents);
}

/** Lots crossing into long-term within `withinDays`, soonest first. */
export function lotsNearingLongTerm(
  views: LotView[],
  withinDays: number,
): LotView[] {
  return views
    .filter((v) => !v.isLongTerm && v.daysToLongTerm <= withinDays)
    .sort((a, b) => a.daysToLongTerm - b.daysToLongTerm);
}
