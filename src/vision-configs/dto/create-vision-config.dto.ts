import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsObject,
  IsBoolean,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class CreateVisionConfigDto {
  @ApiProperty({ example: 'watercolor-gemini-flash' })
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'google/gemini-2.5-flash', required: false })
  @IsOptional()
  @IsString()
  visionModel?: string;

  @ApiProperty({ example: 0.7, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  visionTemperature?: number;

  @ApiProperty({
    example: 'A watercolor portrait of [description] named [Name]...',
    required: false,
  })
  @IsOptional()
  @IsString()
  promptTemplate?: string;

  @ApiProperty({
    example: 'of a fluffy golden retriever with soft brown eyes...',
    required: false,
  })
  @IsOptional()
  @IsString()
  descriptionExample?: string;

  @ApiProperty({ example: { colorCount: 5 }, required: false })
  @IsOptional()
  @IsObject()
  templateVars?: Record<string, any>;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
