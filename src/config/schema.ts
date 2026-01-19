import { z } from 'zod';

export const BotModeSchema = z.enum(['resolver', 'passive', 'aggressive']);
export const AIProviderSchema = z.enum(['claude', 'openai']);
export const ChainNameSchema = z.enum(['proton', 'proton-test']);
export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug']);

export const RiskConfigSchema = z.object({
  maxPercentPerChallenge: z.number().min(1).max(50).default(5),
  maxConcurrentChallenges: z.number().min(1).max(10).default(3),
  minBalanceReserve: z.number().min(0).default(100),
  maxDailyLoss: z.number().min(0).default(500),
});

export const IntervalConfigSchema = z.object({
  priceCheck: z.number().min(10000).default(60000),
  challengeMonitor: z.number().min(5000).default(30000),
  resolverCheck: z.number().min(5000).default(15000),
});

export const AIConfigSchema = z.object({
  provider: AIProviderSchema.default('claude'),
  apiKey: z.string().min(1),
  model: z.string().optional(),
  maxTokens: z.number().optional().default(1024),
});

export const EnvSchema = z.object({
  // Required
  PRIVATE_KEY: z.string().min(1, 'PRIVATE_KEY is required'),
  ACCOUNT_NAME: z.string().min(1, 'ACCOUNT_NAME is required'),

  // Optional with defaults
  PERMISSION: z.string().default('active'),
  CHAIN: ChainNameSchema.default('proton'),

  // AI
  AI_PROVIDER: AIProviderSchema.default('claude'),
  CLAUDE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Risk
  MAX_PERCENT_PER_CHALLENGE: z.string().transform(Number).pipe(z.number()).default('5'),
  MAX_CONCURRENT_CHALLENGES: z.string().transform(Number).pipe(z.number()).default('3'),
  MIN_BALANCE_RESERVE: z.string().transform(Number).pipe(z.number()).default('100'),
  MAX_DAILY_LOSS: z.string().transform(Number).pipe(z.number()).default('500'),

  // Intervals
  PRICE_CHECK_INTERVAL: z.string().transform(Number).pipe(z.number()).default('60000'),
  CHALLENGE_MONITOR_INTERVAL: z.string().transform(Number).pipe(z.number()).default('30000'),
  RESOLVER_CHECK_INTERVAL: z.string().transform(Number).pipe(z.number()).default('15000'),

  // Logging
  LOG_LEVEL: LogLevelSchema.default('info'),
  DATABASE_PATH: z.string().default('./data/pricebattle.db'),

  // CoinGecko API (optional - improves rate limiting)
  COINGECKO_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
