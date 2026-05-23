import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class CreateImageGenConfigDto {
  @ApiProperty({ example: 'flux-dev-standard' })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'fal', required: false })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ example: 'fal-ai/flux/dev', required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ example: { steps: 30, cfg_scale: 7 }, required: false })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
