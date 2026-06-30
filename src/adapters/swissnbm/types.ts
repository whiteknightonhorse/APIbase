export interface SnbTimeseriesEntry {
  header: Array<{ dim: string; dimItem: string }>;
  metadata: {
    key: string;
    frequency: string;
    scale: string;
    unit?: string;
  };
  values: Array<{ date: string; value: number | null }>;
}

export interface SnbCubeResponse {
  timeseries: SnbTimeseriesEntry[];
}
