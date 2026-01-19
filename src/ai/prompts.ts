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

  return `You are a BTC price movement analyst for a price prediction game on XPR Network.

CURRENT MARKET DATA:
- Current BTC Price: ${formatUSD(context.currentPrice)}
${context.high24h ? `- 24h High: ${formatUSD(context.high24h)}` : ''}
${context.low24h ? `- 24h Low: ${formatUSD(context.low24h)}` : ''}
${context.change1h !== undefined ? `- 1h Change: ${context.change1h.toFixed(2)}%` : ''}
${context.change24h !== undefined ? `- 24h Change: ${context.change24h.toFixed(2)}%` : ''}

RECENT PRICE HISTORY (last 30 data points):
${priceHistoryStr}

BOT PERFORMANCE (cumulative):
- Wins: ${context.performance.wins}
- Losses: ${context.performance.losses}
- Ties: ${context.performance.ties}
- Win Rate: ${context.performance.winRate.toFixed(1)}%

AVAILABLE DURATIONS:
- 5 minutes (300s) - Very short term
- 10 minutes (600s) - Short term
- 30 minutes (1800s) - Medium term
- 1 hour (3600s) - Standard
- 4 hours (14400s) - Long term
- 24 hours (86400s) - Very long term

TASK:
Analyze the price data and predict whether BTC will go UP or DOWN from the current price.
Consider momentum, volatility, and recent trends. Be conservative - only recommend trading when you see a clear signal.

IMPORTANT: Respond with ONLY a valid JSON object, no other text:
{
  "direction": "UP" | "DOWN" | "NEUTRAL",
  "confidence": <0-100>,
  "reasoning": "<brief 1-2 sentence explanation>",
  "duration_seconds": <recommended duration: 300, 600, 1800, 3600, 14400, or 86400>,
  "stake_percent": <1-10, percentage of available funds to risk>
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
