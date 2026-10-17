import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
import { optionalAuthenticate } from '../middleware/auth.middleware';
import { db } from '../database/client';
import { emailService } from '../modules/notification/email.service';
import { strictRateLimiter } from '../middleware/rateLimit.middleware';
import { logger } from '../config';

const contactSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(100, 'Full name is too long'),
  email: z.string().email('Invalid email address'),
  company: z.string().optional(),
  category: z
    .enum([
      'General',
      'Bug',
      'Feature Request',
      'Feedback',
      'Account',
      'Security',
      'Other',
      'General Enquiries',
      'Product Support',
      'Technical Support',
      'Business Partnerships',
      'Feature not working as described',
      'Misleading or inaccurate claim',
      'Privacy or data-handling concern',
      'Billing or subscription issue',
      'AI response or accuracy issue',
      'Accessibility issue',
      'Other concern',
    ])
    .default('General'),
  subject: z
    .string()
    .min(3, 'Subject must be at least 3 characters')
    .max(150, 'Subject is too long'),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(5000, 'Message is too long'),
});

const complaintSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(100, 'Full name is too long'),
  email: z.string().email('Invalid email address'),
  category: z.enum([
    'Feature not working as described',
    'Misleading or inaccurate claim',
    'Privacy or data-handling concern',
    'Billing or subscription issue',
    'AI response or accuracy issue',
    'Accessibility issue',
    'Other concern',
  ]),
  affectedFeatureOrPage: z
    .string()
    .min(2, 'Affected feature or page is required')
    .max(200, 'Feature or page identifier is too long'),
  inaccurateClaim: z
    .string()
    .max(2000, 'Claim representation is too long')
    .optional()
    .default(''),
  expectedOutcome: z
    .string()
    .max(2000, 'Expected outcome is too long')
    .optional()
    .default(''),
  actualOutcome: z
    .string()
    .max(2000, 'Actual outcome is too long')
    .optional()
    .default(''),
  description: z
    .string()
    .min(10, 'Detailed explanation must be at least 10 characters')
    .max(5000, 'Explanation is too long'),
});

export const contactRoutes: Router = Router();

/**
 * POST /api/v1/contact
 * POST /api/v1/feedback
 */
contactRoutes.post(
  '/',
  strictRateLimiter,
  optionalAuthenticate,
  validate(contactSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fullName, email, company, category, subject, message } = req.body;
      const authenticatedUserId = (req as any).user?.id || null;

      const adminEmail = process.env.CONTACT_EMAIL || 'vkgroups127@gmail.com';
      const refId = `ATH-CNT-${Date.now().toString(36).toUpperCase()}`;

      // Save submission into Feedback database table
      const feedbackRecord = await db.feedback.create({
        data: {
          userId: authenticatedUserId,
          name: fullName,
          email: email.toLowerCase().trim(),
          category: category || 'General',
          subject: subject.trim(),
          message: company ? `[Company: ${company}]\n\n${message.trim()}` : message.trim(),
          status: 'NEW',
        },
      });

      logger.info(
        `[CONTACT/FEEDBACK SUBMISSION] Ref: ${refId} | ID: ${feedbackRecord.id} | From: ${fullName} <${email}>`,
      );

      // Dispatch notification email to admin (vkgroups127@gmail.com)
      emailService
        .sendContactMessageEmail(adminEmail, fullName, email, category, subject, message)
        .catch((err) => logger.error('Failed to dispatch admin contact email:', err));

      // Dispatch confirmation receipt email to user
      emailService
        .sendContactConfirmationEmail(email, fullName, subject)
        .catch((err) => logger.error('Failed to dispatch user contact confirmation email:', err));

      res.status(200).json({
        success: true,
        message: 'Your message has been sent successfully. Our team will get back to you shortly.',
        data: {
          id: feedbackRecord.id,
          referenceId: refId,
          receivedAt: feedbackRecord.createdAt,
        },
      });
    } catch (err) {
      logger.error('Contact form submission failed:', err);
      next(err);
    }
  },
);

