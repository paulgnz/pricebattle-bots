import { Challenge, CreateDecision, ResolveResult, PredictionContext } from '../types';

/**
 * Base interface for all trading strategies
 */
export interface TradingStrategy {
  /** Strategy name for display */
  name: string;

  /** Bot mode this strategy implements */
  mode: 'resolver' | 'passive' | 'aggressive';

  /**
   * Called on each tick of the main loop
   * Strategy can perform any actions needed
   */
  tick(): Promise<void>;

  /**
   * Determine if the bot should create a new challenge
   * Returns null if no challenge should be created
   */
  shouldCreate(context: PredictionContext): Promise<CreateDecision | null>;

  /**
   * Determine if the bot should accept a specific challenge
   */
  shouldAccept(challenge: Challenge, context: PredictionContext): Promise<boolean>;

  /**
   * Resolve all expired battles (always enabled)
   */
  resolveExpired(): Promise<ResolveResult[]>;

  /**
   * Expire all open challenges that have passed their expiry
   */
  expireExpired(): Promise<ResolveResult[]>;
}

/**
 * Context passed to strategies for decision-making
 */
export interface StrategyContext {
  currentPrice: number;
  priceHistory: { price: number; timestamp: number }[];
  balance: number;
  activeChallenges: number;
  performance: {
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
    totalWon: number;
    totalLost: number;
  };
}
