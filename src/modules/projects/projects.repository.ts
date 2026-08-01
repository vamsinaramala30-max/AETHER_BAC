// ============================================================================
// File: backend/src/modules/projects/projects/projects.repository.ts
// ============================================================================

import { ProjectEntity } from './projects.entity';
import { ProjectFilterDTO } from './projects.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ProjectsRepository {
  private projects: Map<string, ProjectEntity> = new Map();

  async findById(id: string): Promise<ProjectEntity | null> {
    const project = this.projects.get(id);
    return project ? { ...project } : null;
  }

  async findMany(filter: ProjectFilterDTO): Promise<PaginatedResult<ProjectEntity>> {
    let items = Array.from(this.projects.values());

    if (filter.ownerId) {
      items = items.filter((p) => p.ownerId === filter.ownerId);
    }
    if (filter.memberId) {
      items = items.filter((p) => p.members.some((m) => m.userId === filter.memberId));
    }
    if (filter.category) {
      items = items.filter((p) => p.category.toLowerCase() === filter.category?.toLowerCase());
    }
    if (filter.status) {
      items = items.filter((p) => p.status === filter.status);
    }
    if (filter.priority) {
      items = items.filter((p) => p.priority === filter.priority);
    }
    if (filter.isArchived !== undefined) {
      items = items.filter((p) => p.isArchived === filter.isArchived);
    }
    if (filter.isFavorite !== undefined) {
      items = items.filter((p) => p.isFavorite === filter.isFavorite);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      items = items.filter((p) => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
    }
    if (filter.tags && filter.tags.length > 0) {
      items = items.filter((p) => filter.tags?.some((t) => p.tags.includes(t)));
    }

    const sortBy = filter.sortBy || 'createdAt';
    const sortOrder = filter.sortOrder || 'desc';
    items.sort((a, b) => {
      let valA = a[sortBy as keyof ProjectEntity];
      let valB = b[sortBy as keyof ProjectEntity];
      if (valA instanceof Date) valA = valA.getTime();
      if (valB instanceof Date) valB = valB.getTime();
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const total = items.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + limit);

    return {
      data: paginatedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async save(project: ProjectEntity): Promise<ProjectEntity> {
    this.projects.set(project.id, { ...project, updatedAt: new Date() });
    return { ...this.projects.get(project.id)! };
  }

  async delete(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async countByOwner(ownerId: string): Promise<number> {
    return Array.from(this.projects.values()).filter((p) => p.ownerId === ownerId).length;
  }
}