export interface NotebookEntity {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  color?: string | null; // semantic accent key, e.g. 'indigo' | 'purple' | 'amber' — not a raw hex
  order: number;
  isDefault: boolean; // true for the auto-created migration target notebook
  createdAt: Date;
  updatedAt: Date;
}
