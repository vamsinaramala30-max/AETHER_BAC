import { FileUploadEntity } from './uploads.entity';

export class UploadsRepository {
  private files = new Map<string, FileUploadEntity>();

  async save(file: Omit<FileUploadEntity, 'id' | 'createdAt'>): Promise<FileUploadEntity> {
    const id = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entity = { ...file, id, createdAt: new Date() };
    this.files.set(id, entity);
    return entity;
  }
}
