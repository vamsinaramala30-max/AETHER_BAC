export interface FileUploadEntity {
  id: string;
  originalName: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: string;
  uploaderId: string;
  createdAt: Date;
}
