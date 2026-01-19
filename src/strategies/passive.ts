import { TradingStrategy } from './base';
import { ResolverService, ChallengeService, OracleService } from '../services';
import { PriceBattleActions } from '../blockchain';
import { DatabaseQueries } from '../db';
import { createAIClient, buildPredictionPrompt, buildAcceptPrompt } from '../ai';
import {
  Challenge,
  CreateDecision,
  ResolveResult,
  PredictionContext,
  AIClient,
  BotConfig,
  DIRECTION,
} from '../types';
import { Logger, formatXPRWithSymbol } from '../utils';

/**
 * Passive trading strategy
 * - Only creates challenges when AI has high confidence (>= 75%)
 * - Only accepts challenges when AI has high confidence
 * - Uses conservative stake percentages
 * - Always resolves expired battles
 */
export class PassiveStrategy implements TradingStrategy {
  name = 'Passive Trader';
  mode = 'passive' as const;

  private resolverService: ResolverService;
  private challengeService: ChallengeService;
  private oracleService: OracleService;
  private actions: PriceBattleActions;
  private db: DatabaseQueries;
  private aiClient: AIClient;
  private config: BotConfig;
  private logger?: Logger;

  // Confidence thresholds for passive mode
  private readonly MIN_CREATE_CONFIDENCE = 75;
  private readonly MIN_ACCEPT_CONFIDENCE = 75;
  private readonly MAX_STAKE_PERCENT = 3;

  constructor(
    resolverService: ResolverService,
    challengeService: ChallengeService,
    oracleService: OracleService,
    actions: PriceBattleActions,
    db: DatabaseQueries,
    config: BotConfig,
    logger?: Logger
  ) {
    this.resolverService = resolverService;
    this.challengeService = challengeService;
    this.oracleService = oracleService;
    this.actions = actions;
    this.db = db;
    this.config = config;
    this.logger = logger;
    this.aiClient = createAIClient(config.ai, logger);
  }

  async tick(): Promise<void> {
    // Always resolve and expire first
    await this.resolveExpired();
    await this.expireExpired();

    // Check if contract is paused
    if (await this.challengeService.isPaused()) {
      this.logger?.warn('Contract is paused, skipping trading');
      return;
    }

    // Get current context
    const context = await this.buildContext();

    // Check if we can create new challenges
    const activeCount = await this.challengeService.getOurActiveChallengesCount();
    if (activeCount < this.config.risk.maxConcurrentChallenges) {
      const createDecision = await this.shouldCreate(context);
      if (createDecision) {
        await this.executeCreate(createDecision, context);
      }
    }

    // Check for challenges to accept
    const acceptable = await this.challengeService.getAcceptableChallenges();
    for (const challenge of acceptable) {
      if (activeCount >= this.config.risk.maxConcurrentChallenges) break;

      if (await this.shouldAccept(challenge, context)) {
        await this.executeAccept(challenge, context);
      }
    }
  }

  async shouldCreate(context: PredictionContext): Promise<CreateDecision | null> {
    try {
      const prompt = buildPredictionPrompt(context);
      const analysis = await this.aiClient.analyze(prompt);

      // Log decision
      this.db.logDecision({
        action: 'analyze_create',
        direction: analysis.direction,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        aiProvider: this.config.ai.provider,
        priceAtDecision: context.currentPrice,
      });

      // Only proceed with high confidence
      if (
        analysis.direction === 'NEUTRAL' ||
        analysis.confidence < this.MIN_CREATE_CONFIDENCE
      ) {
        this.logger?.info('Skipping create - low confidence', {
          direction: analysis.direction,
          confidence: analysis.confidence,
        });
        return null;
      }

      // Use conservative stake
      const stakePercent = Math.min(
        analysis.suggestedStake,
        this.MAX_STAKE_PERCENT,
        this.config.risk.maxPercentPerChallenge
      );

      return {
        direction: analysis.direction === 'UP' ? DIRECTION.UP : DIRECTION.DOWN,
        duration: analysis.recommendedDuration,
        stakePercent,
        reasoning: analysis.reasoning,
      };
    } catch (error) {
      this.logger?.error('Failed to get AI prediction', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async shouldAccept(
    challenge: Challenge,
    context: PredictionContext
  ): Promise<boolean> {
    try {
      const prompt = buildAcceptPrompt(challenge, context);
      const analysis = await this.aiClient.evaluateAccept(prompt);

      // Log decision
      this.db.logDecision({
        challengeId: challenge.id,
        action: analysis.accept ? 'accept' : 'skip',
        direction: challenge.direction === 1 ? 'DOWN' : 'UP', // Opposite of creator
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        aiProvider: this.config.ai.provider,
        priceAtDecision: context.currentPrice,
      });

      // Only accept with high confidence
      if (!analysis.accept || analysis.confidence < this.MIN_ACCEPT_CONFIDENCE) {
        this.logger?.debug('Skipping challenge', {
          challengeId: challenge.id,
          accept: analysis.accept,
          confidence: analysis.confidence,
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger?.error('Failed to evaluate challenge', {
        challengeId: challenge.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async resolveExpired(): Promise<ResolveResult[]> {
    return this.resolverService.resolveAll();
  }

  async expireExpired(): Promise<ResolveResult[]> {
    return this.resolverService.expireAll();
  }

  private async buildContext(): Promise<PredictionContext> {
    const [{ price }, priceHistory, performance] = await Promise.all([
      this.oracleService.getBTCPrice(),
      Promise.resolve(this.db.getRecentPrices(60)),
      Promise.resolve(this.db.getPerformance()),
    ]);

    return {
      currentPrice: price,
      priceHistory: priceHistory.reverse(), // Oldest first
      performance,
    };
  }

  private async executeCreate(
    decision: CreateDecision,
    context: PredictionContext
  ): Promise<void> {
    try {
      // TODO: Get actual balance and calculate stake
      // For now, use a fixed minimum stake
      const amount = '100.0000 XPR';

      this.logger?.info('Creating challenge', {
        direction: decision.direction === 1 ? 'UP' : 'DOWN',
        duration: decision.duration,
        amount,
        reasoning: decision.reasoning,
      });

      const result = await this.actions.createChallenge({
        amount,
        direction: decision.direction,
        duration: decision.duration,
      });

      this.db.logDecision({
        action: 'create',
        direction: decision.direction === 1 ? 'UP' : 'DOWN',
        reasoning: decision.reasoning,
        priceAtDecision: context.currentPrice,
      });

      this.logger?.info('Challenge created', {
        txId: result.transaction_id,
      });
    } catch (error) {
      this.logger?.error('Failed to create challenge', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeAccept(
    challenge: Challenge,
    context: PredictionContext
  ): Promise<void> {
    try {
      const { price } = await this.oracleService.getBTCPrice();
      const currentPrice = this.oracleService.priceToU64(price);
      const amount = formatXPRWithSymbol(challenge.amount);

      this.logger?.info('Accepting challenge', {
        challengeId: challenge.id,
        amount,
        currentPrice: price,
      });

      const result = await this.actions.acceptChallenge({
        challengeId: challenge.id,
        amount,
        currentPrice,
      });

      this.logger?.info('Challenge accepted', {
        challengeId: challenge.id,
        txId: result.transaction_id,
      });
    } catch (error) {
      this.logger?.error('Failed to accept challenge', {
        challengeId: challenge.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
