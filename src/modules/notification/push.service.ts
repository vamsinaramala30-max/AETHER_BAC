import webpush from 'web-push';

export class PushService {
  constructor() {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:support@aether.io',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY,
      );
    }
  }

  async sendPushNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: { title: string; message: string },
    retries = 3,
  ): Promise<boolean> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        attempt++;
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          JSON.stringify(payload),
        );
        return true;
      } catch (error) {
        if (attempt >= retries) {
          console.error(`Push dispatch failed after ${attempt} attempts:`, error);
          return false;
        }
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }
    return false;
  }
}
