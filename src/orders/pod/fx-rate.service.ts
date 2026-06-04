import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface CachedRate {
  rate: number;
  date: string; // FX publication date from the provider (YYYY-MM-DD)
  fetchedAt: number; // epoch ms when we cached it
}

/**
 * Live FX conversion backed by Frankfurter (https://frankfurter.dev) — ECB
 * reference rates, free, no API key, no rate limit. Rates are cached in memory
 * for a configurable TTL so we don't hit the network on every quote.
 *
 * Note: these are mid-market reference rates and will differ slightly (~1-2%)
 * from the exact FX a provider like Pictorem applies when it issues an invoice.
 * The converted figure is therefore an approximation, surfaced with "≈" in the UI.
 */
@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);
  private readonly baseUrl: string;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, CachedRate>();

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('FX_API_URL') ??
      'https://api.frankfurter.dev/v1';
    // Refresh at most once per 12h by default; ECB publishes once per business day.
    this.ttlMs =
      this.configService.get<number>('FX_CACHE_TTL_MS') ?? 12 * 60 * 60 * 1000;
  }

  /**
   * Convert an amount between currencies using live (cached) rates.
   * Returns null when from === to (no conversion needed) or the rate is
   * unavailable (network failure with no cached value) — callers should then
   * fall back to showing only the source-currency amount.
   */
  async convert(
    amount: number,
    from: string,
    to: string,
  ): Promise<{ amount: number; rate: number; rateDate: string } | null> {
    const src = from.toUpperCase();
    const dst = to.toUpperCase();
    if (src === dst) return null;

    const rate = await this.getRate(src, dst);
    if (rate == null) return null;

    return {
      amount: amount * rate.rate,
      rate: rate.rate,
      rateDate: rate.date,
    };
  }

  private async getRate(from: string, to: string): Promise<CachedRate | null> {
    const key = `${from}:${to}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached;
    }

    try {
      const url = `${this.baseUrl}/latest?base=${from}&symbols=${to}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FX API ${res.status}`);
      const json = (await res.json()) as FrankfurterResponse;
      const rate = json.rates?.[to];
      if (typeof rate !== 'number') {
        throw new Error(`FX rate ${from}->${to} missing in response`);
      }
      const fresh: CachedRate = {
        rate,
        date: json.date,
        fetchedAt: Date.now(),
      };
      this.cache.set(key, fresh);
      return fresh;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Serve a stale cached rate if we have one; otherwise give up gracefully.
      if (cached) {
        this.logger.warn(
          `FX fetch ${from}->${to} failed (${message}); using stale rate from ${cached.date}`,
        );
        return cached;
      }
      this.logger.warn(
        `FX fetch ${from}->${to} failed (${message}); conversion unavailable`,
      );
      return null;
    }
  }
}
