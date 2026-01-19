// XPR has 4 decimal places
const XPR_DECIMALS = 4;
const XPR_MULTIPLIER = Math.pow(10, XPR_DECIMALS);

// Oracle prices have 8 decimal places
const ORACLE_DECIMALS = 8;
const ORACLE_MULTIPLIER = Math.pow(10, ORACLE_DECIMALS);

/**
 * Format XPR amount from smallest unit (e.g., 10000 -> "1.0000")
 */
export function formatXPR(amount: string | number): string {
  const num = typeof amount === 'string' ? parseInt(amount, 10) : amount;
  return (num / XPR_MULTIPLIER).toFixed(XPR_DECIMALS);
}

/**
 * Parse XPR amount to smallest unit (e.g., "1.0000" -> 10000)
 */
export function parseXPR(amount: string): number {
  return Math.floor(parseFloat(amount) * XPR_MULTIPLIER);
}

/**
 * Format XPR amount with symbol (e.g., "1.0000 XPR")
 */
export function formatXPRWithSymbol(amount: string | number): string {
  return `${formatXPR(amount)} XPR`;
}

/**
 * Convert oracle price to u64 string (8 decimals)
 * e.g., 95300.50 -> "9530050000000"
 */
export function priceToU64(price: number): string {
  return Math.round(price * ORACLE_MULTIPLIER).toString();
}

/**
 * Convert u64 to price
 * e.g., "9530050000000" -> 95300.50
 */
export function u64ToPrice(u64: string): number {
  return parseInt(u64, 10) / ORACLE_MULTIPLIER;
}

/**
 * Format USD price for display
 */
export function formatUSD(price: number): string {
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Calculate percentage change
 */
export function percentChange(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}
