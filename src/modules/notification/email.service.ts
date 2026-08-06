let Resend: any;
try {
  Resend = require('resend').Resend;
} catch {
  // Stub: resend package not installed
  Resend = class ResendStub {
    constructor(_apiKey: string) {}
    emails = {
      send: async () => ({ error: null }),
    };
  };
}

export class EmailService {
  private resend: InstanceType<typeof Resend>;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');
  }

  async sendEmail(to: string, subject: string, body: string, retries = 3): Promise<boolean> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        attempt++;
        const response = await this.resend.emails.send({
          from: process.env.SENDER_EMAIL || 'no-reply@aether.io',
          to,
          subject,
          html: `<div style="font-family: sans-serif; padding: 20px;"><h2>${subject}</h2><p>${body}</p></div>`,
        });
        if (response.error) {
          throw new Error(response.error.message);
        }
        return true;
      } catch (error) {
        if (attempt >= retries) {
          console.error(`Email dispatch failed after ${attempt} attempts:`, error);
          return false;
        }
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }
    return false;
  }
}
