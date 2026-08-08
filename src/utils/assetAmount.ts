import { formatAtomicAmount } from './walletSend';

// Core's AmountTypeAdapter always formats amounts at a fixed 8 decimal places
// regardless of an asset's divisibility (BigDecimal.valueOf(amount, 8)) - so a
// non-divisible asset's balance still arrives as e.g. "5.00000000". Trim it
// down to a whole number for display; divisible assets keep full precision.
function trimIndivisible(decimal: string, isDivisible: boolean): string {
  if (isDivisible) return decimal;
  const n = Number(decimal);
  return Number.isFinite(n) ? String(Math.trunc(n)) : decimal;
}

// AssetData.quantity (GET /assets/info, /assets) is a raw atomic long with no
// pretty-printing from Core - convert it (always /1e8, matching how
// IssueAssetTransactionData.quantity is scaled) then trim for display.
export function formatAssetQuantity(
  quantity: string,
  isDivisible: boolean
): string {
  return trimIndivisible(formatAtomicAmount(quantity, 8), isDivisible);
}

// AccountBalanceData.balance (GET /assets/balances) and
// TransferAssetTransactionData.amount (GET /assets/transfers/{id}) are
// already pretty-printed by Core - just trim for non-divisible display.
export function formatAssetBalance(
  balance: string,
  isDivisible: boolean
): string {
  return trimIndivisible(balance, isDivisible);
}
