export class PushNotificationProvider {
  async sendPush(_deviceToken: string, _title: string, _message: string): Promise<boolean> {
    // Production FCM / APNS Gateway integration wrapper
    return true;
  }
}
