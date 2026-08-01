// ============================================================================
// File: backend/src/modules/projects/study-planner/study-planner.controller.ts
// ============================================================================

import { StudyPlannerService } from './study-planner.service';
import { CreateSubjectDTO, CreateStudySessionDTO, StudyPlannerFilterDTO } from './study-planner.dto';

export class StudyPlannerController {
  constructor(private readonly service: StudyPlannerService) {}

  async createSubject(req: { body: CreateSubjectDTO }) {
    const data = await this.service.createSubject(req.body);
    return { success: true, data };
  }

  async createSession(req: { body: CreateStudySessionDTO }) {
    const data = await this.service.createSession(req.body);
    return { success: true, data };
  }

  async getSessions(req: { query: StudyPlannerFilterDTO }) {
    const data = await this.service.getSessions(req.query);
    return { success: true, data };
  }

  async completeSession(req: { params: { id: string }; body: { durationMinutes: number } }) {
    const data = await this.service.completeSession(req.params.id, req.body.durationMinutes);
    return { success: true, data };
  }
}