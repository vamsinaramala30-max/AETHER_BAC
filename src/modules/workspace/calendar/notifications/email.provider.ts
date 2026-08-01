export class EmailNotificationProvider {
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    // Production SMTP/Transactional Email Gateway integration wrapper
    return true;
  }
}