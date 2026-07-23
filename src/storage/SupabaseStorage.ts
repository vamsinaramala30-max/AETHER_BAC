import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env, logger } from '../config';

export class SupabaseStorage {
  private client: SupabaseClient | null = null;
  private defaultBucket: string;

  constructor() {
    this.defaultBucket = env.SUPABASE_STORAGE_BUCKET || 'aether-assets';

    if (env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) {
      this.client = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY!
      );
    } else {
      logger.warn('Supabase storage credentials missing. Cloud operations will be disabled.');
    }
  }

  public async upload(
    fileBuffer: Buffer,
    filePath: string,
    mimeType: string,
    bucket: string = this.defaultBucket
  ): Promise<{ path: string; url: string }> {
    if (!this.client) {
      throw new Error('Supabase client is not initialized.');
    }

    const { data, error } = await this.client.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      logger.error(`Supabase upload error for path '${filePath}':`, error);
      throw error;
    }

    const { data: publicUrlData } = this.client.storage.from(bucket).getPublicUrl(data.path);

    return {
      path: data.path,
      url: publicUrlData.publicUrl,
    };
  }

  public async delete(filePath: string, bucket: string = this.defaultBucket): Promise<void> {
    if (!this.client) throw new Error('Supabase client is not initialized.');

    const { error } = await this.client.storage.from(bucket).remove([filePath]);
    if (error) {
      logger.error(`Supabase file deletion error for path '${filePath}':`, error);
      throw error;
    }
  }

  public async download(filePath: string, bucket: string = this.defaultBucket): Promise<Buffer> {
    if (!this.client) throw new Error('Supabase client is not initialized.');

    const { data, error } = await this.client.storage.from(bucket).download(filePath);
    if (error || !data) {
      logger.error(`Supabase download error for path '${filePath}':`, error);
      throw error || new Error('File download failed.');
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}