import { Api, JsonRpc, JsSignatureProvider } from '@proton/js';
import { Action, TransactResult, TransactOptions } from './types';
import { Logger } from '../utils';

export class TransactionSigner {
  private api: Api;
  private rpc: JsonRpc;
  private logger?: Logger;
  private dryRun: boolean;

  constructor(
    rpc: JsonRpc,
    privateKey: string,
    options: { logger?: Logger; dryRun?: boolean } = {}
  ) {
    this.rpc = rpc;
    this.logger = options.logger;
    this.dryRun = options.dryRun || false;

    const signatureProvider = new JsSignatureProvider([privateKey]);
    this.api = new Api({
      rpc,
      signatureProvider,
    });
  }

  /**
   * Execute a transaction with one or more actions
   */
  async transact(
    actions: Action[],
    options: TransactOptions = {}
  ): Promise<TransactResult> {
    const defaultOptions: TransactOptions = {
      useLastIrreversible: true,
      expireSeconds: 300,
      broadcast: true,
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // Log actions
    this.logger?.debug('Transacting', {
      actions: actions.map((a) => ({
        contract: a.account,
        action: a.name,
        data: a.data,
      })),
      dryRun: this.dryRun,
    });

    // In dry run mode, just return a mock result
    if (this.dryRun) {
      this.logger?.info('[DRY RUN] Would execute transaction', {
        actions: actions.map((a) => `${a.account}::${a.name}`),
      });

      return {
        transaction_id: 'dry_run_' + Date.now().toString(16),
        processed: {
          id: 'dry_run_' + Date.now().toString(16),
          block_num: 0,
          block_time: new Date().toISOString(),
          receipt: null,
          elapsed: 0,
          net_usage: 0,
          scheduled: false,
          action_traces: [],
        },
      };
    }

    try {
      const result = await this.api.transact(
        { actions },
        mergedOptions
      );

      const txResult = result as TransactResult;

      this.logger?.info('Transaction successful', {
        txId: txResult.transaction_id,
        actions: actions.map((a) => `${a.account}::${a.name}`),
      });

      return txResult;
    } catch (error) {
      this.logger?.error('Transaction failed', {
        error: error instanceof Error ? error.message : String(error),
        actions: actions.map((a) => `${a.account}::${a.name}`),
      });
      throw error;
    }
  }

  /**
   * Update RPC endpoint
   */
  setRpc(rpc: JsonRpc): void {
    this.rpc = rpc;
    this.api = new Api({
      rpc,
      signatureProvider: (this.api as any).signatureProvider,
    });
  }

  /**
   * Check if dry run mode is enabled
   */
  isDryRun(): boolean {
    return this.dryRun;
  }
}
