export type TableSize = {
  table: string
  total_bytes: number
  rows_estimate: number
}

export type SlowQuery = {
  query: string
  mean_exec_ms: number
  calls: number
  total_ms: number
}

export type DbHealthSnapshot = {
  db_size_bytes: number
  db_size_pretty: string
  table_sizes: TableSize[]
  monthly_growth: {
    expenses_30d: number
    notifications_30d: number
    monthly_summaries_total: number
  }
  slow_queries_top10: SlowQuery[]
  limits_pro: {
    db_limit_bytes: number
    db_pct_used: number
  }
  computed_at: string
}
