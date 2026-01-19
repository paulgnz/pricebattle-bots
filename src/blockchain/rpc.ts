import { JsonRpc } from '@proton/js';
import { TableRowsParams, TableRowsResponse } from './types';
import { Logger, withRetry } from '../utils';

export class RpcClient {
  private rpc: JsonRpc;
  private endpoints: string[];
  private currentIndex: number = 0;
  private logger?: Logger;

  constructor(endpoints: string[], logger?: Logger) {
    this.endpoints = endpoints;
    this.logger = logger;
    this.rpc = new JsonRpc(endpoints);
  }

  /**
   * Get table rows with automatic failover
   */
  async getTableRows<T = any>(params: TableRowsParams): Promise<T[]> {
    const response = await this.withFailover<TableRowsResponse<T>>(() =>
      this.rpc.get_table_rows({
        json: true,
        ...params,
      })
    );
    return response.rows;
  }

  /**
   * Get currency balance for an account
   */
  async getCurrencyBalance(
    contract: string,
    account: string,
    symbol: string
  ): Promise<string[]> {
    return this.withFailover(() =>
      this.rpc.get_currency_balance(contract, account, symbol)
    );
  }

  /**
   * Get account info
   */
  async getAccount(account: string): Promise<any> {
    return this.withFailover(() => this.rpc.get_account(account));
  }

  /**
   * Get the underlying JsonRpc instance
   */
  getRpc(): JsonRpc {
    return this.rpc;
  }

  /**
   * Get current endpoint
   */
  getCurrentEndpoint(): string {
    return this.endpoints[this.currentIndex];
  }

  /**
   * Execute with automatic failover and retry
   */
  private async withFailover<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(
      async () => {
        try {
          return await fn();
        } catch (error) {
          // Rotate to next endpoint on failure
          this.rotateEndpoint();
          throw error;
        }
      },
      {
        maxRetries: this.endpoints.length,
        initialDelay: 500,
        maxDelay: 5000,
        logger: this.logger,
      }
    );
  }

  /**
   * Rotate to next endpoint
   */
  private rotateEndpoint(): void {
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    this.rpc = new JsonRpc([this.endpoints[this.currentIndex]]);
    this.logger?.debug(`Rotated to endpoint: ${this.endpoints[this.currentIndex]}`);
  }
}
