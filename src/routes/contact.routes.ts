import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';
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

export const contactRoutes: Router = Router();

/**
 * POST /api/v1/contact
 * POST /api/v1/feedback
 */
contactRoutes.post(
  '/',
  strictRateLimiter,
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
          message: message.trim(),
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

// Also mount POST /feedback endpoint on router
contactRoutes.post(
  '/feedback',
  strictRateLimiter,
  validate(contactSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    req.url = '/';
    contactRoutes(req, res, next);
  },
);
