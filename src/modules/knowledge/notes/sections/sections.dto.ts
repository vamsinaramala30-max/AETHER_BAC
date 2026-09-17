export class CreateSectionDto {
  name!: string;
}

export class UpdateSectionDto {
  name?: string;
  order?: number;
}

export class ReorderSectionsDto {
  notebookId!: string;
  orderedIds!: string[];
}

export class MoveSectionDto {
  targetNotebookId!: string;
}
