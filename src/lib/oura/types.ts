export const OURA_API_BASE = 'https://api.ouraring.com';
export const OURA_AUTHORIZE_URL = 'https://developer.ouraring.com/authorize';
export const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
export const OURA_USER_AGENT = 'HenryBioOS/1.0';

export const OURA_OAUTH_SCOPES = [
  'email',
  'personal',
  'daily',
  'heartrate',
  'tag',
  'workout',
  'session',
  'spo2',
  'ring_configuration',
  'stress',
  'heart_health',
] as const;

export const EXT_API_V2_DATA_TYPES = [
  'tag',
  'enhanced_tag',
  'workout',
  'session',
  'sleep',
  'daily_sleep',
  'daily_readiness',
  'daily_activity',
  'daily_spo2',
  'sleep_time',
  'rest_mode_period',
  'ring_configuration',
  'daily_stress',
  'daily_cardiovascular_age',
  'daily_resilience',
  'vo2_max',
] as const;

export type ExtApiV2DataType = (typeof EXT_API_V2_DATA_TYPES)[number];

export const WEBHOOK_OPERATIONS = ['create', 'update', 'delete'] as const;
export type WebhookOperation = (typeof WEBHOOK_OPERATIONS)[number];

export const ALL_OURA_ENDPOINTS = [
  'personal_info',
  'ring_configuration',
  'daily_readiness',
  'daily_sleep',
  'sleep',
  'sleep_time',
  'daily_activity',
  'daily_stress',
  'daily_resilience',
  'daily_spo2',
  'daily_cardiovascular_age',
  'vo2_max',
  'workout',
  'session',
  'enhanced_tag',
  'tag',
  'rest_mode_period',
  'heartrate',
  'ring_battery_level',
] as const;

export type OuraEndpointKey = (typeof ALL_OURA_ENDPOINTS)[number];

/**
 * Maps internal/webhook endpoint keys to exact Oura REST v2 path segments.
 * Note `vo2_max` maps to `vO2_max` in Oura's URL specification.
 */
export const OURA_ENDPOINT_PATHS: Record<OuraEndpointKey, string> = {
  personal_info: '/v2/usercollection/personal_info',
  ring_configuration: '/v2/usercollection/ring_configuration',
  daily_readiness: '/v2/usercollection/daily_readiness',
  daily_sleep: '/v2/usercollection/daily_sleep',
  sleep: '/v2/usercollection/sleep',
  sleep_time: '/v2/usercollection/sleep_time',
  daily_activity: '/v2/usercollection/daily_activity',
  daily_stress: '/v2/usercollection/daily_stress',
  daily_resilience: '/v2/usercollection/daily_resilience',
  daily_spo2: '/v2/usercollection/daily_spo2',
  daily_cardiovascular_age: '/v2/usercollection/daily_cardiovascular_age',
  vo2_max: '/v2/usercollection/vO2_max',
  workout: '/v2/usercollection/workout',
  session: '/v2/usercollection/session',
  enhanced_tag: '/v2/usercollection/enhanced_tag',
  tag: '/v2/usercollection/tag',
  rest_mode_period: '/v2/usercollection/rest_mode_period',
  heartrate: '/v2/usercollection/heartrate',
  ring_battery_level: '/v2/usercollection/ring_battery_level',
};

export interface OuraPaginatedResponse<T = Record<string, unknown>> {
  data: T[];
  next_token?: string | null;
}

export interface OuraWebhookEventPayload {
  event_type: WebhookOperation;
  data_type: ExtApiV2DataType;
  object_id: string;
  event_time: string;
  user_id: string;
}

export interface OuraWebhookSubscription {
  id: string;
  callback_url: string;
  event_type: WebhookOperation;
  data_type: ExtApiV2DataType;
  expiration_time: string;
}

export interface OuraTokenResponse {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}
