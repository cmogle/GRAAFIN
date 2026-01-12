import { supabase } from '../db/supabase.js';

export interface MonitoredEndpoint {
  id: string;
  organiser: string;
  endpointUrl: string;
  name: string;
  enabled: boolean;
  checkIntervalMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointStatus {
  endpointId: string;
  status: 'up' | 'down' | 'unknown';
  statusCode: number | null;
  responseTimeMs: number | null;
  hasResults: boolean;
  lastChecked: string;
  lastStatusChange: string;
  consecutiveFailures: number;
}

export interface EndpointStatusHistory {
  id: string;
  endpointId: string;
  status: 'up' | 'down' | 'unknown';
  statusCode: number | null;
  responseTimeMs: number | null;
  hasResults: boolean;
  errorMessage: string | null;
  checkedAt: string;
}

// Monitored Endpoints
export async function createMonitoredEndpoint(endpoint: {
  organiser: string;
  endpointUrl: string;
  name: string;
  enabled?: boolean;
  checkIntervalMinutes?: number;
}): Promise<MonitoredEndpoint> {
  const { data, error } = await supabase
    .from('monitored_endpoints')
    .insert({
      organiser: endpoint.organiser,
      endpoint_url: endpoint.endpointUrl,
      name: endpoint.name,
      enabled: endpoint.enabled !== undefined ? endpoint.enabled : true,
      check_interval_minutes: endpoint.checkIntervalMinutes || 5,
    } as any)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create monitored endpoint: ${error.message}`);
  }

  const row = data as any;
  return {
    id: row.id,
    organiser: row.organiser,
    endpointUrl: row.endpoint_url,
    name: row.name,
    enabled: row.enabled,
    checkIntervalMinutes: row.check_interval_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getMonitoredEndpoint(endpointId: string): Promise<MonitoredEndpoint | null> {
  const { data, error } = await supabase
    .from('monitored_endpoints')
    .select('*')
    .eq('id', endpointId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get monitored endpoint: ${error.message}`);
  }

  const row = data as any;
  return {
    id: row.id,
    organiser: row.organiser,
    endpointUrl: row.endpoint_url,
    name: row.name,
    enabled: row.enabled,
    checkIntervalMinutes: row.check_interval_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllMonitoredEndpoints(enabledOnly: boolean = false): Promise<MonitoredEndpoint[]> {
  let query = supabase.from('monitored_endpoints').select('*').order('created_at', { ascending: false });

  if (enabledOnly) {
    query = query.eq('enabled', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get monitored endpoints: ${error.message}`);
  }

  return ((data || []) as any[]).map((item: any) => ({
    id: item.id,
    organiser: item.organiser,
    endpointUrl: item.endpoint_url,
    name: item.name,
    enabled: item.enabled,
    checkIntervalMinutes: item.check_interval_minutes,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}

export async function updateMonitoredEndpoint(
  endpointId: string,
  updates: {
    name?: string;
    enabled?: boolean;
    checkIntervalMinutes?: number;
  }
): Promise<MonitoredEndpoint> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
  if (updates.checkIntervalMinutes !== undefined) updateData.check_interval_minutes = updates.checkIntervalMinutes;

  const { data, error } = await supabase
    .from('monitored_endpoints')
    // @ts-ignore - Supabase type inference issue
    .update(updateData)
    .eq('id', endpointId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update monitored endpoint: ${error.message}`);
  }

  const row = data as any;
  return {
    id: row.id,
    organiser: row.organiser,
    endpointUrl: row.endpoint_url,
    name: row.name,
    enabled: row.enabled,
    checkIntervalMinutes: row.check_interval_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteMonitoredEndpoint(endpointId: string): Promise<void> {
  const { error } = await supabase.from('monitored_endpoints').delete().eq('id', endpointId);

  if (error) {
    throw new Error(`Failed to delete monitored endpoint: ${error.message}`);
  }
}

// Endpoint Status
export async function saveEndpointStatus(
  endpointId: string,
  status: {
    status: 'up' | 'down' | 'unknown';
    statusCode: number | null;
    responseTimeMs: number | null;
    hasResults: boolean;
    errorMessage?: string | null;
  }
): Promise<void> {
  // Get previous status to detect changes
  const previousStatus = await getEndpointStatus(endpointId);
  const statusChanged = !previousStatus || previousStatus.status !== status.status;

  // Save to history
  const { error: historyError } = await supabase.from('endpoint_status_history').insert({
    endpoint_id: endpointId,
    status: status.status,
    status_code: status.statusCode,
    response_time_ms: status.responseTimeMs,
    has_results: status.hasResults,
    error_message: status.errorMessage || null,
  } as any);

  if (historyError) {
    throw new Error(`Failed to save status history: ${historyError.message}`);
  }

  // Update current status (upsert)
  const currentStatusData: Record<string, unknown> = {
    endpoint_id: endpointId,
    status: status.status,
    status_code: status.statusCode,
    response_time_ms: status.responseTimeMs,
    has_results: status.hasResults,
    last_checked: new Date().toISOString(),
  };

  if (statusChanged) {
    currentStatusData.last_status_change = new Date().toISOString();
    currentStatusData.consecutive_failures = status.status === 'down' ? (previousStatus?.consecutiveFailures || 0) + 1 : 0;
  } else {
    // Keep existing values if status hasn't changed
    if (previousStatus) {
      currentStatusData.last_status_change = previousStatus.lastStatusChange;
      currentStatusData.consecutive_failures =
        status.status === 'down' ? (previousStatus.consecutiveFailures || 0) + 1 : 0;
    } else {
      currentStatusData.last_status_change = new Date().toISOString();
      currentStatusData.consecutive_failures = status.status === 'down' ? 1 : 0;
    }
  }

  const { error: currentError } = await supabase
    .from('endpoint_status_current')
    .upsert(currentStatusData as any, { onConflict: 'endpoint_id' });

  if (currentError) {
    throw new Error(`Failed to save current status: ${currentError.message}`);
  }
}

export async function getEndpointStatus(endpointId: string): Promise<EndpointStatus | null> {
  const { data, error } = await supabase
    .from('endpoint_status_current')
    .select('*')
    .eq('endpoint_id', endpointId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get endpoint status: ${error.message}`);
  }

  const row = data as any;
  return {
    endpointId: row.endpoint_id,
    status: row.status as 'up' | 'down' | 'unknown',
    statusCode: row.status_code,
    responseTimeMs: row.response_time_ms,
    hasResults: row.has_results,
    lastChecked: row.last_checked,
    lastStatusChange: row.last_status_change,
    consecutiveFailures: row.consecutive_failures,
  };
}

export async function getEndpointStatusHistory(
  endpointId: string,
  limit: number = 100
): Promise<EndpointStatusHistory[]> {
  const { data, error } = await supabase
    .from('endpoint_status_history')
    .select('*')
    .eq('endpoint_id', endpointId)
    .order('checked_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get status history: ${error.message}`);
  }

  return ((data || []) as any[]).map((item: any) => ({
    id: item.id,
    endpointId: item.endpoint_id,
    status: item.status as 'up' | 'down' | 'unknown',
    statusCode: item.status_code,
    responseTimeMs: item.response_time_ms,
    hasResults: item.has_results,
    errorMessage: item.error_message,
    checkedAt: item.checked_at,
  }));
}
