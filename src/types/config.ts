export type BotMode = 'resolver' | 'passive' | 'aggressive';
export type AIProvider = 'claude' | 'openai';
export type ChainName = 'proton' | 'proton-test';

export interface RiskConfig {
  maxPercentPerChallenge: number;
  maxConcurrentChallenges: number;
  minBalanceReserve: number;
  maxDailyLoss: number;
}

export interface IntervalConfig {
  priceCheck: number;
  challengeMonitor: number;
  resolverCheck: number;
}

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface BotConfig {
  // Network
  chain: ChainName;
  endpoints: string[];
  chainId: string;

  // Account
  account: string;
  permission: string;
  privateKey: string;

  // Bot settings
  mode: BotMode;
  dryRun: boolean;

  // Risk management
  risk: RiskConfig;

  // AI settings
  ai: AIConfig;

  // Polling intervals
  intervals: IntervalConfig;

  // Database
  databasePath: string;

  // Logging
  logLevel: string;

  // CoinGecko API key (optional - improves rate limiting)
  coingeckoApiKey?: string;
}

export interface NetworkConfig {
  chainId: string;
  endpoints: string[];
}

export const NETWORKS: Record<ChainName, NetworkConfig> = {
  proton: {
    chainId: '384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0',
    endpoints: [
      'https://proton.greymass.com',
      'https://proton.eosusa.io',
      'https://proton.cryptolions.io',
    ],
  },
  'proton-test': {
    chainId: '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd',
    endpoints: [
      'https://testnet.protonchain.com',
    ],
  },
};