/**
 * POST /api/v1/contact/complaint
 * POST /api/v1/feedback/complaint
 * POST /api/v1/complaint
 */
contactRoutes.post(
  '/complaint',
  strictRateLimiter,
  optionalAuthenticate,
  validate(complaintSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        fullName,
        email,
        category,
        affectedFeatureOrPage,
        inaccurateClaim,
        expectedOutcome,
        actualOutcome,
        description,
      } = req.body;
      const authenticatedUserId = (req as any).user?.id || null;

      const adminEmail = process.env.CONTACT_EMAIL || 'vkgroups127@gmail.com';
      const refId = `ATH-CMP-${Date.now().toString(36).toUpperCase()}`;

      // Construct clean, tamper-evident audit message containing all complaint fields
      const formattedMessage = [
        `=== AETHER FORMAL USER COMPLAINT RECORD ===`,
        `[REFERENCE ID]: ${refId}`,
        `[CATEGORY]: ${category}`,
        `[AFFECTED PAGE OR FEATURE]: ${affectedFeatureOrPage}`,
        inaccurateClaim?.trim() ? `[ALLEGED INACCURATE CLAIM / REPRESENTATION]:\n${inaccurateClaim.trim()}` : null,
        expectedOutcome?.trim() ? `[EXPECTED OUTCOME]:\n${expectedOutcome.trim()}` : null,
        actualOutcome?.trim() ? `[ACTUAL OUTCOME]:\n${actualOutcome.trim()}` : null,
        `[INCIDENT DETAILS / WHAT HAPPENED]:\n${description.trim()}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const subjectLine = `[COMPLAINT] ${category}: ${affectedFeatureOrPage}`.slice(0, 150);

      // Persist to PostgreSQL via Prisma
      const feedbackRecord = await db.feedback.create({
        data: {
          userId: authenticatedUserId,
          name: fullName.trim(),
          email: email.toLowerCase().trim(),
          category: `Complaint: ${category}`,
          subject: subjectLine,
          message: formattedMessage,
          status: 'NEW',
        },
      });

      logger.info(
        `[FORMAL COMPLAINT LOGGED] Ref: ${refId} | ID: ${feedbackRecord.id} | Cat: ${category} | From: ${fullName} <${email}>`,
      );

      // Dispatch admin notification
      emailService
        .sendContactMessageEmail(adminEmail, fullName, email, `Complaint - ${category}`, subjectLine, formattedMessage)
        .catch((err) => logger.error('Failed to dispatch admin complaint notification email:', err));

      // Dispatch confirmation receipt to user
      emailService
        .sendContactConfirmationEmail(email, fullName, `Complaint Logged - Reference: ${refId}`)
        .catch((err) => logger.error('Failed to dispatch user complaint receipt email:', err));

      res.status(200).json({
        success: true,
        message: 'Your complaint has been formally logged in our resolution queue.',
        data: {
          id: feedbackRecord.id,
          referenceId: refId,
          receivedAt: feedbackRecord.createdAt,
          status: 'RECEIVED',
          category,
          affectedFeatureOrPage,
          nextSteps: `Your report has been logged under Reference ID ${refId}. Our team will investigate the issue and verify feature behavior against product documentation.`,
          escalationInfo:
            'If this issue involves privacy, security, or statutory consumer protection concerns, you may request formal escalation by contacting support at vkgroups127@gmail.com with your Reference ID.',
        },
      });
    } catch (err) {
      logger.error('Formal complaint submission failed:', err);
      next(err);
    }
  },
);

// Mount aliases
contactRoutes.post(
  '/feedback',
  strictRateLimiter,
  optionalAuthenticate,
  validate(contactSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    req.url = '/';
    contactRoutes(req, res, next);
  },
);

contactRoutes.post(
  '/complaints',
  strictRateLimiter,
  optionalAuthenticate,
  validate(complaintSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    req.url = '/complaint';
    contactRoutes(req, res, next);
  },
);

