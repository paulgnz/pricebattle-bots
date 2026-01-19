import { RpcClient } from '../blockchain';
import { ORACLE } from '../types';
import { priceToU64, u64ToPrice, Logger } from '../utils';

export interface OraclePrice {
  price: number;
  timestamp: number;
  feedIndex: number;
}

export class OracleService {
  private rpc: RpcClient;
  private logger?: Logger;

  constructor(rpc: RpcClient, logger?: Logger) {
    this.rpc = rpc;
    this.logger = logger;
  }

  /**
   * Get BTC/USD price from oracle
   */
  async getBTCPrice(): Promise<OraclePrice> {
    return this.getPrice(ORACLE.BTC_USD);
  }

  /**
   * Get ETH/USD price from oracle
   */
  async getETHPrice(): Promise<OraclePrice> {
    return this.getPrice(ORACLE.ETH_USD);
  }

  /**
   * Get XPR/USD price from oracle
   */
  async getXPRPrice(): Promise<OraclePrice> {
    return this.getPrice(ORACLE.XPR_USD);
  }

  /**
   * Get price for a specific oracle feed
   */
  async getPrice(feedIndex: number): Promise<OraclePrice> {
    const rows = await this.rpc.getTableRows({
      scope: 'oracles',
      code: 'oracles',
      table: 'data',
      lower_bound: feedIndex,
      upper_bound: feedIndex,
      limit: 1,
    });

    if (rows.length === 0) {
      throw new Error(`Oracle feed ${feedIndex} not found`);
    }

    const row = rows[0];
    if (!row.aggregate || !row.aggregate.d_double) {
      throw new Error(`Oracle feed ${feedIndex} has no aggregate value`);
    }

    const price = parseFloat(row.aggregate.d_double);

    this.logger?.debug('Fetched oracle price', {
      feedIndex,
      price,
    });

    return {
      price,
      timestamp: Date.now(),
      feedIndex,
    };
  }

  /**
   * Convert price to u64 format for contract calls
   */
  priceToU64(price: number): string {
    return priceToU64(price);
  }

  /**
   * Convert u64 format back to price
   */
  u64ToPrice(u64: string): number {
    return u64ToPrice(u64);
  }
}
