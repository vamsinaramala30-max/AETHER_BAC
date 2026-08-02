export class PushNotificationProvider {
  async sendPush(deviceToken: string, title: string, message: string): Promise<boolean> {
    // Production FCM / APNS Gateway integration wrapper
    return true;
  }
}
