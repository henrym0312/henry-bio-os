import { getAppUrl, getEnv } from '@/lib/env';
import { ouraWebhookApiRequest } from './client';
import { recordSyncLog, syncWebhookSubscriptionsToDb } from './sync';
import {
  EXT_API_V2_DATA_TYPES,
  WEBHOOK_OPERATIONS,
  type OuraWebhookSubscription,
} from './types';

export interface WebhookSetupResult {
  callbackUrl: string;
  created: number;
  updated: number;
  unchanged: number;
  totalSubscriptions: number;
  subscriptions: OuraWebhookSubscription[];
}

export async function listOuraWebhooks(): Promise<OuraWebhookSubscription[]> {
  const subs = await ouraWebhookApiRequest<OuraWebhookSubscription[]>(
    'GET',
    '/v2/webhook/subscription',
  );
  await syncWebhookSubscriptionsToDb(subs);
  return subs;
}

/**
 * Registers create, update, and delete subscriptions across all 16 ExtApiV2DataType values.
 */
export async function setupAllOuraWebhooks(): Promise<WebhookSetupResult> {
  const env = getEnv();
  const callbackUrl = `${getAppUrl()}/api/webhooks/oura`;
  const existing = await ouraWebhookApiRequest<OuraWebhookSubscription[]>(
    'GET',
    '/v2/webhook/subscription',
  );

  const byKey = new Map<string, OuraWebhookSubscription>();
  for (const sub of existing) {
    byKey.set(`${sub.data_type}::${sub.event_type}`, sub);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const dataType of EXT_API_V2_DATA_TYPES) {
    for (const eventType of WEBHOOK_OPERATIONS) {
      const key = `${dataType}::${eventType}`;
      const match = byKey.get(key);

      if (!match) {
        await ouraWebhookApiRequest<OuraWebhookSubscription>(
          'POST',
          '/v2/webhook/subscription',
          {
            callback_url: callbackUrl,
            verification_token: env.OURA_WEBHOOK_VERIFICATION_TOKEN,
            event_type: eventType,
            data_type: dataType,
          },
        );
        created++;
      } else if (match.callback_url !== callbackUrl) {
        await ouraWebhookApiRequest<OuraWebhookSubscription>(
          'PUT',
          `/v2/webhook/subscription/${match.id}`,
          {
            callback_url: callbackUrl,
            verification_token: env.OURA_WEBHOOK_VERIFICATION_TOKEN,
            event_type: eventType,
            data_type: dataType,
          },
        );
        updated++;
      } else {
        unchanged++;
      }
    }
  }

  const finalList = await ouraWebhookApiRequest<OuraWebhookSubscription[]>(
    'GET',
    '/v2/webhook/subscription',
  );
  await syncWebhookSubscriptionsToDb(finalList);

  await recordSyncLog({
    source: 'webhook_setup',
    dataType: 'webhook_subscription',
    eventType: 'setup',
    statusCode: 200,
    recordsProcessed: finalList.length,
  });

  return {
    callbackUrl,
    created,
    updated,
    unchanged,
    totalSubscriptions: finalList.length,
    subscriptions: finalList,
  };
}

/**
 * Renews all active Oura webhook subscriptions to prevent expiration.
 */
export async function renewAllOuraWebhooks(): Promise<{
  renewed: number;
  failed: number;
  subscriptions: OuraWebhookSubscription[];
}> {
  const existing = await ouraWebhookApiRequest<OuraWebhookSubscription[]>(
    'GET',
    '/v2/webhook/subscription',
  );

  const renewedSubs: OuraWebhookSubscription[] = [];
  let renewed = 0;
  let failed = 0;

  for (const sub of existing) {
    try {
      const updatedSub = await ouraWebhookApiRequest<OuraWebhookSubscription>(
        'PUT',
        `/v2/webhook/subscription/renew/${sub.id}`,
      );
      renewedSubs.push(updatedSub);
      renewed++;
    } catch {
      renewedSubs.push(sub);
      failed++;
    }
  }

  await syncWebhookSubscriptionsToDb(renewedSubs);
  await recordSyncLog({
    source: 'webhook_renew',
    dataType: 'webhook_subscription',
    eventType: 'renew',
    statusCode: failed > 0 ? 207 : 200,
    recordsProcessed: renewed,
    errorMessage: failed > 0 ? `${failed} subscription renewals failed` : null,
  });

  return {
    renewed,
    failed,
    subscriptions: renewedSubs,
  };
}
