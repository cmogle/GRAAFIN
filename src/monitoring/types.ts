export interface SiteStatus {
  isUp: boolean;
  statusCode: number;
  responseTime: number;
  hasResults: boolean;
  error?: string;
}

export interface MonitorResult {
  currentStatus: SiteStatus;
  previousStatus: 'up' | 'down' | 'unknown' | null;
  stateChanged: boolean;
  wentUp: boolean;
  wentDown: boolean;
}
