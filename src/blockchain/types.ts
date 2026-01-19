export interface TableRowsParams {
  scope: string;
  code: string;
  table: string;
  json?: boolean;
  lower_bound?: string | number;
  upper_bound?: string | number;
  limit?: number;
  key_type?: string;
  index_position?: number;
  reverse?: boolean;
}

export interface TableRowsResponse<T = any> {
  rows: T[];
  more: boolean;
  next_key?: string;
}

export interface Action {
  account: string;
  name: string;
  authorization: Authorization[];
  data: Record<string, any>;
}

export interface Authorization {
  actor: string;
  permission: string;
}

export interface TransactResult {
  transaction_id: string;
  processed: {
    id: string;
    block_num: number;
    block_time: string;
    receipt: any;
    elapsed: number;
    net_usage: number;
    scheduled: boolean;
    action_traces: any[];
  };
}

export interface TransactOptions {
  useLastIrreversible?: boolean;
  expireSeconds?: number;
  broadcast?: boolean;
}
