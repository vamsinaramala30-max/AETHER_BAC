import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.middleware';

const contactSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  company: z.string().optional(),
  inquiryType: z.enum([
    'General Enquiries',
    'Product Support',
    'Technical Support',
    'Business Partnerships',
    'Feedback',
  ]),
  subject: z.string().min(3, 'Subject is required'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

export const contactRoutes: Router = Router();

contactRoutes.post(
  '/',
  validate(contactSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fullName, email, company, inquiryType, subject, message } = req.body;

      // Log or process contact request securely
      console.log(`[CONTACT INQUIRY] [${inquiryType}] From: ${fullName} <${email}> (${company || 'N/A'}) - Subject: ${subject}`);

      res.status(200).json({
        success: true,
        message: 'Thank you for contacting AETHER. Our team has received your message and will respond shortly.',
        data: {
          receivedAt: new Date().toISOString(),
          referenceId: `ATH-CNT-${Date.now().toString(36).toUpperCase()}`,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
