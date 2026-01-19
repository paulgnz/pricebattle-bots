import { TradingStrategy } from './base';
import { ResolverService } from '../services';
import {
  Challenge,
  CreateDecision,
  ResolveResult,
  PredictionContext,
} from '../types';
import { Logger } from '../utils';

/**
 * Resolver-only strategy
 * - Never creates challenges
 * - Never accepts challenges
 * - Always resolves expired battles for 2% fee
 */
export class ResolverStrategy implements TradingStrategy {
  name = 'Resolver Only';
  mode = 'resolver' as const;

  private resolverService: ResolverService;
  private logger?: Logger;

  constructor(resolverService: ResolverService, logger?: Logger) {
    this.resolverService = resolverService;
    this.logger = logger;
  }

  async tick(): Promise<void> {
    // Just resolve and expire
    await this.resolveExpired();
    await this.expireExpired();
  }

  async shouldCreate(_context: PredictionContext): Promise<CreateDecision | null> {
    // Never create challenges in resolver mode
    return null;
  }

  async shouldAccept(
    _challenge: Challenge,
    _context: PredictionContext
  ): Promise<boolean> {
    // Never accept challenges in resolver mode
    return false;
  }

  async resolveExpired(): Promise<ResolveResult[]> {
    return this.resolverService.resolveAll();
  }

  async expireExpired(): Promise<ResolveResult[]> {
    return this.resolverService.expireAll();
  }
}
