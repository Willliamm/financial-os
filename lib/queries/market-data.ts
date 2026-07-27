"use client";

import type { FinancialContext } from "@/domain/context";
import type { PriceMap } from "@/domain/engines";
import { normalizeTicker } from "@/domain/value-objects/ticker";
import { useFinancialContext } from "@/lib/queries/financial-data";

export interface LatestPrices {
  prices: PriceMap;
  /** ticker -> quoteDate of the price being used, for an "as of" label. */
  asOf: Record<string, string>;
}

/**
 * Newest quote per ticker. Pure, so it is unit-testable without React.
 *
 * `EntityRepository.list()` returns entities sorted ascending by
 * `createdAt`, so on a same-day tie (two quotes with the same `quoteDate`)
 * the record encountered LATER in this loop is the one created more
 * recently. The comparison below is `>=` rather than `>` so that
 * later-created record wins the tie — otherwise a corrected same-day price
 * would lose to the original, wrong one forever.
 */
export function selectLatestPrices(context: FinancialContext): LatestPrices {
  const prices: PriceMap = {};
  const asOf: Record<string, string> = {};

  for (const q of context.priceQuotes) {
    if (q.deletedAt) continue;
    const ticker = normalizeTicker(q.ticker);
    const seen = asOf[ticker];
    if (!seen || q.quoteDate >= seen) {
      asOf[ticker] = q.quoteDate;
      prices[ticker] = q.priceCents;
    }
  }
  return { prices, asOf };
}

/** Thin hook over the loaded financial context. */
export function useLatestPrices(): LatestPrices {
  const { data: context } = useFinancialContext();
  return selectLatestPrices(context);
}
