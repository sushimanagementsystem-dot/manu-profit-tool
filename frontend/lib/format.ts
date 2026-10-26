/** Display formatting. The API sends decimals as strings; parse only at the point of display. */

export function formatMoney(
  value: string | null | undefined,
  currency = "EUR",
): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatNumber(value: string | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function formatPercent(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(1)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "in 2 days", "in 5 hours", "expired" — for the retention countdown. */
export function formatTimeLeft(isoDate: string): string {
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (hours >= 1) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `in ${Math.max(1, Math.round(ms / 60_000))} minutes`;
}
