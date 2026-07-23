import sharp from 'sharp';
import { logger } from '../config';

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  format?: 'webp' | 'jpeg' | 'png';
  quality?: number;
}

export class ImageProcessor {
  /**
   * Resizes and converts image buffers using Sharp for memory-efficient processing.
   */
  public static async processBuffer(
    buffer: Buffer,
    options: ImageProcessingOptions = {}
  ): Promise<{ buffer: Buffer; format: string; mimetype: string }> {
    try {
      let pipeline = sharp(buffer);
      const targetFormat = options.format || 'webp';
      const quality = options.quality || 80;

      if (options.width || options.height) {
        pipeline = pipeline.resize({
          width: options.width,
          height: options.height,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      if (targetFormat === 'webp') {
        pipeline = pipeline.webp({ quality });
      } else if (targetFormat === 'jpeg') {
        pipeline = pipeline.jpeg({ quality });
      } else if (targetFormat === 'png') {
        pipeline = pipeline.png({ quality });
      }

      const processedBuffer = await pipeline.toBuffer();
      const mimetype = `image/${targetFormat}`;

      return {
        buffer: processedBuffer,
        format: targetFormat,
        mimetype,
      };
    } catch (error) {
      logger.error('Failed to process image buffer:', error);
      throw new Error('Image processing failed due to corrupted input or unsupported format.');
    }
  }
}