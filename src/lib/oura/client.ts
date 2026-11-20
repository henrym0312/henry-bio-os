import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { ouraOauthTokens } from '@/db/schema';
import { getEnv } from '@/lib/env';
import {
  OURA_API_BASE,
  OURA_OAUTH_SCOPES,
  OURA_TOKEN_URL,
  OURA_USER_AGENT,
  type OuraPaginatedResponse,
  type OuraTokenResponse,
} from './types';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue: string | null, attempt: number): number {
  if (headerValue) {
    const seconds = Number(headerValue);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return Math.max(seconds * 1000, 1000);
    }
    const parsedDate = Date.parse(headerValue);
    if (!Number.isNaN(parsedDate)) {
      return Math.max(parsedDate - Date.now(), 1000);
    }
  }
  return Math.pow(2, attempt) * 1000;
}

/**
 * Exchanges an OAuth2 authorisation code for access and refresh tokens and persists row id=1.
 */
export async function exchangeOuraAuthCode(
  code: string,
  redirectUri: string,
): Promise<OuraTokenResponse> {
  const env = getEnv();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: env.OURA_CLIENT_ID,
    client_secret: env.OURA_CLIENT_SECRET,
  });

  const response = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': OURA_USER_AGENT,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Oura token exchange failed (${response.status}): ${errorText}`);
  }

  const tokens = (await response.json()) as OuraTokenResponse;
  await persistOuraTokens(tokens);
  return tokens;
}

/**
 * Persists OAuth tokens in the single-row `oura_oauth_tokens` table (id = 1).
 */
export async function persistOuraTokens(tokens: OuraTokenResponse): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + Math.max(tokens.expires_in ?? 86400, 60) * 1000);
  const scopes = tokens.scope ?? OURA_OAUTH_SCOPES.join(' ');
  const now = new Date();

  await db
    .insert(ouraOauthTokens)
    .values({
      id: 1,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scopes,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ouraOauthTokens.id,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scopes,
        updatedAt: now,
      },
    });
}

/**
 * Returns a valid Oura access token.
 * Uses transactional PostgreSQL row-level locking (`FOR UPDATE`) to prevent race conditions
 * on Oura's single-use refresh tokens when concurrent webhooks or requests refresh simultaneously.
 */
export async function getValidAccessToken(forceRefresh = false): Promise<string> {
  const db = getDb();

  if (!forceRefresh) {
    const [existing] = await db
      .select()
      .from(ouraOauthTokens)
      .where(eq(ouraOauthTokens.id, 1))
      .limit(1);

    if (!existing) {
      throw new Error(
        'Oura OAuth tokens are not configured. Visit /api/oura/login to authorise access.',
      );
    }

    if (existing.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
      return existing.accessToken;
    }
  }

  const env = getEnv();

  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(ouraOauthTokens)
      .where(eq(ouraOauthTokens.id, 1))
      .for('update');

    if (!locked) {
      throw new Error(
        'Oura OAuth tokens are not configured. Visit /api/oura/login to authorise access.',
      );
    }

    // Re-check inside the FOR UPDATE lock in case another concurrent request just refreshed it
    if (!forceRefresh && locked.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
      return locked.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: locked.refreshToken,
      client_id: env.OURA_CLIENT_ID,
      client_secret: env.OURA_CLIENT_SECRET,
    });

    const response = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': OURA_USER_AGENT,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Oura token refresh failed (${response.status}): ${errorText}`);
    }

    const refreshed = (await response.json()) as OuraTokenResponse;
    const expiresAt = new Date(
      Date.now() + Math.max(refreshed.expires_in ?? 86400, 60) * 1000,
    );
    const now = new Date();

    await tx
      .update(ouraOauthTokens)
      .set({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? locked.refreshToken,
        expiresAt,
        scopes: refreshed.scope ?? locked.scopes,
        updatedAt: now,
      })
      .where(eq(ouraOauthTokens.id, 1));

    return refreshed.access_token;
  });
}

function buildOuraUrl(
  path: string,
  params?: Record<string, string | undefined | null>,
): string {
  const url = new URL(path.startsWith('http') ? path : `${OURA_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

export class OuraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'OuraApiError';
  }
}

/**
 * Performs an authenticated GET request to Oura Cloud API v2 with:
 * - Mandatory `User-Agent: HenryBioOS/1.0`
 * - Automatic 401 locked token refresh retry
 * - Automatic HTTP 429 Retry-After backoff (up to 3 attempts)
 */
export async function ouraFetch<T = unknown>(
  path: string,
  params?: Record<string, string | undefined | null>,
): Promise<T> {
  const url = buildOuraUrl(path, params);
  let forceRefresh = false;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const accessToken = await getValidAccessToken(forceRefresh);
    forceRefresh = false;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': OURA_USER_AGENT,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (response.status === 429 && attempt < MAX_RETRY_ATTEMPTS) {
      const waitMs = parseRetryAfterMs(response.headers.get('retry-after'), attempt);
      await sleep(waitMs);
      continue;
    }

    if (response.status === 401 && attempt === 1) {
      forceRefresh = true;
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new OuraApiError(
        `Oura API GET ${path} failed (${response.status}): ${text}`,
        response.status,
        text,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error(`Oura API GET ${path} exhausted maximum retry attempts`);
}

/**
 * Fetches all pages of a paginated Oura collection or time-series endpoint,
 * following `next_token` until null/undefined.
 */
export async function ouraFetchPaginated<T = Record<string, unknown>>(
  path: string,
  params?: Record<string, string | undefined | null>,
): Promise<T[]> {
  const allItems: T[] = [];
  let nextToken: string | null | undefined = undefined;

  do {
    const response: OuraPaginatedResponse<T> = await ouraFetch<
      OuraPaginatedResponse<T>
    >(path, {
      ...params,
      next_token: nextToken ?? undefined,
    });

    if (Array.isArray(response.data)) {
      allItems.push(...response.data);
    }

    nextToken = response.next_token ?? null;
  } while (nextToken);

  return allItems;
}

/**
 * Performs an authenticated request to Oura's webhook subscription management endpoints
 * using `x-client-id`, `x-client-secret`, and mandatory `User-Agent: HenryBioOS/1.0`.
 */
export async function ouraWebhookApiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const env = getEnv();
  const url = buildOuraUrl(path);

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method,
      headers: {
        'x-client-id': env.OURA_CLIENT_ID,
        'x-client-secret': env.OURA_CLIENT_SECRET,
        'User-Agent': OURA_USER_AGENT,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    if (response.status === 429 && attempt < MAX_RETRY_ATTEMPTS) {
      const waitMs = parseRetryAfterMs(response.headers.get('retry-after'), attempt);
      await sleep(waitMs);
      continue;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new OuraApiError(
        `Oura Webhook API ${method} ${path} failed (${response.status}): ${text}`,
        response.status,
        text,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error(`Oura Webhook API ${method} ${path} exhausted maximum retry attempts`);
}
