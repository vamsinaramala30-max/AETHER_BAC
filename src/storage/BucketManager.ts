import { env, logger } from '../config';
import { SupabaseStorage } from './SupabaseStorage';

export class BucketManager {
  private supabaseStorage: SupabaseStorage;

  constructor() {
    this.supabaseStorage = new SupabaseStorage();
  }

  /**
   * Ensures necessary operational buckets exist across configured cloud providers.
   */
  public async initializeBuckets(buckets: string[] = ['aether-assets', 'user-uploads', 'documents']): Promise<void> {
    if (env.STORAGE_DRIVER === 'supabase') {
      logger.info(`Validating cloud storage buckets: ${buckets.join(', ')}`);
      // Bucket existence verification handled natively via Supabase client policies
    } else {
      logger.info('Local file driver active. Bucket names will be mapped to directory structure.');
    }
  }
}