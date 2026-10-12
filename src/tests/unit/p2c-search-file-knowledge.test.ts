import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../database/client';
import { searchRoutes } from '../../routes/search.routes';
import { SearchService } from '../../modules/knowledge/search/search.service';
import { SearchRepository } from '../../modules/knowledge/search/search.repository';
import { DocumentsService } from '../../modules/knowledge/documents/documents.service';
import { DocumentsRepository } from '../../modules/knowledge/documents/documents.repository';

describe('P2C Backend: Search, Knowledge & File Manager Integration', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const workspaceA = '33333333-3333-4333-8333-333333333333';
  const workspaceB = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Global Search Routes & Navigation Destinations', () => {
    it('search routes mount root GET and POST and suggestions', () => {
      const paths = searchRoutes.stack
        .filter((l: any) => l.route)
        .map((l: any) => ({
          path: l.route.path,
          methods: Object.keys(l.route.methods),
        }));

      expect(paths.some((p) => p.path === '/' && p.methods.includes('get'))).toBe(true);
      expect(paths.some((p) => p.path === '/' && p.methods.includes('post'))).toBe(true);
      expect(paths.some((p) => p.path === '/suggestions' && p.methods.includes('get'))).toBe(true);
    });

    it('maps search results to valid application routes across entities', async () => {
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any,
      ]);

      vi.spyOn(db.task, 'findMany').mockResolvedValue([
        {
          id: 'task-123',
          title: 'Fix Global Search',
          status: 'TODO',
          priority: 'HIGH',
          updatedAt: new Date(),
          project: { id: 'proj-456', name: 'Aether Platform' },
        } as any,
      ]);

      vi.spyOn(db.project, 'findMany').mockResolvedValue([
        {
          id: 'proj-456',
          name: 'Aether Platform',
          status: 'ACTIVE',
          updatedAt: new Date(),
        } as any,
      ]);

      vi.spyOn(db.file, 'findMany').mockResolvedValue([
        {
          id: 'file-202',
          filename: 'roadmap.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          updatedAt: new Date(),
        } as any,
      ]);

      vi.spyOn(db.note, 'findMany').mockResolvedValue([
        {
          id: 'note-101',
          title: 'Meeting Notes',
          content: 'Discuss search routes',
          updatedAt: new Date(),
        } as any,
      ]);

      vi.spyOn(db.calendarEvent, 'findMany').mockResolvedValue([
        {
          id: 'event-404',
          title: 'Weekly Standup',
          startDate: new Date(),
        } as any,
      ]);

      vi.spyOn(db.plannerBlock, 'findMany').mockResolvedValue([
        {
          id: 'block-303',
          label: 'Sprint Review',
          startHour: 10,
          date: new Date(),
        } as any,
      ]);

      vi.spyOn(db.automation, 'findMany').mockResolvedValue([]);
      vi.spyOn(db.workspace, 'findMany').mockResolvedValue([]);

      const mockRepo = {
        recordSearch: vi.fn().mockResolvedValue({}),
      } as unknown as SearchRepository;

      const service = new SearchService(mockRepo);
      const { results } = await service.search({ query: 'Fix' }, userA, workspaceA);

      // Verify Task route maps to /app/projects/tasks?taskId=...
      const taskRes = results.find((r) => r.type === 'TASK');
      expect(taskRes).toBeDefined();
      expect(taskRes?.href).toBe('/app/projects/tasks?taskId=task-123');

      // Verify Project route maps to /app/projects?projectId=...
      const projRes = results.find((r) => r.type === 'PROJECT');
      expect(projRes).toBeDefined();
      expect(projRes?.href).toBe('/app/projects?projectId=proj-456');

      // Verify Note route maps to /app/knowledge/notes
      const noteRes = results.find((r) => r.type === 'NOTE');
      expect(noteRes).toBeDefined();
      expect(noteRes?.href).toBe('/app/knowledge/notes');

      // Verify File route maps to /app/projects/files?fileId=...
      const fileRes = results.find((r) => r.type === 'FILE');
      expect(fileRes).toBeDefined();
      expect(fileRes?.href).toBe('/app/projects/files?fileId=file-202');

      // Verify Time Block route maps to /app/workspace/weeklyplanner
      const blockRes = results.find((r) => r.type === 'PLANNER');
      expect(blockRes).toBeDefined();
      expect(blockRes?.href).toBe('/app/workspace/weeklyplanner');

      // Verify Calendar route maps to /app/workspace/calendar
      const calRes = results.find((r) => r.type === 'CALENDAR');
      expect(calRes).toBeDefined();
      expect(calRes?.href).toBe('/app/workspace/calendar');
    });

    it('enforces workspace isolation: blocks search in unauthorized workspace', async () => {
      // User is only a member of workspaceA, NOT workspaceB
      vi.spyOn(db.workspaceMember, 'findMany').mockResolvedValue([
        { workspaceId: workspaceA } as any,
      ]);

      const mockRepo = {
        recordSearch: vi.fn().mockResolvedValue({}),
      } as unknown as SearchRepository;

      const service = new SearchService(mockRepo);
      // Attempt search in unauthorized workspaceB
      const { results } = await service.search({ query: 'secret' }, userA, workspaceB);

      // Must return empty results due to tenant isolation check
      expect(results).toHaveLength(0);
    });
  });

  describe('Knowledge & File Manager Integration', () => {
    it('creates or links a File Manager record when document has an attached file without duplicating', async () => {
      const existingFile = {
        id: 'file-existing-1',
        filename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storagePath: 'uploads/design-spec.pdf',
        status: 'READY',
        userId: userA,
        workspaceId: workspaceA,
      };

      vi.spyOn(db.file, 'findUnique').mockResolvedValue(existingFile as any);
      vi.spyOn(db.file, 'create').mockResolvedValue(existingFile as any);

      const mockDocRepo = {
        create: vi.fn().mockResolvedValue({
          id: 'doc-uuid-1',
          title: 'Design Spec Doc',
          category: 'Project Documents',
          tags: ['design'],
          fileKey: 'uploads/design-spec.pdf',
          status: 'PROCESSING',
          ownerId: userA,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as unknown as DocumentsRepository;

      const service = new DocumentsService(mockDocRepo);
      const result = await service.createDocument(
        {
          title: 'Design Spec Doc',
          fileKey: 'uploads/design-spec.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          originalName: 'design-spec.pdf',
          workspaceId: workspaceA,
          metadata: {
            attachedFileIds: ['file-existing-1'],
          },
        },
        userA,
        workspaceA,
      );

      expect(result).toBeDefined();
      expect(mockDocRepo.create).toHaveBeenCalled();
      // Since existing file was found by ID, db.file.create should NOT be called (no duplicates)
      expect(db.file.create).not.toHaveBeenCalled();
    });

    it('creates a corresponding File Manager record when document has fileKey but no existing file record', async () => {
      vi.spyOn(db.file, 'findUnique').mockResolvedValue(null);
      vi.spyOn(db.file, 'findFirst').mockResolvedValue(null);
      const createSpy = vi.spyOn(db.file, 'create').mockResolvedValue({
        id: 'file-new-uuid',
        filename: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2048,
        storagePath: 'uploads/report.docx',
        status: 'READY',
        userId: userA,
        workspaceId: workspaceA,
      } as any);

      const mockDocRepo = {
        create: vi.fn().mockResolvedValue({
          id: 'doc-uuid-2',
          title: 'Quarterly Report',
          fileKey: 'uploads/report.docx',
          status: 'PROCESSING',
          ownerId: userA,
        }),
      } as unknown as DocumentsRepository;

      const service = new DocumentsService(mockDocRepo);
      await service.createDocument(
        {
          title: 'Quarterly Report',
          fileKey: 'uploads/report.docx',
          fileSize: 2048,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          originalName: 'report.docx',
          workspaceId: workspaceA,
        },
        userA,
        workspaceA,
      );

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            filename: 'report.docx',
            storagePath: 'uploads/report.docx',
            status: 'READY',
            userId: userA,
            workspaceId: workspaceA,
          }),
        }),
      );
    });
  });
});
