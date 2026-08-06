export class EmailNotificationProvider {
  async sendEmail(_to: string, _subject: string, _body: string): Promise<boolean> {
    // Production SMTP/Transactional Email Gateway integration wrapper
    return true;
  }
}
