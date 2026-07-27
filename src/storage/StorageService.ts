import { env } from '../config';
import { LocalStorage } from './LocalStorage';
import { SupabaseStorage } from './SupabaseStorage';

export interface StorageUploadResult {
  path: string;
  url: string;
  driver: 'local' | 'supabase';
}

export class StorageService {
  private localStorage: LocalStorage;
  private supabaseStorage: SupabaseStorage;
  private primaryDriver: 'local' | 'supabase';

  constructor() {
    this.localStorage = new LocalStorage();
    this.supabaseStorage = new SupabaseStorage();
    this.primaryDriver = env.STORAGE_DRIVER;
  }

  public async upload(
    fileBuffer: Buffer,
    filePath: string,
    mimeType: string,
    bucket?: string,
  ): Promise<StorageUploadResult> {
    if (this.primaryDriver === 'supabase') {
      const result = await this.supabaseStorage.upload(fileBuffer, filePath, mimeType, bucket);
      return { ...result, driver: 'supabase' };
    }

    const result = await this.localStorage.upload(fileBuffer, filePath, bucket);
    return { ...result, driver: 'local' };
  }

  public async delete(filePath: string, bucket?: string): Promise<void> {
    if (this.primaryDriver === 'supabase') {
      await this.supabaseStorage.delete(filePath, bucket);
    } else {
      await this.localStorage.delete(filePath, bucket);
    }
  }

  public async getFileBuffer(filePath: string, bucket?: string): Promise<Buffer> {
    if (this.primaryDriver === 'supabase') {
      return this.supabaseStorage.download(filePath, bucket);
    }
    return this.localStorage.getBuffer(filePath, bucket);
  }
}
