export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: string;
}

export const KNOWLEDGE_ROUTES: RouteDefinition[] = [
  // Dashboard
  { method: 'GET', path: '/knowledge/dashboard', handler: 'knowledgeController.getDashboard' },

  // Notes
  { method: 'POST', path: '/knowledge/notes', handler: 'notesController.create' },
  { method: 'GET', path: '/knowledge/notes', handler: 'notesController.list' },
  { method: 'GET', path: '/knowledge/notes/:id', handler: 'notesController.findOne' },
  { method: 'PATCH', path: '/knowledge/notes/:id', handler: 'notesController.update' },
  { method: 'DELETE', path: '/knowledge/notes/:id', handler: 'notesController.remove' },
  { method: 'GET', path: '/knowledge/notes/:id/history', handler: 'notesController.getHistory' },
  { method: 'POST', path: '/knowledge/notes/:id/ai-process', handler: 'notesController.aiProcess' },

  // Documents
  { method: 'POST', path: '/knowledge/documents', handler: 'documentsController.create' },
  { method: 'GET', path: '/knowledge/documents', handler: 'documentsController.list' },
  { method: 'GET', path: '/knowledge/documents/:id', handler: 'documentsController.findOne' },
  {
    method: 'POST',
    path: '/knowledge/documents/:id/extract',
    handler: 'documentsController.extractInfo',
  },

  // Knowledge Base
  {
    method: 'POST',
    path: '/knowledge/collections',
    handler: 'knowledgeBaseController.createCollection',
  },
  { method: 'POST', path: '/knowledge/articles', handler: 'knowledgeBaseController.createArticle' },

  // Search & Indexing & Uploads
  { method: 'POST', path: '/knowledge/search', handler: 'searchController.executeSearch' },
  {
    method: 'POST',
    path: '/knowledge/uploads/prepare',
    handler: 'uploadsController.prepareUpload',
  },
  {
    method: 'POST',
    path: '/knowledge/indexing/trigger',
    handler: 'indexingController.triggerIndex',
  },
];
