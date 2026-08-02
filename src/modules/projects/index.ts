// ============================================================================
// File: backend/src/modules/projects/index.ts
// ============================================================================

// Constants
export * from './projects.constants';

// Shared Repository & Service
export * from './projects.repository';
export * from './project.service';
export * from './project.controller';
export * from './projects.routes';

// Projects Sub-module
export * from './projects.entity';
export * from './projects.dto';
export * from './projects.repository';
export * from './project.service';
export * from './project.controller';

// Tasks Sub-module
export * from './tasks/tasks.entity';
export * from './tasks/tasks.dto';
export * from './tasks/tasks.repository';
export * from './tasks/tasks.service';
export * from './tasks/tasks.controller';

// Goals Sub-module
export * from './goals/goals.entity';
export * from './goals/goals.dto';
export * from './goals/goals.repository';
export * from './goals/goals.service';
export * from './goals/goals.controller';

// Study Planner Sub-module
export * from './study-planner/study-planner.entity';
export * from './study-planner/study-planner.dto';
export * from './study-planner/study-planner.repository';
export * from './study-planner/study-planner.service';
export * from './study-planner/study-planner.controller';

// Weekly Review Sub-module
export * from './weekly-review/weekly-review.entity';
export * from './weekly-review/weekly-review.dto';
export * from './weekly-review/weekly-review.repository';
export * from './weekly-review/weekly-review.service';
export * from './weekly-review/weekly-review.controller';
