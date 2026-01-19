import { PredictionContext, Challenge } from '../types';
import { formatUSD, formatDuration } from '../utils';

/**
 * Build prompt for price direction prediction
 */
export function buildPredictionPrompt(context: PredictionContext): string {
  const priceHistoryStr = context.priceHistory
    .slice(-30)
    .map((p) => {
      const date = new Date(p.timestamp).toISOString().substr(11, 8);
      return `  ${date}: ${formatUSD(p.price)}`;
    })
    .join('\n');

  // Build technical indicators section
  let indicatorsStr = '';
  if (context.indicators) {
    const ind = context.indicators;
    indicatorsStr = `
TECHNICAL INDICATORS:
- SMA(20): ${formatUSD(ind.sma20)} ${context.currentPrice > ind.sma20 ? '(price above)' : '(price below)'}
- SMA(50): ${formatUSD(ind.sma50)} ${context.currentPrice > ind.sma50 ? '(price above)' : '(price below)'}
- EMA(12): ${formatUSD(ind.ema12)}
- EMA(26): ${formatUSD(ind.ema26)}
- MACD Signal: ${ind.ema12 > ind.ema26 ? 'BULLISH (EMA12 > EMA26)' : 'BEARISH (EMA12 < EMA26)'}
- RSI(14): ${ind.rsi14.toFixed(1)} ${ind.rsi14 > 70 ? '(OVERBOUGHT)' : ind.rsi14 < 30 ? '(OVERSOLD)' : '(NEUTRAL)'}
- 1h Trend: ${ind.trend1h.toUpperCase()}
- 24h Trend: ${ind.trend24h.toUpperCase()}
- Momentum: ${ind.momentum.toUpperCase().replace('_', ' ')}
`;
  }

  // Build price changes section
  let changesStr = '';
  if (context.change1h !== undefined) changesStr += `- 1h Change: ${context.change1h >= 0 ? '+' : ''}${context.change1h.toFixed(2)}%\n`;
  if (context.change24h !== undefined) changesStr += `- 24h Change: ${context.change24h >= 0 ? '+' : ''}${context.change24h.toFixed(2)}%\n`;
  if (context.change7d !== undefined) changesStr += `- 7d Change: ${context.change7d >= 0 ? '+' : ''}${context.change7d.toFixed(2)}%\n`;
  if (context.change30d !== undefined) changesStr += `- 30d Change: ${context.change30d >= 0 ? '+' : ''}${context.change30d.toFixed(2)}%\n`;

  // Volatility info
  let volatilityStr = '';
  if (context.volatility24h !== undefined) {
    volatilityStr = `- 24h Volatility: ${context.volatility24h.toFixed(2)}% (range: ${formatUSD(context.low24h || 0)} - ${formatUSD(context.high24h || 0)})\n`;
    if (context.pricePosition !== undefined) {
      volatilityStr += `- Price Position in Range: ${context.pricePosition.toFixed(0)}% (0%=at low, 100%=at high)\n`;
    }
  }

  return `You are a BTC price movement analyst for a price prediction game on XPR Network.

CURRENT MARKET DATA:
- Current BTC Price: ${formatUSD(context.currentPrice)}
${context.high24h ? `- 24h High: ${formatUSD(context.high24h)}` : ''}
${context.low24h ? `- 24h Low: ${formatUSD(context.low24h)}` : ''}
${changesStr}${volatilityStr}${indicatorsStr}
RECENT PRICE HISTORY (last 30 data points, 1-min intervals):
${priceHistoryStr}

BOT PERFORMANCE (cumulative):
- Wins: ${context.performance.wins}
- Losses: ${context.performance.losses}
- Ties: ${context.performance.ties}
- Win Rate: ${context.performance.winRate.toFixed(1)}%

AVAILABLE DURATIONS:
- 30 minutes (1800s) - PREFERRED: Good balance of time for price movement
- 1 hour (3600s) - PREFERRED: Standard, for established trends
- 4 hours (14400s) - Long term, for major moves
- 24 hours (86400s) - Very long term

ANALYSIS GUIDELINES:
1. Use RSI to identify overbought (>70) or oversold (<30) conditions
2. Check if price is above/below key moving averages (SMA20, SMA50)
3. Look at MACD signal (EMA12 vs EMA26) for momentum
4. Consider the 1h and 24h trend alignment
5. Factor in recent price changes across timeframes
6. PREFER 30-60 minute durations - these give enough time for price movement while being engaging
7. Only use very short durations (under 30 min) if you have extremely high confidence (90%+)

TASK:
Analyze ALL the data above and predict whether BTC will go UP or DOWN from the current price.
Provide clear reasoning based on the indicators and trends.
Only recommend trading when multiple signals align. Say NEUTRAL if signals are mixed.

IMPORTANT: Respond with ONLY a valid JSON object, no other text:
{
  "direction": "UP" | "DOWN" | "NEUTRAL",
  "confidence": <0-100>,
  "reasoning": "<2-3 sentences explaining your analysis based on the indicators, trends, and price action>",
  "duration_seconds": <recommended duration: 1800, 3600, 14400, or 86400 - prefer 1800 or 3600>,
  "stake_percent": <1-10, percentage of available funds to risk based on confidence>
}`;
}

