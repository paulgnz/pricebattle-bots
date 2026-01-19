export { TradingStrategy, StrategyContext } from './base';
export { ResolverStrategy } from './resolver';
export { PassiveStrategy } from './passive';
export { AggressiveStrategy } from './aggressive';

import { TradingStrategy } from './base';
import { ResolverStrategy } from './resolver';
import { PassiveStrategy } from './passive';
import { AggressiveStrategy } from './aggressive';
import { ResolverService, ChallengeService, OracleService } from '../services';
import { PriceBattleActions } from '../blockchain';
import { DatabaseQueries } from '../db';
import { BotConfig, BotMode } from '../types';
import { Logger } from '../utils';

export interface StrategyDependencies {
  resolverService: ResolverService;
  challengeService: ChallengeService;
  oracleService: OracleService;
  actions: PriceBattleActions;
  db: DatabaseQueries;
  config: BotConfig;
  logger?: Logger;
}

/**
 * Create a strategy instance based on bot mode
 */
export function createStrategy(
  mode: BotMode,
  deps: StrategyDependencies
): TradingStrategy {
  const { resolverService, challengeService, oracleService, actions, db, config, logger } = deps;

  switch (mode) {
    case 'resolver':
      return new ResolverStrategy(resolverService, logger);

    case 'passive':
      return new PassiveStrategy(
        resolverService,
        challengeService,
        oracleService,
        actions,
        db,
        config,
        logger
      );

    case 'aggressive':
      return new AggressiveStrategy(
        resolverService,
        challengeService,
        oracleService,
        actions,
        db,
        config,
        logger
      );

    default:
      throw new Error(`Unknown bot mode: ${mode}`);
  }
}
