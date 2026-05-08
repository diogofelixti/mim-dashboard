const BTC_SATS = 100_000_000;

export function formatBTC(value: number, decimals = 8): string {
  return value.toFixed(decimals) + ' BTC';
}

export function formatSats(sats: number): string {
  if (sats >= BTC_SATS) return formatBTC(sats / BTC_SATS);
  return sats.toLocaleString('en-US') + ' sats';
}

export type BtcUnit = 'BTC' | 'sats';

export function formatBtcValue(btcAmount: number, unit: BtcUnit = 'BTC'): string {
  if (unit === 'sats') {
    const sats = Math.round(btcAmount * BTC_SATS);
    return sats.toLocaleString('en-US') + ' sats';
  }
  return btcAmount.toFixed(8) + ' BTC';
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_024)           return `${bytes} B`;
  if (bytes < 1_048_576)       return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824)   return `${(bytes / 1_048_576).toFixed(2)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export function formatHash(hash: string, chars = 8): string {
  if (!hash || hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;

  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3_600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || !parts.length) parts.push(`${m}m`);
  return parts.join(' ');
}

export function formatDifficulty(difficulty: number): string {
  if (difficulty >= 1e12) return `${(difficulty / 1e12).toFixed(2)} T`;
  if (difficulty >= 1e9)  return `${(difficulty / 1e9).toFixed(2)} G`;
  if (difficulty >= 1e6)  return `${(difficulty / 1e6).toFixed(2)} M`;
  if (difficulty >= 1)    return formatNumber(difficulty);
  if (difficulty > 0)     return difficulty.toPrecision(4);
  return '0';
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: '$',
  brl: 'R$',
  eur: '€',
};

export function formatPrice(
  value: number,
  currency: 'usd' | 'brl' | 'eur' = 'usd'
): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '';
  return `${symbol}${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
