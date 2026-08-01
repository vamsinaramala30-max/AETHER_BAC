// ============================================================================
// File: backend/src/modules/projects/projects.constants.ts
// ============================================================================

export enum ProjectStatus {
  DRAFT = 'DRAFT',
  PLANNING = 'PLANNING',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ARCHIVED = 'ARCHIVED',
}

export enum TaskStatus {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum PriorityLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum GoalType {
  SMART = 'SMART',
  MILESTONE = 'MILESTONE',
  METRIC = 'METRIC',
  HABITUAL = 'HABITUAL',
}

export enum GoalStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  AHEAD = 'AHEAD',
  BEHIND = 'BEHIND',
  ACHIEVED = 'ACHIEVED',
  FAILED = 'FAILED',
}

export enum StudySessionType {
  LECTURE = 'LECTURE',
  READING = 'READING',
  REVISION = 'REVISION',
  PRACTICE_PROBLEMS = 'PRACTICE_PROBLEMS',
  EXAM_PREP = 'EXAM_PREP',
  GROUP_STUDY = 'GROUP_STUDY',
}

export enum RecurrenceInterval {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
}

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
  SORT_ORDER: 'desc' as const,
};

export const CACHE_KEYS = {
  PROJECT_STATS: 'stats:projects:',
  USER_DASHBOARD: 'dashboard:user:',
  STUDY_STREAK: 'study:streak:',
  WEEKLY_REVIEW_SUMMARY: 'review:weekly:',
};

export const EVENT_NAMES = {
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_ARCHIVED: 'project.archived',
  TASK_COMPLETED: 'task.completed',
  GOAL_ACHIEVED: 'goal.achieved',
  STUDY_SESSION_COMPLETED: 'study_session.completed',
  WEEKLY_REVIEW_SUBMITTED: 'weekly_review.submitted',
};