// Challenge status constants
export const BATTLE_STATUS = {
  OPEN: 0,
  ACTIVE: 1,
  RESOLVED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
  TIE: 5,
} as const;

export type BattleStatus = typeof BATTLE_STATUS[keyof typeof BATTLE_STATUS];

// Direction constants
export const DIRECTION = {
  UP: 1,
  DOWN: 2,
} as const;

export type Direction = typeof DIRECTION[keyof typeof DIRECTION];

// Oracle indices
export const ORACLE = {
  BTC_USD: 4,
  ETH_USD: 5,
  XPR_USD: 13,
} as const;

export type OracleIndex = typeof ORACLE[keyof typeof ORACLE];

// Duration presets in seconds
export const DURATIONS = [
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '4 hours', value: 14400 },
  { label: '24 hours', value: 86400 },
] as const;

export interface Challenge {
  id: number;
  creator: string;
  opponent: string;
  amount: string;
  direction: Direction;
  oracle_index: OracleIndex;
  duration: number;
  start_price: string;
  end_price: string;
  created_at: number;
  started_at: number;
  expires_at: number;
  status: BattleStatus;
  winner: string;
}

export interface PlayerStats {
  player: string;
  total_wagered: string;
  total_won: string;
  wins: number;
  losses: number;
  ties: number;
  win_streak: number;
  best_streak: number;
}

export interface PriceBattleConfig {
  paused: boolean;
  fee_percent: number;
  resolver_percent: number;
  min_stake: string;
  max_stake: string;
  min_duration: number;
  max_duration: number;
  challenge_expiry: number;
  min_price_move_bps: number;
  treasury: string;
}

export interface ResolveResult {
  challengeId: number;
  success: boolean;
  txId?: string;
  error?: string;
  resolverReward?: number;
}

export interface CreateDecision {
  direction: Direction;
  duration: number;
  stakePercent: number;
  reasoning: string;
}
