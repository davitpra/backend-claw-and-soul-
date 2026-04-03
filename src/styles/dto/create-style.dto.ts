import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsObject,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStyleDto {
  @ApiProperty({ example: 'watercolor_classic' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Watercolor Classic' })
  @IsString()
  @MaxLength(150)
  displayName: string;

  @ApiProperty({ example: 'watercolor' })
  @IsString()
  @MaxLength(100)
  category: string;

  @ApiProperty({ example: 'A classic watercolor painting style', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @ApiProperty({ example: { steps: 30, cfg_scale: 7 }, required: false })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
