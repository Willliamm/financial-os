"use client";

import type { FinancialContext } from "@/domain/context";
import type { PriceMap } from "@/domain/engines";
import { useFinancialContext } from "@/lib/queries/financial-data";

export interface LatestPrices {
  prices: PriceMap;
  /** ticker -> quoteDate of the price being used, for an "as of" label. */
  asOf: Record<string, string>;
}

/** Newest quote per ticker. Pure, so it is unit-testable without React. */
export function selectLatestPrices(context: FinancialContext): LatestPrices {
  const prices: PriceMap = {};
  const asOf: Record<string, string> = {};

  for (const q of context.priceQuotes) {
    if (q.deletedAt) continue;
    const seen = asOf[q.ticker];
    if (!seen || q.quoteDate > seen) {
      asOf[q.ticker] = q.quoteDate;
      prices[q.ticker] = q.priceCents;
    }
  }
  return { prices, asOf };
}

/** Thin hook over the loaded financial context. */
export function useLatestPrices(): LatestPrices {
  const { data: context } = useFinancialContext();
  return selectLatestPrices(context);
}
