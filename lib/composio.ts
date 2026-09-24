import { Composio } from "@composio/core";
import { ApiError } from "./api";
export function composio() {
  if (!process.env.COMPOSIO_API_KEY)
    throw new ApiError("Add your Composio API key to connect apps.", 503);
  return new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
}
export const composioUser = (workspace: string, user: string) =>
  `brain:${workspace}:${user}`;
export async function authConfig(provider: "gmail" | "pumble") {
  const id =
    provider === "gmail"
      ? process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID
      : process.env.COMPOSIO_PUMBLE_AUTH_CONFIG_ID;
  if (!id)
    throw new ApiError(
      `Add the ${provider} authentication configuration ID from Composio.`,
      503,
    );
  try {
    const result = await composio().authConfigs.list({
      toolkit: provider,
      search: id,
    });
    const matches = result.items.filter(
      (c) => (c.id === id || c.name === id) && c.toolkit.slug === provider,
    );
    if (matches.length !== 1)
      throw new ApiError(
        `No matching ${provider} auth configuration exists in this Composio project. Create one and use its ac_ ID in the environment.`,
        503,
      );
    return matches[0].id;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      "Composio authentication failed. Check the API key and project auth configurations.",
      502,
    );
  }
}
export class UpstreamError extends ApiError {
  constructor(
    public status: number,
    provider = "Connected app",
  ) {
    super(
      status === 403
        ? `${provider} denied access. Check the connected account’s permissions and channel membership.`
        : status === 401
          ? `${provider} authentication expired. Reconnect this account in Apps.`
          : status === 429
            ? `${provider} rate limit reached. Wait a moment, then resume Sync.`
            : `${provider} returned status ${status}. Try syncing again shortly.`,
      status,
    );
  }
}
export async function proxyRead<T>(
  account: string,
  provider: "gmail" | "pumble",
  path: string,
  parameters: Record<string, string | number> = {},
): Promise<T> {
  const origin =
    provider === "gmail"
      ? "https://gmail.googleapis.com/gmail/v1/users/me"
      : "https://pumble-api-keys.addons.marketplace.cake.com";
  const response = await composio().tools.proxyExecute(
    {
      connectedAccountId: account,
      endpoint: `${origin}${path}`,
      method: "GET",
      parameters: Object.entries(parameters).map(([name, value]) => ({
        name,
        value,
        in: "query" as const,
      })),
    },
    { signal: AbortSignal.timeout(30000) },
  );
  if (response.status >= 400)
    throw new UpstreamError(
      response.status,
      provider === "gmail" ? "Gmail" : "Pumble",
    );
  return response.data as T;
}

export async function revokeConnection(id: string) {
  try {
    await composio().connectedAccounts.delete(id);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return;
    throw new ApiError(
      "The provider could not revoke this connection. Sync is paused; retry disconnection.",
      502,
    );
  }
}
