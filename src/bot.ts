import { RpcClient, TransactionSigner, PriceBattleActions } from './blockchain';
import { OracleService, ChallengeService, ResolverService, MarketDataService } from './services';
import { initDatabase, DatabaseQueries } from './db';
import { TradingStrategy, createStrategy } from './strategies';
import { BotConfig } from './types';
import { createLogger, Logger } from './utils';

export class PriceBattleBot {
  private config: BotConfig;
  private logger: Logger;
  private strategy!: TradingStrategy;
  private rpc!: RpcClient;
  private oracleService!: OracleService;
  private db!: DatabaseQueries;

  private intervals: NodeJS.Timeout[] = [];
  private isRunning: boolean = false;
  private initialized: boolean = false;

  constructor(config: BotConfig) {
    this.config = config;
    this.logger = createLogger(config.logLevel);
  }

  /**
   * Initialize the bot (must be called before start)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize database
    const dbInstance = await initDatabase(this.config.databasePath, this.logger);
    this.db = new DatabaseQueries(dbInstance, this.config.databasePath);

    // Initialize blockchain client
    this.rpc = new RpcClient(this.config.endpoints, this.logger);

    // Initialize signer
    const signer = new TransactionSigner(this.rpc.getRpc(), this.config.privateKey, {
      logger: this.logger,
      dryRun: this.config.dryRun,
    });

    // Initialize actions
    const actions = new PriceBattleActions(
      signer,
      this.config.account,
      this.config.permission,
      this.logger
    );

    // Initialize services
    this.oracleService = new OracleService(this.rpc, this.logger);

    const challengeService = new ChallengeService(
      this.rpc,
      this.db,
      this.config.account,
      this.logger
    );

    const resolverService = new ResolverService(
      actions,
      challengeService,
      this.oracleService,
      this.db,
      this.logger
    );

    // Initialize market data service (CoinGecko for multi-timeframe analysis)
    const marketDataService = new MarketDataService(this.logger, this.config.coingeckoApiKey);

    // Create strategy
    this.strategy = createStrategy(this.config.mode, {
      resolverService,
      challengeService,
      oracleService: this.oracleService,
      marketDataService,
      actions,
      db: this.db,
      config: this.config,
      logger: this.logger,
    });

    this.initialized = true;
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Bot is already running');
      return;
    }

    // Ensure initialized
    await this.initialize();

    this.isRunning = true;

    this.logger.info('Starting PriceBattle Bot', {
      account: this.config.account,
      mode: this.config.mode,
      strategy: this.strategy.name,
      dryRun: this.config.dryRun,
    });

    // Initial price record
    await this.recordPrice();

    // Price polling
    this.intervals.push(
      setInterval(() => this.recordPrice(), this.config.intervals.priceCheck)
    );

    // Strategy tick (includes resolver check)
    this.intervals.push(
      setInterval(
        () => this.runStrategyTick(),
        this.config.intervals.resolverCheck
      )
    );

    this.logger.info('Bot started successfully', {
      priceInterval: `${this.config.intervals.priceCheck / 1000}s`,
      strategyInterval: `${this.config.intervals.resolverCheck / 1000}s`,
    });
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping bot...');

    // Clear all intervals
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];

    this.isRunning = false;
    this.logger.info('Bot stopped');
  }

  /**
   * Record current price to database
   */
  private async recordPrice(): Promise<void> {
    try {
      const { price, timestamp } = await this.oracleService.getBTCPrice();
      this.db.insertPrice(price, Math.floor(timestamp / 1000));
      this.logger.debug('Recorded price', { price });
    } catch (error) {
      this.logger.error('Failed to record price', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Run strategy tick
   */
  private async runStrategyTick(): Promise<void> {
    try {
      await this.strategy.tick();
    } catch (error) {
      this.logger.error('Strategy tick failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<BotStatus> {
    const performance = this.db.getTotalPerformance();
    const [balance] = await this.rpc.getCurrencyBalance(
      'eosio.token',
      this.config.account,
      'XPR'
    );

    return {
      account: this.config.account,
      mode: this.config.mode,
      strategy: this.strategy.name,
      isRunning: this.isRunning,
      balance: balance || '0.0000 XPR',
      performance,
    };
  }

  /**
   * Get database queries instance
   */
  getDb(): DatabaseQueries {
    return this.db;
  }

  /**
   * Get resolver service for manual operations
   */
  async manualResolve(): Promise<void> {
    // Ensure initialized before running
    await this.initialize();

    this.logger.info('Running manual resolve...');
    const results = await this.strategy.resolveExpired();
    this.logger.info('Manual resolve complete', {
      resolved: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });
  }
}

export interface BotStatus {
  account: string;
  mode: string;
  strategy: string;
  isRunning: boolean;
  balance: string;
  performance: {
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
    totalWon: number;
    totalLost: number;
    resolverEarnings: number;
  };
}
