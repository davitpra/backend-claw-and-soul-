import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateImageGenerationDto {
  @ApiProperty({ description: 'Pet ID' })
  @IsUUID()
  petId: string;

  @ApiProperty({ description: 'Pet photo ID (optional)' })
  @IsOptional()
  @IsUUID()
  petPhotoId?: string;

  @ApiProperty({ description: 'Style ID' })
  @IsUUID()
  styleId: string;

  @ApiProperty({ description: 'Custom prompt (optional)' })
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiProperty({ description: 'Negative prompt (optional)' })
  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @ApiProperty({ description: 'AI provider', enum: ['openai', 'stability'] })
  @IsOptional()
  @IsString()
  @IsIn(['openai', 'stability'])
  provider?: string;

  @ApiProperty({ description: 'Image width', default: 1024 })
  @IsOptional()
  @IsInt()
  @Min(512)
  @Max(2048)
  width?: number;

  @ApiProperty({ description: 'Image height', default: 1024 })
  @IsOptional()
  @IsInt()
  @Min(512)
  @Max(2048)
  height?: number;
}
