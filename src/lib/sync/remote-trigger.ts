type TriggerRemoteSyncOptions = {
  source: string;
  requestedBy?: string | null;
  force?: boolean;
};

export type TriggerRemoteSyncResult = {
  ok: boolean;
  channel: "github" | "webhook" | "none";
  message: string;
  remoteStatus: number | null;
  remoteBodyPreview: string | null;
};

const DEFAULT_TIMEOUT_MS = 12_000;

async function responsePreview(resp: Response): Promise<string | null> {
  const text = await resp.text().catch(() => "");
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > 320 ? `${trimmed.slice(0, 320)}...` : trimmed;
}

function hasGithubConfig() {
  return Boolean(process.env.STRAVA_SYNC_GITHUB_TOKEN);
}

function hasWebhookConfig() {
  return Boolean(process.env.STRAVA_SYNC_WEBHOOK_URL);
}

async function triggerViaGithub(options: TriggerRemoteSyncOptions): Promise<TriggerRemoteSyncResult> {
  const token = process.env.STRAVA_SYNC_GITHUB_TOKEN;
  const owner = process.env.STRAVA_SYNC_GITHUB_OWNER || "cmogle";
  const repo = process.env.STRAVA_SYNC_GITHUB_REPO || "strava-sync";
  const workflowId = process.env.STRAVA_SYNC_GITHUB_WORKFLOW || "fionnuala-manual-sync.yml";
  const ref = process.env.STRAVA_SYNC_GITHUB_REF || "main";

  if (!token) {
    return {
      ok: false,
      channel: "github",
      message:
        "GitHub sync trigger is not configured. Set STRAVA_SYNC_GITHUB_TOKEN (and optional owner/repo/workflow/ref).",
      remoteStatus: null,
      remoteBodyPreview: null,
    };
  }

  const endpoint = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        sync_mode: options.force ? "full" : "incremental",
      },
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  }).catch(() => null);

  if (!response || response.status !== 204) {
    const preview = response ? await responsePreview(response) : null;
    return {
      ok: false,
      channel: "github",
      message: "GitHub workflow dispatch did not confirm acceptance.",
      remoteStatus: response?.status ?? null,
      remoteBodyPreview: preview,
    };
  }

  return {
    ok: true,
    channel: "github",
    message: "GitHub workflow dispatch accepted.",
    remoteStatus: response.status,
    remoteBodyPreview: null,
  };
}

async function triggerViaWebhook(options: TriggerRemoteSyncOptions): Promise<TriggerRemoteSyncResult> {
  const webhookUrl = process.env.STRAVA_SYNC_WEBHOOK_URL;
  const webhookToken = process.env.STRAVA_SYNC_WEBHOOK_TOKEN;
  if (!webhookUrl) {
    return {
      ok: false,
      channel: "webhook",
      message: "Sync webhook not configured. Set STRAVA_SYNC_WEBHOOK_URL.",
      remoteStatus: null,
      remoteBodyPreview: null,
    };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
    },
    body: JSON.stringify({
      requestedBy: options.requestedBy ?? null,
      source: options.source,
      mode: options.force ? "full" : "incremental",
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  }).catch(() => null);

  if (!response || !response.ok) {
    const preview = response ? await responsePreview(response) : null;
    return {
      ok: false,
      channel: "webhook",
      message: "Sync webhook did not confirm success.",
      remoteStatus: response?.status ?? null,
      remoteBodyPreview: preview,
    };
  }

  return {
    ok: true,
    channel: "webhook",
    message: "Sync webhook accepted.",
    remoteStatus: response.status,
    remoteBodyPreview: null,
  };
}

export async function triggerRemoteStravaSync(
  options: TriggerRemoteSyncOptions,
): Promise<TriggerRemoteSyncResult> {
  const mode = (process.env.STRAVA_SYNC_TRIGGER_MODE || "auto").toLowerCase();

  if (mode === "github") {
    return triggerViaGithub(options);
  }
  if (mode === "webhook") {
    return triggerViaWebhook(options);
  }

  if (hasGithubConfig()) {
    return triggerViaGithub(options);
  }
  if (hasWebhookConfig()) {
    return triggerViaWebhook(options);
  }

  return {
    ok: false,
    channel: "none",
    message:
      "No sync trigger backend configured. Set GitHub dispatch env vars or STRAVA_SYNC_WEBHOOK_URL.",
    remoteStatus: null,
    remoteBodyPreview: null,
  };
}
