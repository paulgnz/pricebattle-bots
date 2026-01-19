import * as dotenv from 'dotenv';
import * as path from 'path';
import { EnvSchema } from './schema';
import { BotConfig, BotMode, NETWORKS } from '../types';

// Load environment variables
dotenv.config();

export function loadConfig(overrides: Partial<{ mode: BotMode; dryRun: boolean }> = {}): BotConfig {
  // Parse and validate environment variables
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Configuration error:\n${errors.join('\n')}`);
  }

  const env = result.data;

  // Determine AI API key based on provider
  let aiApiKey: string;
  if (env.AI_PROVIDER === 'claude') {
    if (!env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY is required when AI_PROVIDER is claude');
    }
    aiApiKey = env.CLAUDE_API_KEY;
  } else {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when AI_PROVIDER is openai');
    }
    aiApiKey = env.OPENAI_API_KEY;
  }

  const network = NETWORKS[env.CHAIN];

  const config: BotConfig = {
    // Network
    chain: env.CHAIN,
    endpoints: network.endpoints,
    chainId: network.chainId,

    // Account
    account: env.ACCOUNT_NAME,
    permission: env.PERMISSION,
    privateKey: env.PRIVATE_KEY,

    // Bot settings
    mode: overrides.mode || 'resolver',
    dryRun: overrides.dryRun || false,

    // Risk management
    risk: {
      maxPercentPerChallenge: Number(env.MAX_PERCENT_PER_CHALLENGE),
      maxConcurrentChallenges: Number(env.MAX_CONCURRENT_CHALLENGES),
      minBalanceReserve: Number(env.MIN_BALANCE_RESERVE),
      maxDailyLoss: Number(env.MAX_DAILY_LOSS),
    },

    // AI settings
    ai: {
      provider: env.AI_PROVIDER,
      apiKey: aiApiKey,
      maxTokens: 1024,
    },

    // Polling intervals
    intervals: {
      priceCheck: Number(env.PRICE_CHECK_INTERVAL),
      challengeMonitor: Number(env.CHALLENGE_MONITOR_INTERVAL),
      resolverCheck: Number(env.RESOLVER_CHECK_INTERVAL),
    },

    // Database
    databasePath: env.DATABASE_PATH,

    // Logging
    logLevel: env.LOG_LEVEL,

    // CoinGecko API key (optional)
    coingeckoApiKey: env.COINGECKO_API_KEY,
  };

  return config;
}

export function validateConfig(config: BotConfig): void {
  // Validate mode-specific requirements
  if (config.mode !== 'resolver') {
    if (!config.ai.apiKey) {
      throw new Error(`AI API key is required for ${config.mode} mode`);
    }
  }

  // Validate private key format
  if (!config.privateKey.startsWith('PVT_K1_')) {
    throw new Error('Invalid private key format. Expected PVT_K1_... format');
  }

  // Validate account name
  if (!/^[a-z1-5.]{1,12}$/.test(config.account)) {
    throw new Error('Invalid account name. Must be 1-12 characters, lowercase a-z, 1-5, or .');
  }
}
