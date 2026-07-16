export interface Metric {
  timestamp: string; // ISO 8601 string
  key: string;
  value: number;
}

export interface Stage {
  id: string;
  name: string;
  start_time: string; // ISO 8601 string
  end_time: string; // ISO 8601 string
  duration_ms: number;
  cpu_percent: number;
  ram_used_mb: number;
  gpu_util_percent: number;
  gpu_mem_used_mb: number;
  metrics: Metric[];
  trace_ref?: string | null;
}

export interface Run {
  id: string;
  name: string;
  created_at: string; // ISO 8601 string
  model_name?: string | null;
  hardware_info?: {
    gpu_type?: string | null;
    gpu_vram_mb?: number | null;
    cpu_count?: number | null;
  } | null;
  stages: Stage[];
}
