/** Raw GENESIS-Webservices `data/table` response envelope. */
export interface DestatisStatus {
  Code: number;
  Content: string;
  Type: string;
}

export interface DestatisTableResponse {
  Status?: DestatisStatus;
  Object?: {
    Content?: string;
  };
}

/** Normalized output shape returned to agents. */
export interface DestatisTableRow {
  period: string;
  values: Array<number | string | null>;
}

export interface DestatisTableOutput {
  table_id: string;
  title: string;
  columns: string[];
  rows: DestatisTableRow[];
  notes: string;
  source: string;
}
