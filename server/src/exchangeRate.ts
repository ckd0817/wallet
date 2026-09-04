import { HttpError } from './protocol.js';

export interface ExchangeRateResult {
  base: 'USD';
  quote: 'CNY';
  rate: number;
  date: string;
  source: 'frankfurter';
  fetchedAt: string;
}

interface ExchangeRateProviderOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

export const createUsdCnyRateProvider = ({
  fetcher = fetch,
  now = Date.now,
  cacheTtlMs = 6 * 60 * 60 * 1000,
}: ExchangeRateProviderOptions = {}) => {
  let cached: { value: ExchangeRateResult; cachedAt: number } | null = null;

  return async (): Promise<ExchangeRateResult> => {
    const currentTime = now();
    if (cached && currentTime - cached.cachedAt < cacheTtlMs) {
      return cached.value;
    }

    try {
      const response = await fetcher('https://api.frankfurter.dev/v2/rate/USD/CNY', {
        headers: { Accept: 'application/json', 'User-Agent': 'SmartWallet/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json() as Record<string, unknown>;
      const rate = Number(payload.rate);
      const date = typeof payload.date === 'string' ? payload.date : '';
      if (payload.base !== 'USD' || payload.quote !== 'CNY' || !Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Invalid exchange rate response');
      }
      const value: ExchangeRateResult = {
        base: 'USD',
        quote: 'CNY',
        rate,
        date,
        source: 'frankfurter',
        fetchedAt: new Date(currentTime).toISOString(),
      };
      cached = { value, cachedAt: currentTime };
      return value;
    } catch {
      if (cached) {
        return cached.value;
      }
      throw new HttpError(503, '汇率暂不可用');
    }
  };
};
