export type ScanStatus = 'pending'|'running'|'completed'|'failed'|'cancelled';
export type Severity   = 'info'|'low'|'medium'|'high'|'critical';

export interface ScanJob {
  id:             string;
  user_id:        string;
  target:         string;
  mode:           string;
  sensitivity:    string;
  tools:          string[];
  status:         ScanStatus;
  created_at:     string;
  finished_at?:   string;
  overall_score?: number;
  findings_count: number;
}
