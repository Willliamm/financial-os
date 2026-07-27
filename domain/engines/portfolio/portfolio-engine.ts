/**
 * Portfolio positions, totals and allocation.
 *
 * Pure. Money is integer US cents, shares are integer micros, weights are
 * basis points. Prices arrive as a PriceMap parameter — this engine never
 * fetches anything, and a missing price is reported, never guessed.
 */

import type { FinancialContext } from "@/domain/context";
import type { AssetClass, InvestmentAccount, Lot } from "@/domain/entities";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import {
  sharesValueCents,
  type ShareMicros,
} from "@/domain/value-objects/shares";
import { normalizeTicker } from "@/domain/value-objects/ticker";
import type { MoneyCents } from "@/infrastructure/money/money";

/** ticker -> price per share in integer cents. A missing key means no price. */
export type PriceMap = Record<string, MoneyCents>;

export interface Position {
  holdingId: string;
  accountId: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** Sum of open-lot shares. */
  sharesMicro: ShareMicros;
  /** Sum of open-lot (costTotalCents + feesCents). */
  costBasisCents: MoneyCents;
  /** 0 when hasPrice is false. */
  marketValueCents: MoneyCents;
  unrealizedGainCents: MoneyCents;
  /** (market - basis) / basis in bps. 0 without a price or a basis. */
  simpleReturnBps: BasisPoints;
  /** Share of total portfolio market value, in bps. 0 without a price. */
  weightBps: BasisPoints;
  hasPrice: boolean;
  lotCount: number;
}

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function isOpen(lot: Lot): boolean {
  return notDeleted(lot) && lot.status === "open";
}

/** Cost basis of a lot: what was paid, including fees. */
export function lotCostBasisCents(lot: Lot): MoneyCents {
  return lot.costTotalCents + lot.feesCents;
}

export function buildPositions(
  context: FinancialContext,
  prices: PriceMap,
): Position[] {
  const openLots = context.lots.filter(isOpen);

  // Weight needs the portfolio total, which needs every position, so this is
  // deliberately two passes rather than one clever one.
  const draft = context.holdings.filter(notDeleted).map((holding) => {
    const lots = openLots.filter((l) => l.holdingId === holding.id);
    const sharesMicro = lots.reduce((s, l) => s + l.sharesMicro, 0);
    const costBasisCents = lots.reduce((s, l) => s + lotCostBasisCents(l), 0);

    const price = prices[normalizeTicker(holding.ticker)];
    const hasPrice = typeof price === "number" && price > 0;
    const marketValueCents = hasPrice
      ? sharesValueCents(sharesMicro, price)
      : 0;
    const unrealizedGainCents = hasPrice
      ? marketValueCents - costBasisCents
      : 0;
    const simpleReturnBps =
      hasPrice && costBasisCents > 0
        ? Math.round((unrealizedGainCents / costBasisCents) * 10_000)
        : 0;

    return {
      holdingId: holding.id,
      accountId: holding.accountId,
      ticker: holding.ticker,
      name: holding.name,
      assetClass: holding.assetClass,
      sharesMicro,
      costBasisCents,
      marketValueCents,
      unrealizedGainCents,
      simpleReturnBps,
      weightBps: 0,
      hasPrice,
      lotCount: lots.length,
    };
  });

  const total = draft.reduce((s, p) => s + p.marketValueCents, 0);
  if (total <= 0) return draft;
  return draft.map((p) => ({
    ...p,
    weightBps: Math.round((p.marketValueCents / total) * 10_000),
  }));
}

export function portfolioValueCents(positions: Position[]): MoneyCents {
  return positions.reduce((s, p) => s + p.marketValueCents, 0);
}

export function portfolioCostBasisCents(positions: Position[]): MoneyCents {
  return positions.reduce((s, p) => s + p.costBasisCents, 0);
}

export function portfolioUnrealizedGainCents(
  positions: Position[],
): MoneyCents {
  return positions.reduce((s, p) => s + p.unrealizedGainCents, 0);
}

export interface AllocationSlice {
  assetClass: AssetClass;
  valueCents: MoneyCents;
  weightBps: BasisPoints;
}

/**
 * Weights by asset class. The largest slice absorbs any rounding remainder so
 * the weights always sum to exactly 10000 bps — a legend that reads 99.98% is
 * a bug report waiting to happen.
 */
export function allocationByAssetClass(
  positions: Position[],
): AllocationSlice[] {
  const total = portfolioValueCents(positions);
  const byClass = new Map<AssetClass, MoneyCents>();
  for (const p of positions) {
    byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + p.marketValueCents);
  }

  const slices: AllocationSlice[] = [...byClass.entries()]
    .map(([assetClass, valueCents]) => ({
      assetClass,
      valueCents,
      weightBps: total > 0 ? Math.round((valueCents / total) * 10_000) : 0,
    }))
    .sort((a, b) => b.valueCents - a.valueCents);

  if (total > 0 && slices.length > 0) {
    const sum = slices.reduce((s, x) => s + x.weightBps, 0);
    slices[0].weightBps += 10_000 - sum;
  }
  return slices;
}

export interface AllocationDrift {
  holdingId: string;
  ticker: string;
  targetBps: BasisPoints;
  actualBps: BasisPoints;
  /** actual - target. Negative means underweight. */
  driftBps: BasisPoints;
}

/** Only holdings with a target set are returned, largest absolute drift first. */
export function allocationDrift(
  context: FinancialContext,
  positions: Position[],
): AllocationDrift[] {
  const total = portfolioValueCents(positions);
  const targets = new Map(
    context.holdings
      .filter(notDeleted)
      .filter((h) => h.targetAllocationBps > 0)
      .map((h) => [h.id, h.targetAllocationBps]),
  );

  return positions
    .filter((p) => targets.has(p.holdingId))
    .map((p) => {
      const targetBps = targets.get(p.holdingId) as BasisPoints;
      const actualBps =
        total > 0 ? Math.round((p.marketValueCents / total) * 10_000) : 0;
      return {
        holdingId: p.holdingId,
        ticker: p.ticker,
        targetBps,
        actualBps,
        driftBps: actualBps - targetBps,
      };
    })
    .sort((a, b) => Math.abs(b.driftBps) - Math.abs(a.driftBps));
}

/**
 * Value of an investment account. An account with holdings is worth the sum of
 * its positions; a position without a price contributes its cost basis rather
 * than zero, so the account is never silently understated. An account with no
 * holdings keeps its own manually tracked balance.
 */
export function accountValueCents(
  account: InvestmentAccount,
  positions: Position[],
): MoneyCents {
  const mine = positions.filter((p) => p.accountId === account.id);
  if (mine.length === 0) return account.currentBalanceCents;
  return mine.reduce(
    (s, p) => s + (p.hasPrice ? p.marketValueCents : p.costBasisCents),
    0,
  );
}
