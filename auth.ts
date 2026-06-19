/**
 * Google OAuth 2.0 authentication module for CortexPrism Google Plugin.
 *
 * Handles token refresh and provides authorized fetch functions
 * for all Google API services (Gmail, Calendar, Drive, Docs, Sheets).
 */

import type { PluginContext } from 'cortex/plugins';

/** Valid Google API access token with expiry info */
export interface AccessToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/** Plugin configuration for Google OAuth */
export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes?: string;
}

/** Thrown when OAuth configuration is missing or invalid */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Resolve Google API scopes based on which service is being used.
 * The plugin auto-configures minimal scopes for the requested operation.
 */
export function getRequiredScopes(): string {
  return [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/spreadsheets',
  ].join(' ');
}

/**
 * Retrieve Google OAuth configuration from plugin context.
 * Throws AuthError if config is missing or incomplete.
 */
export function getAuthConfig(ctx: PluginContext): GoogleAuthConfig {
  const google = ctx.config?.get<Record<string, unknown>>?.('google');
  if (!google) {
    throw new AuthError(
      'Google OAuth not configured. Set "google.clientId", "google.clientSecret", and "google.refreshToken" in plugin config.',
    );
  }

  const clientId = google.clientId as string | undefined;
  const clientSecret = google.clientSecret as string | undefined;
  const refreshToken = google.refreshToken as string | undefined;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new AuthError(
      'Incomplete Google OAuth configuration. Required: clientId, clientSecret, refreshToken.',
    );
  }

  return { clientId, clientSecret, refreshToken };
}

/**
 * Obtain a fresh access token using the stored refresh token.
 * Uses OAuth 2.0 refresh flow. Tokens are not cached here because
 * each request is independent; the Google API token endpoint rate-limits
 * are generous enough for agent usage patterns.
 */
export async function getAccessToken(config: GoogleAuthConfig): Promise<AccessToken> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      let detail = '';
      try {
        const parsed = JSON.parse(errorBody);
        detail = parsed.error_description || parsed.error || errorBody;
      } catch {
        detail = errorBody;
      }
      throw new AuthError(`Token refresh failed (${response.status}): ${detail}`);
    }

    return await response.json() as AccessToken;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof AuthError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AuthError('Token refresh request timed out (10 seconds)');
    }
    throw new AuthError(
      `Failed to obtain access token: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Make an authorized fetch request to a Google API endpoint.
 * Automatically handles token refresh and sets the Authorization header.
 *
 * @param url - Full Google API URL
 * @param options - Fetch options (method, headers, body, etc.)
 * @param ctx - Plugin context for config lookup
 * @returns Response object (caller should check ok/status)
 */
export async function googleFetch(
  url: string,
  options: RequestInit,
  ctx: PluginContext,
): Promise<Response> {
  const config = getAuthConfig(ctx);
  const token = await getAccessToken(config);

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token.access_token}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AuthError('Google API request timed out (15 seconds)');
    }
    throw err;
  }
}

/**
 * Compute duration helper.
 */
export function computeDuration(start: number): number {
  return Date.now() - start;
}
