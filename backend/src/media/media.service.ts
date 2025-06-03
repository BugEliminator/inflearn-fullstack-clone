import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

interface RequiredEnvVars {
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_MEDIA_S3_BUCKET_NAME: string;
  CLOUDFRONT_DOMAIN: string;
}

interface ValidatedFile extends Express.Multer.File {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class MediaService implements OnModuleInit {
  private s3Client: S3Client;
  private cloudFrontDomain: string;
  private envVars: RequiredEnvVars;

  constructor() {
    // 환경 변수 검증
    const envVars = {
      AWS_REGION: process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_MEDIA_S3_BUCKET_NAME: process.env.AWS_MEDIA_S3_BUCKET_NAME,
      CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN,
    };

    Object.entries(envVars).forEach(([key, value]) => {
      if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    });

    this.envVars = envVars as RequiredEnvVars;

    this.s3Client = new S3Client({
      region: this.envVars.AWS_REGION,
      credentials: {
        accessKeyId: this.envVars.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.envVars.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.cloudFrontDomain = this.envVars.CLOUDFRONT_DOMAIN;
  }

  onModuleInit() {
    // 서비스 시작 시 추가 검증
    if (!this.s3Client || !this.cloudFrontDomain) {
      throw new Error('MediaService initialization failed');
    }
  }

  private validateFile(file: Express.Multer.File): ValidatedFile {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!file?.originalname || !file?.buffer || !file?.mimetype) {
      throw new Error('Invalid file object');
    }
    return file as ValidatedFile;
  }

  async uploadMedia(file: Express.Multer.File, userId: string) {
    const validatedFile = this.validateFile(file);
    const fileExtension = validatedFile.originalname.split('.').pop() || '';
    const key = `media/${userId}/${uuid()}.${fileExtension}`;

    const res = await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.envVars.AWS_MEDIA_S3_BUCKET_NAME,
        Key: key,
        Body: validatedFile.buffer,
        ContentType: validatedFile.mimetype,
      }),
    );

    return {
      storageType: 's3',
      s3: {
        bucket: this.envVars.AWS_MEDIA_S3_BUCKET_NAME,
        key,
        size: res?.Size,
        region: this.envVars.AWS_REGION,
        metadata: {
          uploadedAt: new Date().toISOString(),
          contentType: validatedFile.mimetype,
        },
      },
      cloudFront: {
        url: this.getMediaUrl(key),
      },
    };
  }

  private getMediaUrl(key: string): string {
    return `https://${this.cloudFrontDomain}/${key}`;
  }
}
