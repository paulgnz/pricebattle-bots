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
 * Aggressive trading strategy
 * - Creates challenges with any AI signal (>= 50% confidence)
 * - Accepts challenges more readily
 * - Uses higher stake percentages
 * - Always resolves expired battles
 */
export class AggressiveStrategy implements TradingStrategy {
  name = 'Aggressive Trader';
  mode = 'aggressive' as const;

  private resolverService: ResolverService;
  private challengeService: ChallengeService;
  private oracleService: OracleService;
  private actions: PriceBattleActions;
  private db: DatabaseQueries;
  private aiClient: AIClient;
  private config: BotConfig;
  private logger?: Logger;

  // Lower confidence thresholds for aggressive mode
  private readonly MIN_CREATE_CONFIDENCE = 50;
  private readonly MIN_ACCEPT_CONFIDENCE = 50;
  private readonly CREATE_COOLDOWN_MS = 60000; // 1 minute between creates
  private lastCreateTime = 0;

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

    // Check daily loss limit
    const todayPerf = this.db.getPerformance();
    const dailyLoss = todayPerf.totalLost - todayPerf.totalWon;
    if (dailyLoss >= this.config.risk.maxDailyLoss) {
      this.logger?.warn('Daily loss limit reached, pausing trading', {
        dailyLoss,
        limit: this.config.risk.maxDailyLoss,
      });
      return;
    }

    // Get current context
    const context = await this.buildContext();

    // Check if we can create new challenges
    const activeCount = await this.challengeService.getOurActiveChallengesCount();
    const openChallenges = await this.challengeService.getOpenChallenges();
    const ourOpenCount = openChallenges.filter(c => c.creator === this.config.account).length;
    const totalOurChallenges = activeCount + ourOpenCount;

    // Check cooldown and challenge limits before creating
    const now = Date.now();
    const cooldownOk = now - this.lastCreateTime >= this.CREATE_COOLDOWN_MS;

    if (totalOurChallenges < this.config.risk.maxConcurrentChallenges && cooldownOk) {
      const createDecision = await this.shouldCreate(context);
      if (createDecision) {
        await this.executeCreate(createDecision, context);
        this.lastCreateTime = now;
      }
    } else if (!cooldownOk) {
      this.logger?.debug('Skipping create - cooldown active', {
        secondsRemaining: Math.ceil((this.CREATE_COOLDOWN_MS - (now - this.lastCreateTime)) / 1000),
      });
    } else if (totalOurChallenges >= this.config.risk.maxConcurrentChallenges) {
      this.logger?.debug('Skipping create - max challenges reached', {
        active: activeCount,
        open: ourOpenCount,
        max: this.config.risk.maxConcurrentChallenges,
      });
    }

    // Aggressively check for challenges to accept
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

      // Accept any signal above threshold
      if (
        analysis.direction === 'NEUTRAL' ||
        analysis.confidence < this.MIN_CREATE_CONFIDENCE
      ) {
        this.logger?.info('Skipping create - below threshold', {
          direction: analysis.direction,
          confidence: analysis.confidence,
        });
        return null;
      }

      // Use AI-suggested stake (capped by config)
      const stakePercent = Math.min(
        analysis.suggestedStake,
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
        direction: challenge.direction === 1 ? 'DOWN' : 'UP',
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        aiProvider: this.config.ai.provider,
        priceAtDecision: context.currentPrice,
      });

      // More aggressive acceptance
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
      priceHistory: priceHistory.reverse(),
      performance,
    };
  }

  private async executeCreate(
    decision: CreateDecision,
    context: PredictionContext
  ): Promise<void> {
    try {
      // Calculate stake based on balance and config
      const balance = await this.challengeService.getBalance();
      const minReserve = this.config.risk.minBalanceReserve;
      const availableBalance = Math.max(0, balance - minReserve);

      // Minimum stake of 100 XPR
      const MIN_STAKE = 100;

      // Check if we have enough balance
      if (availableBalance < MIN_STAKE) {
        this.logger?.info('Skipping create - insufficient balance', {
          balance,
          availableBalance,
          requiredMin: MIN_STAKE,
        });
        return;
      }

      // Use configured max percentage (default 10%)
      const stakePercent = Math.min(decision.stakePercent, this.config.risk.maxPercentPerChallenge);
      let stakeAmount = Math.floor(availableBalance * (stakePercent / 100));

      // Ensure at least MIN_STAKE
      stakeAmount = Math.max(stakeAmount, MIN_STAKE);

      const amount = `${stakeAmount.toFixed(4)} XPR`;

      this.logger?.info('Creating challenge (aggressive)', {
        direction: decision.direction === 1 ? 'UP' : 'DOWN',
        duration: decision.duration,
        amount,
        balance,
        stakePercent,
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

      this.logger?.info('Accepting challenge (aggressive)', {
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