/**
 * Build prompt for evaluating whether to accept a challenge
 */
export function buildAcceptPrompt(
  challenge: Challenge,
  context: PredictionContext
): string {
  const creatorDirection = challenge.direction === 1 ? 'UP' : 'DOWN';
  const ourDirection = challenge.direction === 1 ? 'DOWN' : 'UP';

  const priceHistoryStr = context.priceHistory
    .slice(-15)
    .map((p) => {
      const date = new Date(p.timestamp).toISOString().substr(11, 8);
      return `  ${date}: ${formatUSD(p.price)}`;
    })
    .join('\n');

  // Calculate time until expiry
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = challenge.expires_at - now;

  return `You are evaluating whether to accept a price battle challenge on XPR Network.

CHALLENGE DETAILS:
- Challenge ID: ${challenge.id}
- Creator: ${challenge.creator}
- Creator bets: ${creatorDirection} (BTC will go ${creatorDirection.toLowerCase()})
- If you accept, you bet: ${ourDirection} (BTC will go ${ourDirection.toLowerCase()})
- Stake Amount: ${(parseInt(challenge.amount, 10) / 10000).toFixed(4)} XPR
- Battle Duration: ${formatDuration(challenge.duration)}
- Time Until Expiry: ${timeUntilExpiry > 0 ? formatDuration(timeUntilExpiry) : 'Expired'}

CURRENT MARKET DATA:
- Current BTC Price: ${formatUSD(context.currentPrice)}
${context.change1h !== undefined ? `- 1h Change: ${context.change1h.toFixed(2)}%` : ''}

RECENT PRICE HISTORY (last 15 data points):
${priceHistoryStr}

TASK:
Decide if you should accept this challenge. You would be betting that BTC goes ${ourDirection}.
Consider the current trend, the duration, and your confidence level.
Only accept if you have a genuine edge - remember you're betting against another player's prediction.

IMPORTANT: Respond with ONLY a valid JSON object, no other text:
{
  "accept": true | false,
  "confidence": <0-100>,
  "reasoning": "<brief 1-2 sentence explanation>"
}`;
}

/**
 * Build a market analysis prompt for general insights
 */
export function buildMarketAnalysisPrompt(context: PredictionContext): string {
  const priceHistoryStr = context.priceHistory
    .map((p) => {
      const date = new Date(p.timestamp).toISOString().substr(11, 8);
      return `  ${date}: ${formatUSD(p.price)}`;
    })
    .join('\n');

  return `Analyze the following BTC price data and provide insights:

CURRENT PRICE: ${formatUSD(context.currentPrice)}
${context.change1h !== undefined ? `1H CHANGE: ${context.change1h.toFixed(2)}%` : ''}
${context.change24h !== undefined ? `24H CHANGE: ${context.change24h.toFixed(2)}%` : ''}

PRICE HISTORY:
${priceHistoryStr}

Provide a brief analysis of:
1. Current trend (bullish/bearish/neutral)
2. Key support/resistance levels visible in the data
3. Volatility assessment
4. Short-term outlook

Keep the response concise (3-4 sentences max).`;
}
