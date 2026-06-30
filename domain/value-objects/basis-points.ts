/**
 * Basis points (bps) utilities.
 *
 * Percentages are stored as integer basis points. 100 bps = 1%.
 * So 300 bps = 3%, 10000 bps = 100%.
 */

export type BasisPoints = number;

/** Convert basis points to a decimal rate. 300 bps -> 0.03 */
export function bpsToRate(bps: BasisPoints): number {
  return bps / 10000;
}

/** Convert a decimal rate to basis points. 0.03 -> 300 */
export function rateToBps(rate: number): BasisPoints {
  return Math.round(rate * 10000);
}

/** Convert basis points to a percentage number. 300 bps -> 3 */
export function bpsToPercent(bps: BasisPoints): number {
  return bps / 100;
}

/** Convert a percentage number to basis points. 3 -> 300 */
export function percentToBps(percent: number): BasisPoints {
  return Math.round(percent * 100);
}

/** Format basis points as a human percentage string. 350 -> "3.50%" */
export function formatBps(bps: BasisPoints, decimals = 2): string {
  return `${(bps / 100).toFixed(decimals)}%`;
}

/** Parse a user-entered percent string ("3.5%") into basis points. */
export function parsePercentToBps(input: string): BasisPoints {
  if (typeof input !== "string") return 0;
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return percentToBps(value);
}
