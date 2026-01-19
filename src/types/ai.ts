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
  priceHistory: PricePoint[];
  performance: BotPerformance;
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
