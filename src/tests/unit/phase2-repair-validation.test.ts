import { describe, it, expect, vi, beforeEach } from 'vitest';
import { contactRoutes } from '../../routes/contact.routes';
import { notificationRoutes } from '../../routes/notification.routes';
import { checkTaskReminders, dispatchWeeklyDigest } from '../../modules/notification/notification.scheduler';
import { db } from '../../database/client';

// Mock DB
vi.mock('../../database/client', () => ({
  db: {
    feedback: {
      create: vi.fn().mockResolvedValue({
        id: 'mock-feedback-id',
        createdAt: new Date().toISOString(),
      }),
    },
    task: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    project: {
      count: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

// Mock Email Service
vi.mock('../../modules/notification/email.service', () => {
  class EmailService {
    sendContactMessageEmail = vi.fn().mockResolvedValue({ success: true });
    sendContactConfirmationEmail = vi.fn().mockResolvedValue({ success: true });
    sendNotificationEmail = vi.fn().mockResolvedValue({ success: true });
  }
  return {
    EmailService,
    emailService: new EmailService(),
  };
});

function createMockResponse() {
  const res: any = {};
  res.statusCode = 200;
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((payload: any) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe('Phase 2 Repair Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Problem 1 & 2: Contact Form & Complaint Route Mounting', () => {
    it('contactRoutes mounts root POST, /complaint, and /complaints endpoints', () => {
      const paths = contactRoutes.stack
        .filter((l: any) => l.route)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      expect(paths.some((p) => p.path === '/' && p.methods.includes('post'))).toBe(true);
      expect(paths.some((p) => p.path === '/complaint' && p.methods.includes('post'))).toBe(true);
      expect(paths.some((p) => p.path === '/complaints' && p.methods.includes('post'))).toBe(true);
    });

    it('successfully processes valid contact submission handler and creates feedback record', async () => {
      const rootLayer: any = contactRoutes.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
      expect(rootLayer).toBeDefined();

      const handler = rootLayer.route.stack[rootLayer.route.stack.length - 1].handle;

      const req: any = {
        baseUrl: '/api/v1/contact',
        body: {
          fullName: 'Alice Developer',
          email: 'alice@aether.ai',
          category: 'General',
          subject: 'Inquiry regarding API access',
          message: 'Hello, how can we integrate our custom webhooks into AETHER workflows?',
        },
        headers: {},
      };
      const res = createMockResponse();
      const next = vi.fn();

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.referenceId).toMatch(/^ATH-CNT-/);
      expect(db.feedback.create).toHaveBeenCalled();
    });

    it('blocks rapid duplicate contact submissions with 429 status', async () => {
      const rootLayer: any = contactRoutes.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
      const handler = rootLayer.route.stack[rootLayer.route.stack.length - 1].handle;

      const req: any = {
        baseUrl: '/api/v1/contact',
        body: {
          fullName: 'Alice Developer',
          email: 'alice-dup@aether.ai',
          category: 'General',
          subject: 'Duplicate Test',
          message: 'Testing that identical submissions are rejected.',
        },
        headers: {},
      };
      const res1 = createMockResponse();
      await handler(req, res1, vi.fn());
      expect(res1.status).toHaveBeenCalledWith(200);

      const res2 = createMockResponse();
      await handler(req, res2, vi.fn());
      expect(res2.status).toHaveBeenCalledWith(429);
      expect(res2.body.error).toContain('identical content');
    });

    it('successfully processes valid complaint submission and creates audit record', async () => {
      const complaintLayer: any = contactRoutes.stack.find((l: any) => l.route?.path === '/complaint' && l.route.methods.post);
      expect(complaintLayer).toBeDefined();

      const handler = complaintLayer.route.stack[complaintLayer.route.stack.length - 1].handle;

      const req: any = {
        baseUrl: '/api/v1/complaint',
        body: {
          fullName: 'Bob Smith',
          email: 'bob@aether.ai',
          category: 'Feature not working as described',
          affectedFeatureOrPage: 'Calendar Weekly Planner',
          inaccurateClaim: 'Sync was represented as instantaneous',
          expectedOutcome: 'Events render immediately without refresh',
          actualOutcome: 'Event required page reload',
          description: 'Calendar events do not update in real-time until window reload occurs.',
        },
        headers: {},
      };
      const res = createMockResponse();
      const next = vi.fn();

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.referenceId).toMatch(/^ATH-CMP-/);
      expect(res.body.data.status).toBe('RECEIVED');
      expect(db.feedback.create).toHaveBeenCalled();
    });
  });

  describe('Problem 4 & 5: Push Notification Endpoints', () => {
    it('notificationRoutes mounts GET /vapid-public-key and POST /subscribe', () => {
      const paths = notificationRoutes.stack
        .filter((l: any) => l.route)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      expect(paths.some((p) => p.path === '/vapid-public-key' && p.methods.includes('get'))).toBe(true);
      expect(paths.some((p) => p.path === '/subscribe' && p.methods.includes('post'))).toBe(true);
    });

    it('returns public VAPID key from /vapid-public-key route handler', () => {
      const vapidLayer: any = notificationRoutes.stack.find((l: any) => l.route?.path === '/vapid-public-key');
      const handler = vapidLayer.route.stack[vapidLayer.route.stack.length - 1].handle;

      const req: any = {};
      const res = createMockResponse();

      handler(req, res, vi.fn());

      expect(res.body.success).toBe(true);
      expect(typeof res.body.publicKey).toBe('string');
      expect(res.body.publicKey.length).toBeGreaterThan(10);
    });
  });

  describe('Problem 3: Task Reminder Scheduler Logic', () => {
    it('dispatches task due reminders for tasks due within 24h when not previously reminded', async () => {
      const mockService = {
        createNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      } as any;

      const dueDate = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

      (db.task.findMany as any).mockResolvedValue([
        {
          id: 'task-101',
          projectId: 'proj-1',
          title: 'Implement Auth Refresh',
          dueDate,
          assigneeId: 'user-1',
          creatorId: 'user-1',
          project: { name: 'AETHER Phase 2' },
        },
      ]);

      (db.notification.findFirst as any).mockResolvedValue(null); // No prior reminder sent

      const dispatched = await checkTaskReminders(mockService);
      expect(dispatched).toBe(1);
      expect(mockService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'TASK',
          title: expect.stringContaining('Task Due Soon'),
        }),
      );
    });

    it('skips task reminder if reminder was already dispatched in the last 24h', async () => {
      const mockService = {
        createNotification: vi.fn(),
      } as any;

      const dueDate = new Date(Date.now() + 2 * 60 * 60 * 1000);

      (db.task.findMany as any).mockResolvedValue([
        {
          id: 'task-102',
          projectId: 'proj-1',
          title: 'Already Reminded Task',
          dueDate,
          assigneeId: 'user-1',
          creatorId: 'user-1',
          project: { name: 'AETHER Phase 2' },
        },
      ]);

      (db.notification.findFirst as any).mockResolvedValue({ id: 'existing-notif' });

      const dispatched = await checkTaskReminders(mockService);
      expect(dispatched).toBe(0);
      expect(mockService.createNotification).not.toHaveBeenCalled();
    });

    it('dispatches weekly productivity digest to active users with pending work', async () => {
      const mockService = {
        createNotification: vi.fn().mockResolvedValue({ id: 'notif-digest' }),
      } as any;

      (db.user.findMany as any).mockResolvedValue([
        { id: 'user-alpha', email: 'alpha@aether.ai', fullName: 'Alpha User' },
      ]);
      (db.task.count as any).mockResolvedValue(4);
      (db.project.count as any).mockResolvedValue(2);

      const count = await dispatchWeeklyDigest(mockService);
      expect(count).toBe(1);
      expect(mockService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-alpha',
          title: 'Weekly Productivity Digest',
          type: 'SYSTEM',
        }),
      );
    });
  });
});
