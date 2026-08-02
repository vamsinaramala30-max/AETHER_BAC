export enum EventStatus {
  CONFIRMED = 'CONFIRMED',
  TENTATIVE = 'TENTATIVE',
  CANCELLED = 'CANCELLED',
}

export enum EventCategory {
  MEETING = 'MEETING',
  WORK = 'WORK',
  PERSONAL = 'PERSONAL',
  FOCUS = 'FOCUS',
  OTHER = 'OTHER',
}

export enum RecurrenceFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  NONE = 'NONE',
}

export enum FocusSessionStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

export enum FocusTimerType {
  POMODORO = 'POMODORO',
  CUSTOM = 'CUSTOM',
  SHORT_BREAK = 'SHORT_BREAK',
  LONG_BREAK = 'LONG_BREAK',
}

export enum FileActivityType {
  OPENED = 'OPENED',
  EDITED = 'EDITED',
  CREATED = 'CREATED',
  SHARED = 'SHARED',
  DOWNLOADED = 'DOWNLOADED',
}

export enum FavoriteType {
  PROJECT = 'PROJECT',
  FILE = 'FILE',
  NOTE = 'NOTE',
  CONVERSATION = 'CONVERSATION',
  TASK = 'TASK',
}

export const WORKSPACE_PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const WORKSPACE_CACHE_KEYS = {
  PRODUCTIVITY_STATS: 'workspace:productivity:stats',
  CALENDAR_EVENTS: 'workspace:calendar:events',
  FOCUS_STATS: 'workspace:focus:stats',
  RECENT_FILES: 'workspace:recent:files',
  FAVORITES: 'workspace:favorites',
} as const;

export const TIME_CONSTANTS = {
  MS_PER_SECOND: 1000,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
  POMODORO_DEFAULT_MINUTES: 25,
  SHORT_BREAK_DEFAULT_MINUTES: 5,
  LONG_BREAK_DEFAULT_MINUTES: 15,
} as const;
