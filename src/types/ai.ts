import { Direction } from './challenge';

export interface AIAnalysis {
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  confidence: number; // 0-100
  reasoning: string;
  recommendedDuration: number; // seconds
  suggestedStake: number; // percentage of funds
}

export interface AcceptAnalysis {
  accept: boolean;
  confidence: number;
  reasoning: string;
}

export interface PredictionContext {
  currentPrice: number;
  high24h?: number;
  low24h?: number;
  change1h?: number;
  change24h?: number;
  change7d?: number;
  change30d?: number;
  volatility24h?: number;
  pricePosition?: number; // Where price is in 24h range (0-100%)
  volume24h?: number;
  priceHistory: PricePoint[];
  performance: BotPerformance;

  // Technical indicators (from multi-timeframe analysis)
  indicators?: {
    sma20: number;
    sma50: number;
    ema12: number;
    ema26: number;
    rsi14: number;
    trend1h: 'bullish' | 'bearish' | 'neutral';
    trend24h: 'bullish' | 'bearish' | 'neutral';
    momentum: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down';
  };
}

export interface PricePoint {
  price: number;
  timestamp: number;
}

export interface BotPerformance {
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  totalWon: number;
  totalLost: number;
}

export interface AIClient {
  analyze(prompt: string): Promise<AIAnalysis>;
  evaluateAccept(prompt: string): Promise<AcceptAnalysis>;
}
