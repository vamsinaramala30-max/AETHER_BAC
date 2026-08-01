// ============================================================================
// File: backend/src/modules/projects/projects.routes.ts
// ============================================================================

export const PROJECTS_ROUTES = {
  DASHBOARD: '/api/v1/projects/dashboard',
  OVERVIEW: '/api/v1/projects/overview',

  PROJECTS: {
    ROOT: '/api/v1/projects',
    BY_ID: '/api/v1/projects/:id',
    ARCHIVE: '/api/v1/projects/:id/archive',
    RESTORE: '/api/v1/projects/:id/restore',
    DUPLICATE: '/api/v1/projects/:id/duplicate',
  },

  TASKS: {
    ROOT: '/api/v1/tasks',
    BY_ID: '/api/v1/tasks/:id',
    LOG_TIME: '/api/v1/tasks/:id/log-time',
    BULK: '/api/v1/tasks/bulk',
  },

  GOALS: {
    ROOT: '/api/v1/goals',
    BY_ID: '/api/v1/goals/:id',
  },

  STUDY_PLANNER: {
    SUBJECTS: '/api/v1/study-planner/subjects',
    SESSIONS: '/api/v1/study-planner/sessions',
    COMPLETE_SESSION: '/api/v1/study-planner/sessions/:id/complete',
  },

  WEEKLY_REVIEW: {
    ROOT: '/api/v1/weekly-reviews',
    BY_ID: '/api/v1/weekly-reviews/:id',
    AI_INSIGHTS: '/api/v1/weekly-reviews/:id/ai-insights',
  },
} as const;