export const WORKSPACE_ROUTES = {
  ROOT: '/workspaces',
  OVERVIEW: '/workspaces/:workspaceId/overview',
  CALENDAR: {
    EVENTS: '/workspaces/:workspaceId/calendar/events',
    EVENT_BY_ID: '/workspaces/:workspaceId/calendar/events/:id',
    DRAG_DROP: '/workspaces/:workspaceId/calendar/events/:id/move',
    SYNC: '/workspaces/:workspaceId/calendar/sync',
  },
  PRODUCTIVITY: {
    DASHBOARD: '/workspaces/:workspaceId/productivity/dashboard',
    INSIGHTS: '/workspaces/:workspaceId/productivity/insights',
  },
  FOCUS: {
    START: '/workspaces/:workspaceId/focus/start',
    COMPLETE: '/workspaces/:workspaceId/focus/:id/complete',
    DISTRACTION: '/workspaces/:workspaceId/focus/:id/distraction',
    ANALYTICS: '/workspaces/:workspaceId/focus/analytics',
  },
  RECENT_FILES: {
    ROOT: '/workspaces/:workspaceId/recent-files',
    TRACK: '/workspaces/:workspaceId/recent-files/track',
  },
  FAVORITES: {
    ROOT: '/workspaces/:workspaceId/favorites',
    BY_ID: '/workspaces/:workspaceId/favorites/:id',
    REORDER: '/workspaces/:workspaceId/favorites/reorder',
  },
} as const;
