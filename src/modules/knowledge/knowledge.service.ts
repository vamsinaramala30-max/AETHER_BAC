import { db } from '../../database/client';
import { NotesService } from './notes/notes.service';
import { DocumentsService } from './documents/documents.service';
import { KnowledgeBaseService } from './knowledge-base/knowledge-base.service';
import { SearchService } from './search/search.service';
import { UploadsService } from './uploads/uploads.service';
import { IndexingService } from './indexing/indexing.service';
import { KnowledgeRepository } from './knowledge.repository';

export class KnowledgeService {
  public readonly notesService: NotesService;
  public readonly documentsService: DocumentsService;
  public readonly knowledgeBaseService: KnowledgeBaseService;
  public readonly searchService: SearchService;
  public readonly uploadsService: UploadsService;
  public readonly indexingService: IndexingService;

  constructor(private readonly mainRepository: KnowledgeRepository) {
    this.notesService = new NotesService(this.mainRepository.notes);
    this.documentsService = new DocumentsService(this.mainRepository.documents);
    this.knowledgeBaseService = new KnowledgeBaseService(this.mainRepository.knowledgeBase);
    this.searchService = new SearchService(this.mainRepository.search);
    this.uploadsService = new UploadsService(this.mainRepository.uploads);
    this.indexingService = new IndexingService(this.mainRepository.indexing);
  }

  async getDashboardAnalytics(_userId: string) {
    const [fileCount, docCount, noteCount, projectCount, taskCount, automationCount] = await Promise.all([
      db.file.count(),
      db.document.count(),
      db.note.count({ where: { deletedAt: null } }),
      db.project.count({ where: { deletedAt: null } }),
      db.task.count({ where: { deletedAt: null } }),
      db.automation.count({ where: { deletedAt: null } }),
    ]);

    const totalKnowledge = fileCount + docCount + noteCount;

    return {
      totalKnowledge,
      files: fileCount,
      documents: docCount,
      notes: noteCount,
      connectedProjects: projectCount,
      connectedTasks: taskCount,
      automations: automationCount,
      systemHealth: 'HEALTHY',
    };
  }

  async getGraphData(_userId?: string) {
    const [files, docs, notes, projects, tasks] = await Promise.all([
      db.file.findMany({ take: 30, orderBy: { createdAt: 'desc' } }),
      db.document.findMany({ take: 30, orderBy: { createdAt: 'desc' } }),
      db.note.findMany({ where: { deletedAt: null }, take: 30, orderBy: { createdAt: 'desc' } }),
      db.project.findMany({ where: { deletedAt: null }, take: 20, orderBy: { createdAt: 'desc' } }),
      db.task.findMany({ where: { deletedAt: null }, take: 30, orderBy: { createdAt: 'desc' } }),
    ]);

    const nodes: any[] = [];
    const conceptTags = new Set<string>();

    // Add Projects
    projects.forEach((proj) => {
      nodes.push({
        id: proj.id,
        label: proj.name,
        type: 'project',
        connections: proj.tags || [],
      });
      (proj.tags || []).forEach((t) => conceptTags.add(t));
    });

    // Add Tasks
    tasks.forEach((task) => {
      const conn: string[] = [];
      if (task.projectId) conn.push(task.projectId);
      (task.labels || []).forEach((l) => {
        conn.push(l);
        conceptTags.add(l);
      });
      nodes.push({
        id: task.id,
        label: task.title,
        type: 'task',
        connections: conn,
      });
    });

    // Add Documents
    docs.forEach((doc) => {
      let category = 'document';
      let tags: string[] = [];
      try {
        if (doc.content) {
          const parsed = JSON.parse(doc.content);
          category = parsed.category || 'document';
          tags = parsed.tags || [];
        }
      } catch {}
      tags.forEach((t) => conceptTags.add(t));
      nodes.push({
        id: doc.id,
        label: doc.fileName || 'Document',
        type: 'document',
        category,
        connections: tags,
      });
    });

    // Add Notes
    notes.forEach((note) => {
      (note.tags || []).forEach((t) => conceptTags.add(t));
      nodes.push({
        id: note.id,
        label: note.title,
        type: 'note',
        connections: note.tags || [],
      });
    });

    // Add Files
    files.forEach((file) => {
      const ext = file.filename.split('.').pop()?.toLowerCase() || 'file';
      conceptTags.add(ext);
      nodes.push({
        id: file.id,
        label: file.filename,
        type: 'file',
        connections: [ext],
      });
    });

    // Add Concepts
    conceptTags.forEach((tag) => {
      nodes.push({
        id: tag,
        label: `#${tag}`,
        type: 'concept',
        connections: [],
      });
    });

    return nodes;
  }

  async getDateActivity() {
    const [files, docs, notes, execs] = await Promise.all([
      db.file.findMany({ select: { createdAt: true }, take: 100, orderBy: { createdAt: 'desc' } }),
      db.document.findMany({ select: { createdAt: true }, take: 100, orderBy: { createdAt: 'desc' } }),
      db.note.findMany({ select: { createdAt: true, updatedAt: true }, take: 100, orderBy: { updatedAt: 'desc' } }),
      db.automationExecution.findMany({ select: { startedAt: true }, take: 100, orderBy: { startedAt: 'desc' } }),
    ]);

    const dateMap: Record<string, { count: number; date: string }> = {};

    const addDate = (d?: Date | null) => {
      if (!d) return;
      const dateStr = d.toISOString().split('T')[0];
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { count: 0, date: dateStr };
      }
      dateMap[dateStr].count += 1;
    };

    files.forEach((f) => addDate(f.createdAt));
    docs.forEach((d) => addDate(d.createdAt));
    notes.forEach((n) => {
      addDate(n.createdAt);
      addDate(n.updatedAt);
    });
    execs.forEach((e) => addDate(e.startedAt));

    const sortedDates = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    return sortedDates;
  }

  async getKnowledgeGaps() {
    const activeProjects = await db.project.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      include: { tasks: true },
      take: 10,
    });

    const docs = await db.document.findMany({ take: 100 });

    const gaps: Array<{ projectId: string; projectName: string; message: string }> = [];

    activeProjects.forEach((proj) => {
      const hasTasks = proj.tasks.length > 0;
      const hasDocs = docs.some((d) => d.content?.includes(proj.id) || d.fileName?.toLowerCase().includes(proj.name.toLowerCase()));

      if (hasTasks && !hasDocs) {
        gaps.push({
          projectId: proj.id,
          projectName: proj.name,
          message: `Project "${proj.name}" has ${proj.tasks.length} active task(s) but no supporting documentation.`,
        });
      }
    });

    return gaps;
  }
}

