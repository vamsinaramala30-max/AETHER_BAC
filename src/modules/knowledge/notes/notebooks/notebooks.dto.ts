export class CreateNotebookDto {
  name!: string;
  description?: string;
  color?: string;
}

export class UpdateNotebookDto {
  name?: string;
  description?: string;
  color?: string;
  order?: number;
}

export class ReorderNotebooksDto {
  orderedIds!: string[];
}
