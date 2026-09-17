import { env, logger } from '../../config';

export interface EmailSendOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface EmailHealthStatus {
  configured: boolean;
  missingApiKey: boolean;
  providerReachable: boolean;
  senderConfigured: boolean;
  sender: string;
}

export class EmailService {
  private apiKey: string;
  private defaultSender: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY?.trim() || (env as any).RESEND_API_KEY?.trim() || '';

    // Default to onboarding@resend.dev if EMAIL_FROM is empty or non-resend unverified domain in dev
    const envSender = process.env.EMAIL_FROM?.trim() || (env as any).EMAIL_FROM?.trim();
    if (envSender && envSender.includes('@') && !envSender.endsWith('@gmail.com')) {
      this.defaultSender = envSender;
    } else {
      this.defaultSender = 'AETHER Platform <onboarding@resend.dev>';
    }
  }

  /**
   * Diagnostic health check for email configuration
   */
  public async checkHealth(): Promise<EmailHealthStatus> {
    const missingApiKey = !this.apiKey || this.apiKey.startsWith('re_dummy');
    const senderConfigured = Boolean(this.defaultSender);
    let providerReachable = false;

    if (!missingApiKey) {
      try {
        const response = await fetch('https://api.resend.com/domains', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        });
        providerReachable = response.ok || response.status === 401 || response.status === 200;
      } catch (error) {
        logger.warn('Resend provider reachability check failed:', error);
        providerReachable = false;
      }
    }

    return {
      configured: !missingApiKey && senderConfigured,
      missingApiKey,
      providerReachable,
      senderConfigured,
      sender: this.defaultSender,
    };
  }

  /**
   * Core email sending method using Resend REST API
   */
  public async sendEmail(options: EmailSendOptions, retries = 2): Promise<EmailSendResult> {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    if (!this.apiKey || this.apiKey.startsWith('re_dummy')) {
      logger.warn(
        `Email dispatch skipped (No valid RESEND_API_KEY). Target: ${recipients.join(', ')}`,
      );
      return {
        success: false,
        error: 'Email service API key is not configured.',
      };
    }

    let attempt = 0;
    let lastError = 'Unknown email dispatch error';

    while (attempt <= retries) {
      attempt++;
      try {
        const payload: Record<string, any> = {
          from: this.defaultSender,
          to: recipients,
          subject: options.subject,
          html: options.html,
        };

        if (options.text) {
          payload.text = options.text;
        }

        if (options.replyTo) {
          payload.reply_to = options.replyTo;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseData: any = await response.json().catch(() => ({}));

        if (response.ok && responseData?.id) {
          logger.info(
            `Email successfully dispatched via Resend [ID: ${responseData.id}] to ${recipients.join(', ')}`,
          );
          return {
            success: true,
            id: responseData.id,
          };
        }

        const errorMsg =
          responseData?.message ||
          responseData?.error ||
          `HTTP ${response.status} ${response.statusText}`;
        lastError = `Resend API Error: ${errorMsg}`;
        logger.warn(`Resend dispatch attempt ${attempt} failed: ${lastError}`);
      } catch (error: any) {
        lastError =
          error?.name === 'AbortError'
            ? 'Email request timed out after 10s'
            : error?.message || String(error);
        logger.warn(`Resend dispatch attempt ${attempt} threw exception: ${lastError}`);
      }

      if (attempt <= retries) {
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }

    return {
      success: false,
      error: lastError,
    };
  }

  /**
   * Send notification email
   */
  public async sendNotificationEmail(
    to: string,
    title: string,
    message: string,
    link?: string,
  ): Promise<EmailSendResult> {
    const html = this.getTemplateWrapper(
      title,
      `
      <div style="background-color: #1e293b; border-radius: 12px; padding: 24px; border: 1px solid #334155; margin-bottom: 24px;">
        <h3 style="color: #f8fafc; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 12px;">${title}</h3>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;">${message}</p>
      </div>
      ${
        link
          ? `<div style="text-align: center; margin-top: 24px;">
              <a href="${link}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 10px; font-weight: 600; text-decoration: none; display: inline-block; font-size: 14px;">View Details in AETHER</a>
            </div>`
          : ''
      }
      `,
    );

    return this.sendEmail({ to, subject: `AETHER Notification: ${title}`, html });
  }

  /**
   * Send security alert email
   */
  public async sendSecurityEmail(
    to: string,
    title: string,
    details: string,
  ): Promise<EmailSendResult> {
    const html = this.getTemplateWrapper(
      'Security Alert',
      `
      <div style="background-color: #450a0a; border-radius: 12px; padding: 24px; border: 1px solid #991b1b; margin-bottom: 24px;">
        <h3 style="color: #fca5a5; font-size: 18px; font-weight: 700; margin-top: 0; margin-bottom: 12px;">⚠️ ${title}</h3>
        <p style="color: #fecdd3; font-size: 14px; line-height: 1.6; margin: 0;">${details}</p>
      </div>
      <p style="color: #94a3b8; font-size: 13px;">If you did not initiate this action, please secure your account immediately by changing your password.</p>
      `,
    );

    return this.sendEmail({
      to,
      subject: `[Security Alert] AETHER Account Action: ${title}`,
      html,
    });
  }

  /**
   * Send verification email
   */
  public async sendVerificationEmail(
    to: string,
    name: string,
    verifyLink: string,
  ): Promise<EmailSendResult> {
    const html = this.getTemplateWrapper(
      'Verify Your Email',
      `
      <p style="color: #cbd5e1; font-size: 15px;">Hello ${name},</p>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Please confirm your email address to complete your AETHER account verification.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verifyLink}" style="background-color: #6366f1; color: #ffffff; padding: 14px 32px; border-radius: 10px; font-weight: 700; text-decoration: none; display: inline-block; font-size: 15px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">Verify Email Address</a>
      </div>
      <p style="color: #64748b; font-size: 12px;">If you did not request email verification, you can safely ignore this message.</p>
      `,
    );

    return this.sendEmail({ to, subject: 'Verify your email address for AETHER', html });
  }

  /**
   * Send password changed confirmation email
   */
  public async sendPasswordChangedEmail(
    to: string,
    name: string,
    time: string,
    ipAddress?: string,
  ): Promise<EmailSendResult> {
    const html = this.getTemplateWrapper(
      'Password Updated',
      `
      <p style="color: #cbd5e1; font-size: 15px;">Hello ${name},</p>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Your AETHER account password was successfully changed on <strong>${time}</strong>${ipAddress ? ` from IP address <code>${ipAddress}</code>` : ''}.</p>
      <p style="color: #f87171; font-size: 13px; margin-top: 20px;">If you did not make this change, please contact support immediately at vkgroups127@gmail.com.</p>
      `,
    );

    return this.sendEmail({ to, subject: 'Your AETHER Password Has Been Updated', html });
  }

  /**
   * Send login alert email
   */
  public async sendLoginAlertEmail(
    to: string,
    name: string,
    device: string,
    ipAddress: string,
    time: string,
  ): Promise<EmailSendResult> {
    const html = this.getTemplateWrapper(
      'New Login Detected',
      `
      <p style="color: #cbd5e1; font-size: 15px;">Hello ${name},</p>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">A new login to your AETHER account was detected:</p>
      <ul style="color: #cbd5e1; font-size: 13px; line-height: 1.8; padding-left: 20px;">
        <li><strong>Device:</strong> ${device}</li>
        <li><strong>IP Address:</strong> ${ipAddress}</li>
        <li><strong>Timestamp:</strong> ${time}</li>
      </ul>
      `,
    );

    return this.sendEmail({ to, subject: 'New Login Alert - AETHER', html });
  }

  /**
   * Send contact message email to AETHER admin
   */
  public async sendContactMessageEmail(
    adminEmail: string,
    senderName: string,
    senderEmail: string,
    category: string,
    subject: string,
    message: string,
  ): Promise<EmailSendResult> {
    const html = this.getTemplateWrapper(
      'New Support / Feedback Submission',
      `
      <div style="background-color: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin-bottom: 20px;">
        <p style="color: #94a3b8; font-size: 12px; margin-top: 0;">Category: <strong style="color: #818cf8;">${category}</strong></p>
        <p style="color: #f8fafc; font-size: 15px; font-weight: 700; margin-bottom: 8px;">From: ${senderName} &lt;${senderEmail}&gt;</p>
        <p style="color: #e2e8f0; font-size: 14px; font-weight: 600;">Subject: ${subject}</p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 16px 0;" />
        <div style="color: #cbd5e1; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</div>
      </div>
      `,
      'AETHER Support Center',
    );

    return this.sendEmail({
      to: adminEmail,
      subject: `[AETHER Contact] [${category}] ${subject}`,
      html,
      replyTo: senderEmail,
    });
  }

  /**
   * Send confirmation receipt to user after contact submission
   */
  public async sendContactConfirmationEmail(
    to: string,
    name: string,
    subject: string,
  ): Promise<EmailSendResult> {
    const html = this.getTemplateWrapper(
      'Message Received',
      `
      <p style="color: #cbd5e1; font-size: 15px;">Hello ${name},</p>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Thank you for contacting AETHER support. We have received your inquiry regarding <strong>"${subject}"</strong>.</p>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">Our support team is reviewing your message and will respond shortly.</p>
      `,
    );

    return this.sendEmail({ to, subject: 'We received your message - AETHER Support', html });
  }

  /**
   * Shared HTML Wrapper matching AETHER dark/indigo design language
   */
  private getTemplateWrapper(
    heading: string,
    bodyContent: string,
    footerTitle = 'AETHER OS',
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${heading}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 12px; padding: 10px 18px; color: #ffffff; font-weight: 800; font-size: 20px; letter-spacing: -0.5px;">
                AETHER
              </div>
            </div>
            
            <!-- Card Body -->
            <div style="background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; padding: 32px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);">
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin-top: 0; margin-bottom: 24px; border-bottom: 1px solid #1e293b; pb: 16px;">${heading}</h1>
              ${bodyContent}
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; margin-top: 32px; color: #64748b; font-size: 12px;">
              <p style="margin: 4px 0;">© ${new Date().getFullYear()} ${footerTitle}. All rights reserved.</p>
              <p style="margin: 4px 0;">Primary Support: vkgroups127@gmail.com | WhatsApp: +91 9390223123</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();
