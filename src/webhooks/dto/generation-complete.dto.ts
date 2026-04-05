import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsIn,
  IsInt,
  IsObject,
  Min,
} from 'class-validator';

export class GenerationCompleteDto {
  @ApiProperty({ description: 'Generation ID' })
  @IsUUID()
  generationId: string;

  @ApiProperty({ description: 'Final status', enum: ['completed', 'failed'] })
  @IsIn(['completed', 'failed'])
  status: 'completed' | 'failed';

  @ApiProperty({ description: 'Public URL of the result', required: false })
  @IsOptional()
  @IsString()
  resultUrl?: string;

  @ApiProperty({ description: 'Storage key for the result file', required: false })
  @IsOptional()
  @IsString()
  resultStorageKey?: string;

  @ApiProperty({ description: 'Thumbnail URL', required: false })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiProperty({ description: 'Error message if failed', required: false })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiProperty({ description: 'Processing time in seconds', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  processingTimeSeconds?: number;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
