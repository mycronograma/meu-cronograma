import webpush from 'web-push';
import { env, hasWebPush } from '@/lib/env';

let isConfigured = false;

const ensureWebPushConfigured = () => {
  if (!hasWebPush) {
    throw new Error('Web push is not configured.');
  }

  if (isConfigured) return;

  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  isConfigured = true;
};

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export const sendWebPushNotification = async ({
  subscription,
  payload,
}: {
  subscription: PushSubscriptionPayload;
  payload: WebPushNotificationPayload;
}) => {
  ensureWebPushConfigured();
  await webpush.sendNotification(subscription, JSON.stringify(payload));
};
