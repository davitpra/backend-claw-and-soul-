import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: key,
          resource_type: contentType.startsWith('video/') ? 'video' : 'image',
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            this.logger.error(`Failed to upload file: ${key}`, error.message);
            return reject(new Error(error.message));
          }
          this.logger.log(`File uploaded: ${key}`);
          resolve(result!.secure_url);
        },
      );

      uploadStream.end(buffer);
    });
  }

  async delete(key: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(key);
      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${key}`, (error as Error).message);
      throw error;
    }
  }

  getPublicUrl(key: string): string {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    return `https://res.cloudinary.com/${cloudName}/image/upload/${key}`;
  }
}
