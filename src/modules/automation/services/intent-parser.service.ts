import { logger } from '../../../config';

export interface ParsedAutomationPreview {
  supported: boolean;
  unsupportedReason?: string;
  name?: string;
  description?: string;
  trigger?: string;
  schedule?: string | null;
  conditions?: Record<string, any> | null;
  actions?: Array<{ type: string; params?: Record<string, any> }>;
  targetData?: string;
  expectedResult?: string;
  requiredPermissions?: string[];
  steps?: string[];
}

export class AutomationIntentParserService {
  public parsePrompt(prompt: string): ParsedAutomationPreview {
    if (!prompt || !prompt.trim()) {
      return {
        supported: false,
        unsupportedReason:
          'Please enter a valid prompt describing what you would like to automate.',
      };
    }

    const lower = prompt.toLowerCase().trim();

    // 1. Task Completion Requests
    // e.g. "Complete all my tasks and make them done", "Mark all tasks done", "Complete pending tasks"
    if (
      (lower.includes('complete') || lower.includes('finish') || lower.includes('mark')) &&
      (lower.includes('task') || lower.includes('tasks')) &&
      (lower.includes('all') ||
        lower.includes('done') ||
        lower.includes('pending') ||
        lower.includes('incomplete'))
    ) {
      return {
        supported: true,
        name: 'Complete Pending Tasks',
        description: prompt,
        trigger: 'MANUAL',
        schedule: null,
        conditions: null,
        actions: [
          {
            type: 'TASK_COMPLETE_ALL',
            params: { target: 'all_incomplete' },
          },
        ],
        targetData: 'Incomplete tasks assigned to or created by user',
        expectedResult:
          'Find incomplete tasks, verify ownership, and update their status to Done in the database',
        requiredPermissions: ['Task Read', 'Task Write', 'Activity Log Write'],
        steps: [
          "Find user's incomplete tasks",
          'Validate task ownership',
          'Mark eligible tasks as completed',
          'Record activity',
          'Update task/dashboard data',
        ],
      };
    }

    // 2. Scheduled Task Summary
    // e.g. "Every morning summarize my tasks", "Daily task summary"
    if (
      (lower.includes('summarize') || lower.includes('summary') || lower.includes('digest')) &&
      (lower.includes('task') || lower.includes('tasks'))
    ) {
      const isMorning =
        lower.includes('morning') ||
        lower.includes('daily') ||
        lower.includes('8am') ||
        lower.includes('8:00');
      const cronSchedule = isMorning ? '0 8 * * 1-5' : '0 17 * * 1-5';
      const scheduleLabel = isMorning ? 'Every weekday at 8:00 AM' : 'Every weekday at 5:00 PM';

      return {
        supported: true,
        name: 'Daily Task Summary Digest',
        description: prompt,
        trigger: 'SCHEDULE',
        schedule: cronSchedule,
        conditions: null,
        actions: [
          { type: 'TASK_SUMMARIZE', params: { scope: 'my_tasks' } },
          { type: 'NOTIFICATION_CREATE', params: { title: 'Daily Task Summary Digest' } },
        ],
        targetData: 'Pending workspace tasks and deadlines',
        expectedResult: `Synthesize task progress and send notification digest (${scheduleLabel})`,
        requiredPermissions: ['Task Read', 'Notification Write'],
        steps: [
          `Trigger scheduled job (${scheduleLabel})`,
          'Fetch daily pending tasks and deadlines',
          'Generate AI task summary digest',
          'Deliver summary notification to user',
        ],
      };
    }

    // 3. Calendar Summary Automation
    // e.g. "Every morning summarize my calendar", "Calendar summary"
    if (
      (lower.includes('summarize') ||
        lower.includes('summary') ||
        lower.includes('briefing') ||
        lower.includes('review')) &&
      (lower.includes('calendar') || lower.includes('meeting') || lower.includes('schedule'))
    ) {
      return {
        supported: true,
        name: 'Daily Calendar Briefing',
        description: prompt,
        trigger: 'SCHEDULE',
        schedule: '0 8 * * 1-5',
        conditions: null,
        actions: [
          { type: 'CALENDAR_SUMMARIZE', params: { scope: 'today' } },
          { type: 'NOTIFICATION_CREATE', params: { title: 'Daily Calendar Agenda Briefing' } },
        ],
        targetData: 'User calendar events scheduled for today',
        expectedResult:
          "Fetch today's scheduled meetings, synthesize agenda summary, and notify user at 8:00 AM",
        requiredPermissions: ['Calendar Read', 'Notification Write'],
        steps: [
          'Trigger scheduled job (Every weekday at 8:00 AM)',
          'Fetch calendar events scheduled for today',
          'Synthesize daily agenda summary',
          'Deliver morning briefing notification',
        ],
      };
    }

    // 4. Task Overdue Notification
    // e.g. "When a task becomes overdue, notify me"
    if (
      (lower.includes('overdue') || lower.includes('deadline')) &&
      (lower.includes('notify') || lower.includes('alert') || lower.includes('remind'))
    ) {
      return {
        supported: true,
        name: 'Overdue Task Sentinel Alert',
        description: prompt,
        trigger: 'TASK_OVERDUE',
        schedule: null,
        conditions: { field: 'status', operator: 'not_equals', value: 'DONE' },
        actions: [{ type: 'NOTIFICATION_CREATE', params: { title: 'Overdue Task Alert' } }],
        targetData: 'Tasks passing due date without completion',
        expectedResult:
          'Send notification alert immediately when any assigned task becomes overdue',
        requiredPermissions: ['Task Read', 'Notification Write'],
        steps: [
          'Monitor task deadline timestamps',
          'Detect task overdue condition',
          'Verify task remains incomplete',
          'Format and send notification alert',
        ],
      };
    }

    // 5. File Upload / PDF to Knowledge
    // e.g. "When I upload a PDF, add it to Knowledge", "Upload file add knowledge"
    if (
      (lower.includes('upload') || lower.includes('file') || lower.includes('pdf')) &&
      (lower.includes('knowledge') || lower.includes('index') || lower.includes('document'))
    ) {
      return {
        supported: true,
        name: 'PDF Knowledge Base Indexer',
        description: prompt,
        trigger: 'FILE_UPLOADED',
        schedule: null,
        conditions: { field: 'mimeType', operator: 'contains', value: 'pdf' },
        actions: [{ type: 'KNOWLEDGE_CREATE_ITEM', params: { source: 'uploaded_file' } }],
        targetData: 'Uploaded workspace files and documents',
        expectedResult: 'Extract text content from uploaded files and store in Knowledge Base',
        requiredPermissions: ['File Read', 'Knowledge Base Write'],
        steps: [
          'Detect file upload event',
          'Validate file type (PDF/Document)',
          'Extract text content and metadata',
          'Index item into workspace Knowledge Base',
        ],
      };
    }

    // 6. Project Completion Report
    // e.g. "When a project is completed, create a report"
    if (
      lower.includes('project') &&
      (lower.includes('completed') || lower.includes('complete') || lower.includes('finish')) &&
      (lower.includes('report') || lower.includes('document') || lower.includes('summary'))
    ) {
      return {
        supported: true,
        name: 'Project Completion Report Generator',
        description: prompt,
        trigger: 'PROJECT_UPDATED',
        schedule: null,
        conditions: { field: 'status', operator: 'equals', value: 'COMPLETED' },
        actions: [{ type: 'DOCUMENT_CREATE_REPORT', params: { reportType: 'project_completion' } }],
        targetData: 'Completed project metrics, milestones, and task logs',
        expectedResult:
          'Generate a comprehensive project completion report document when project status changes to COMPLETED',
        requiredPermissions: ['Project Read', 'Knowledge Write', 'Document Write'],
        steps: [
          'Listen for project status change event to COMPLETED',
          'Gather project milestones, completed tasks, and time metrics',
          'Generate executive completion report document',
          'Save report to Knowledge Base & notify team',
        ],
      };
    }

    // 7. Weekly Project Report
    // e.g. "Create a weekly project report"
    if (
      (lower.includes('weekly') || lower.includes('friday') || lower.includes('monday')) &&
      lower.includes('project') &&
      lower.includes('report')
    ) {
      return {
        supported: true,
        name: 'Weekly Project Progress Report',
        description: prompt,
        trigger: 'SCHEDULE',
        schedule: '0 9 * * 1',
        conditions: null,
        actions: [{ type: 'DOCUMENT_CREATE_REPORT', params: { reportType: 'weekly_project' } }],
        targetData: 'All active project milestones and task completion stats',
        expectedResult:
          'Generate and save a weekly project progress report document every Monday at 9:00 AM',
        requiredPermissions: ['Project Read', 'Document Write'],
        steps: [
          'Trigger schedule (Every Monday at 9:00 AM)',
          'Aggregate active project stats, velocity, and open bottlenecks',
          'Synthesize weekly project progress report',
          'Publish report document to workspace Knowledge Base',
        ],
      };
    }

    // 8. General Task Creation / Single Task automation
    if (lower.includes('create task') || lower.includes('add task')) {
      return {
        supported: true,
        name: 'Automated Task Creation',
        description: prompt,
        trigger: 'MANUAL',
        schedule: null,
        conditions: null,
        actions: [{ type: 'TASK_CREATE', params: { title: 'New Automated Task' } }],
        targetData: 'Workspace Task Database',
        expectedResult: 'Create task with specified title and priority in workspace',
        requiredPermissions: ['Task Write'],
        steps: [
          'Receive trigger signal',
          'Extract task parameters',
          'Create task record in database',
          'Update task dashboard list',
        ],
      };
    }

    // Unsupported Intent Handler: Clear explanation instead of fake/wrong actions
    logger.warn(`[AutomationIntentParserService] Unsupported prompt: '${prompt}'`);
    return {
      supported: false,
      unsupportedReason: `AETHER Automation does not currently support instructions involving "${prompt}". Supported actions cover Tasks, Projects, Calendar, Files, Knowledge Base, Notifications, and Scheduled Digests.`,
    };
  }
}

export const automationIntentParser = new AutomationIntentParserService();
