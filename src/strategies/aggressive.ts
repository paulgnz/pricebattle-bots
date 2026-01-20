import { TradingStrategy } from './base';
import { ResolverService, ChallengeService, OracleService, MarketDataService } from '../services';
import { PriceBattleActions } from '../blockchain';
import { DatabaseQueries } from '../db';
import { createAIClient, buildPredictionPrompt } from '../ai';
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
  private marketDataService: MarketDataService;
  private actions: PriceBattleActions;
  private db: DatabaseQueries;
  private aiClient: AIClient;
  private config: BotConfig;
  private logger?: Logger;

  // Lower confidence thresholds for aggressive mode
  private readonly MIN_CREATE_CONFIDENCE = 50;
  private readonly MIN_ACCEPT_CONFIDENCE = 50;
  private readonly CREATE_COOLDOWN_MS = 600000; // 10 minutes between creates
  private readonly MIN_DURATION = 1800; // 30 min minimum - 10 min has 27% win rate!
  private readonly MAX_DURATION = 3600; // 1 hour max for creating/accepting
  private readonly MAX_ACCEPT_STAKE = 250; // Max 250 XPR when accepting challenges
  private lastCreateTime = 0;

  constructor(
    resolverService: ResolverService,
    challengeService: ChallengeService,
    oracleService: OracleService,
    marketDataService: MarketDataService,
    actions: PriceBattleActions,
    db: DatabaseQueries,
    config: BotConfig,
    logger?: Logger
  ) {
    this.resolverService = resolverService;
    this.challengeService = challengeService;
    this.oracleService = oracleService;
    this.marketDataService = marketDataService;
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
    // Only create if we have NO open challenges waiting - reduces expired challenges
    const now = Date.now();
    const cooldownOk = now - this.lastCreateTime >= this.CREATE_COOLDOWN_MS;
    const noOpenChallenges = ourOpenCount === 0;

    if (noOpenChallenges && totalOurChallenges < this.config.risk.maxConcurrentChallenges && cooldownOk) {
      const createDecision = await this.shouldCreate(context);
      if (createDecision) {
        await this.executeCreate(createDecision, context);
        this.lastCreateTime = now;
      }
    } else if (!noOpenChallenges) {
      this.logger?.info('Skipping create - waiting for open challenge to be accepted', {
        openChallenges: ourOpenCount,
      });
    } else if (!cooldownOk) {
      this.logger?.info('Skipping create - cooldown active', {
        secondsRemaining: Math.ceil((this.CREATE_COOLDOWN_MS - (now - this.lastCreateTime)) / 1000),
      });
    } else if (totalOurChallenges >= this.config.risk.maxConcurrentChallenges) {
      this.logger?.info('Skipping create - at max challenges', {
        active: activeCount,
        open: ourOpenCount,
        total: totalOurChallenges,
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

      // Enforce duration limits (30 min to 1 hour)
      // 10 min challenges have 27% win rate - avoid them!
      const duration = Math.max(
        this.MIN_DURATION,
        Math.min(analysis.recommendedDuration, this.MAX_DURATION)
      );

      return {
        direction: analysis.direction === 'UP' ? DIRECTION.UP : DIRECTION.DOWN,
        duration,
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
      // Check duration limits - only accept 30 min to 1 hour
      // 10 min challenges have 27% win rate - avoid them!
      if (challenge.duration < this.MIN_DURATION) {
        this.logger?.debug('Skipping challenge - duration too short', {
          challengeId: challenge.id,
          duration: challenge.duration,
          minDuration: this.MIN_DURATION,
        });
        return false;
      }

      if (challenge.duration > this.MAX_DURATION) {
        this.logger?.debug('Skipping challenge - duration too long', {
          challengeId: challenge.id,
          duration: challenge.duration,
          maxDuration: this.MAX_DURATION,
        });
        return false;
      }

      // Check stake limit - skip challenges over MAX_ACCEPT_STAKE XPR
      const stakeAmount = parseInt(challenge.amount, 10) / 10000; // Convert from raw to XPR
      if (stakeAmount > this.MAX_ACCEPT_STAKE) {
        this.logger?.debug('Skipping challenge - stake too high', {
          challengeId: challenge.id,
          stake: stakeAmount,
          maxStake: this.MAX_ACCEPT_STAKE,
        });
        return false;
      }

      // Use the same prediction logic as for creating challenges
      const prompt = buildPredictionPrompt(context);
      const analysis = await this.aiClient.analyze(prompt);

      // Determine what direction we'd take if we accept
      // Creator UP (1) -> we take DOWN, Creator DOWN (2) -> we take UP
      const ourDirection = challenge.direction === 1 ? 'DOWN' : 'UP';
      const predictionMatchesOurSide = analysis.direction === ourDirection;

      // Log decision
      this.db.logDecision({
        challengeId: challenge.id,
        action: predictionMatchesOurSide && analysis.confidence >= this.MIN_ACCEPT_CONFIDENCE ? 'accept' : 'skip',
        direction: ourDirection,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        aiProvider: this.config.ai.provider,
        priceAtDecision: context.currentPrice,
      });

      // Accept if AI predicts the same direction we'd take and confidence is high enough
      if (!predictionMatchesOurSide || analysis.confidence < this.MIN_ACCEPT_CONFIDENCE) {
        this.logger?.debug('Skipping challenge', {
          challengeId: challenge.id,
          ourDirection,
          aiPrediction: analysis.direction,
          confidence: analysis.confidence,
          reason: !predictionMatchesOurSide ? 'direction mismatch' : 'low confidence',
        });
        return false;
      }

      this.logger?.info('AI recommends accepting', {
        challengeId: challenge.id,
        ourDirection,
        confidence: analysis.confidence,
      });

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

    // Try to get enhanced market data from CoinGecko
    let marketData;
    try {
      marketData = await this.marketDataService.getBTCMarketData();
    } catch (error) {
      this.logger?.warn('Failed to fetch market data, using basic context', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const context: PredictionContext = {
      currentPrice: price,
      priceHistory: priceHistory.reverse(), // Oldest first
      performance,
    };

    // Enhance with market data if available
    if (marketData) {
      context.high24h = marketData.current.high24h;
      context.low24h = marketData.current.low24h;
      context.change1h = marketData.current.change1h;
      context.change24h = marketData.current.change24h;
      context.change7d = marketData.current.change7d;
      context.change30d = marketData.current.change30d;
      context.volatility24h = marketData.current.volatility24h;
      context.pricePosition = marketData.current.pricePosition;
      context.volume24h = marketData.current.volume24h;
      context.indicators = {
        sma20: marketData.sma20,
        sma50: marketData.sma50,
        ema12: marketData.ema12,
        ema26: marketData.ema26,
        rsi14: marketData.rsi14,
        trend1h: marketData.trend1h,
        trend24h: marketData.trend24h,
        momentum: marketData.momentum,
      };

      this.logger?.info('Market analysis', {
        price: price.toFixed(2),
        change1h: `${marketData.current.change1h >= 0 ? '+' : ''}${marketData.current.change1h.toFixed(2)}%`,
        change24h: `${marketData.current.change24h >= 0 ? '+' : ''}${marketData.current.change24h.toFixed(2)}%`,
        rsi: marketData.rsi14.toFixed(1),
        trend1h: marketData.trend1h,
        trend24h: marketData.trend24h,
        momentum: marketData.momentum,
      });
    }

    return context;
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

      // Round down to nearest 100 XPR for cleaner amounts
      stakeAmount = Math.floor(stakeAmount / 100) * 100;

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
      const amount = formatXPRWithSymbol(challenge.amount);

      this.logger?.info('Accepting challenge (aggressive)', {
        challengeId: challenge.id,
        amount,
      });

      // Contract fetches price directly from oracle
      const result = await this.actions.acceptChallenge({
        challengeId: challenge.id,
        amount,
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
