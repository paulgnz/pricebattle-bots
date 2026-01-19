import { Logger } from '../utils';

export interface MarketData {
  // Current price
  price: number;

  // 24h stats
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap: number;

  // Price changes (percentages)
  change1h: number;
  change24h: number;
  change7d: number;
  change30d: number;

  // Calculated metrics
  volatility24h: number;  // (high - low) / price * 100
  pricePosition: number;  // Where current price is in 24h range (0-100%)

  // Timestamp
  lastUpdated: number;
}

export interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MultiTimeframeData {
  current: MarketData;
  candles1h: OHLCCandle[];   // Last 24 1-hour candles
  candles4h: OHLCCandle[];   // Last 7 days of 4-hour candles
  candles1d: OHLCCandle[];   // Last 30 daily candles

  // Computed indicators
  sma20: number;            // 20-period simple moving average (1h candles)
  sma50: number;            // 50-period simple moving average (1h candles)
  ema12: number;            // 12-period exponential moving average
  ema26: number;            // 26-period exponential moving average
  rsi14: number;            // 14-period RSI

  // Trend analysis
  trend1h: 'bullish' | 'bearish' | 'neutral';
  trend24h: 'bullish' | 'bearish' | 'neutral';
  momentum: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down';
}

export class MarketDataService {
  private logger?: Logger;
  private cache: MultiTimeframeData | null = null;
  private cacheExpiry: number = 0;
  private lastApiCall: number = 0;
  // Rate limiting config - CoinGecko Demo plan allows 30 calls/min
  // With 10-min cache and 4 calls per refresh, we use ~0.4 calls/min (very safe)
  private readonly CACHE_TTL_MS = 600000; // 10 minute cache
  private readonly MIN_API_INTERVAL_MS = 300000; // Min 5 minutes between API calls
  private readonly COINGECKO_RATE_LIMIT_DELAY = 2000; // 2s between requests (safe margin)

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Helper to delay between API calls
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get comprehensive BTC market data with multi-timeframe analysis
   */
  async getBTCMarketData(): Promise<MultiTimeframeData> {
    // Check cache
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    try {
      // Rate limit check
      const timeSinceLastCall = Date.now() - this.lastApiCall;
      if (timeSinceLastCall < this.MIN_API_INTERVAL_MS && this.cache) {
        this.logger?.debug('Using cached data to avoid rate limiting');
        return this.cache;
      }

      // Fetch sequentially with delays to avoid rate limits
      // CoinGecko free tier: ~10-30 calls/minute
      const current = await this.fetchCurrentData();
      await this.delay(this.COINGECKO_RATE_LIMIT_DELAY);

      const candles1h = await this.fetchOHLC(1);    // 1-hour candles
      await this.delay(this.COINGECKO_RATE_LIMIT_DELAY);

      const candles4h = await this.fetchOHLC(4);    // 4-hour candles
      await this.delay(this.COINGECKO_RATE_LIMIT_DELAY);

      const candles1d = await this.fetchOHLC(24);   // Daily candles

      this.lastApiCall = Date.now();

      // Calculate technical indicators
      const closes1h = candles1h.map(c => c.close);
      const sma20 = this.calculateSMA(closes1h, 20);
      const sma50 = this.calculateSMA(closes1h, 50);
      const ema12 = this.calculateEMA(closes1h, 12);
      const ema26 = this.calculateEMA(closes1h, 26);
      const rsi14 = this.calculateRSI(closes1h, 14);

      // Determine trends
      const trend1h = this.determineTrend(candles1h.slice(-6)); // Last 6 hours
      const trend24h = this.determineTrend(candles1h);
      const momentum = this.determineMomentum(current.price, sma20, ema12, ema26, rsi14);

      const data: MultiTimeframeData = {
        current,
        candles1h,
        candles4h,
        candles1d,
        sma20,
        sma50,
        ema12,
        ema26,
        rsi14,
        trend1h,
        trend24h,
        momentum,
      };

      // Cache the result
      this.cache = data;
      this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

      this.logger?.debug('Fetched market data', {
        price: current.price,
        change1h: current.change1h,
        change24h: current.change24h,
        rsi14,
        trend1h,
        momentum,
      });

      return data;
    } catch (error) {
      this.logger?.error('Failed to fetch market data', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return cached data if available, even if expired
      if (this.cache) {
        this.logger?.warn('Using stale cached market data');
        return this.cache;
      }

      throw error;
    }
  }

  /**
   * Fetch with retry on rate limit
   */
  private async fetchWithRetry(url: string, retries: number = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      const response = await fetch(url);

      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        this.logger?.warn('CoinGecko rate limited, waiting', { retryAfter, attempt: i + 1 });
        await this.delay(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      return response.json();
    }

    throw new Error('CoinGecko API rate limit exceeded after retries');
  }

  /**
   * Fetch current market data from CoinGecko
   */
  private async fetchCurrentData(): Promise<MarketData> {
    const url = 'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false';

    const data = await this.fetchWithRetry(url);
    const market = data.market_data;

    const price = market.current_price.usd;
    const high24h = market.high_24h.usd;
    const low24h = market.low_24h.usd;

    return {
      price,
      high24h,
      low24h,
      volume24h: market.total_volume.usd,
      marketCap: market.market_cap.usd,
      change1h: market.price_change_percentage_1h_in_currency?.usd || 0,
      change24h: market.price_change_percentage_24h || 0,
      change7d: market.price_change_percentage_7d || 0,
      change30d: market.price_change_percentage_30d || 0,
      volatility24h: ((high24h - low24h) / price) * 100,
      pricePosition: ((price - low24h) / (high24h - low24h)) * 100,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Fetch OHLC candles from CoinGecko
   */
  private async fetchOHLC(hours: number): Promise<OHLCCandle[]> {
    // CoinGecko OHLC endpoint: days parameter determines granularity
    // 1-2 days = 30min candles, 3-30 days = 4hr candles, 31+ days = daily
    let days: number;
    if (hours <= 1) {
      days = 1; // Will get 30-min candles, we'll aggregate to 1hr
    } else if (hours <= 4) {
      days = 7; // Will get 4-hr candles
    } else {
      days = 90; // Will get daily candles
    }

    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`;

    const data = await this.fetchWithRetry(url);

    // Convert to our format
    const candles: OHLCCandle[] = data.map((item: number[]) => ({
      timestamp: item[0],
      open: item[1],
      high: item[2],
      low: item[3],
      close: item[4],
    }));

    // For 1-hour candles, aggregate 30-min candles
    if (hours === 1 && candles.length > 0) {
      return this.aggregateCandles(candles, 2); // Combine every 2 candles
    }

    return candles.slice(-48); // Return last 48 candles max
  }

  /**
   * Aggregate candles into larger timeframes
   */
  private aggregateCandles(candles: OHLCCandle[], factor: number): OHLCCandle[] {
    const result: OHLCCandle[] = [];

    for (let i = 0; i < candles.length; i += factor) {
      const group = candles.slice(i, i + factor);
      if (group.length === 0) continue;

      result.push({
        timestamp: group[0].timestamp,
        open: group[0].open,
        high: Math.max(...group.map(c => c.high)),
        low: Math.min(...group.map(c => c.low)),
        close: group[group.length - 1].close,
      });
    }

    return result;
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const slice = prices.slice(-period);
    return slice.reduce((sum, p) => sum + p, 0) / period;
  }

  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length === 0) return 0;
    if (prices.length < period) return this.calculateSMA(prices, prices.length);

    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate Relative Strength Index
   */
  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Neutral if not enough data

    const changes: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const recentChanges = changes.slice(-period);

    let gains = 0;
    let losses = 0;

    for (const change of recentChanges) {
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Determine trend from candles
   */
  private determineTrend(candles: OHLCCandle[]): 'bullish' | 'bearish' | 'neutral' {
    if (candles.length < 2) return 'neutral';

    const first = candles[0];
    const last = candles[candles.length - 1];
    const change = ((last.close - first.open) / first.open) * 100;

    // Count bullish vs bearish candles
    let bullish = 0;
    let bearish = 0;
    for (const c of candles) {
      if (c.close > c.open) bullish++;
      else if (c.close < c.open) bearish++;
    }

    if (change > 0.5 && bullish > bearish) return 'bullish';
    if (change < -0.5 && bearish > bullish) return 'bearish';
    return 'neutral';
  }

  /**
   * Determine momentum strength
   */
  private determineMomentum(
    price: number,
    sma20: number,
    ema12: number,
    ema26: number,
    rsi: number
  ): 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down' {
    let score = 0;

    // Price vs SMA20
    if (price > sma20 * 1.02) score += 2;
    else if (price > sma20) score += 1;
    else if (price < sma20 * 0.98) score -= 2;
    else if (price < sma20) score -= 1;

    // EMA crossover (MACD-like)
    if (ema12 > ema26 * 1.01) score += 2;
    else if (ema12 > ema26) score += 1;
    else if (ema12 < ema26 * 0.99) score -= 2;
    else if (ema12 < ema26) score -= 1;

    // RSI
    if (rsi > 70) score += 1; // Overbought, but still momentum
    else if (rsi > 60) score += 2;
    else if (rsi > 50) score += 1;
    else if (rsi < 30) score -= 1; // Oversold, but still momentum
    else if (rsi < 40) score -= 2;
    else if (rsi < 50) score -= 1;

    if (score >= 4) return 'strong_up';
    if (score >= 2) return 'up';
    if (score <= -4) return 'strong_down';
    if (score <= -2) return 'down';
    return 'neutral';
  }
}
