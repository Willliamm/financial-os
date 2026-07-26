/**
 * Share quantity utilities.
 *
 * Share counts are stored as integer millionths of a share. 1 share =
 * 1_000_000 micros. Fractional shares are real — brokerages sell them — and
 * floating point is not an option for persisted values, so this mirrors the
 * discipline already used for cents and basis points.
 */

import type { MoneyCents } from "@/infrastructure/money/money";

export type ShareMicros = number;

export const SHARE_SCALE = 1_000_000;

/** Convert a share count to integer micros. 12.5 -> 12_500_000 */
export function sharesToMicros(shares: number): ShareMicros {
  if (!Number.isFinite(shares)) return 0;
  return Math.round(shares * SHARE_SCALE);
}

/** Convert integer micros back to a share count. 12_500_000 -> 12.5 */
export function microsToShares(micros: ShareMicros): number {
  return micros / SHARE_SCALE;
}

/**
 * Format a share count for display, trimming trailing zeros.
 * 12_000_000 -> "12", 12_500_000 -> "12.5"
 */
export function formatShares(
  micros: ShareMicros,
  options: { maxDecimals?: number } = {},
): string {
  const maxDecimals = options.maxDecimals ?? 6;
  const fixed = microsToShares(micros).toFixed(maxDecimals);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** shares x price-per-share, rounded to the nearest cent. */
export function sharesValueCents(
  micros: ShareMicros,
  pricePerShareCents: MoneyCents,
): MoneyCents {
  return Math.round((micros * pricePerShareCents) / SHARE_SCALE);
}

/** Derived per-share cost, for display only. 0 when there are no shares. */
export function costPerShareCents(
  totalCents: MoneyCents,
  micros: ShareMicros,
): MoneyCents {
  if (micros === 0) return 0;
  return Math.round((totalCents * SHARE_SCALE) / micros);
}

/** Parse a user-entered share count ("1,000.25") into integer micros. */
export function parseSharesToMicros(input: string): ShareMicros {
  if (typeof input !== "string") return 0;
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return sharesToMicros(value);
}
