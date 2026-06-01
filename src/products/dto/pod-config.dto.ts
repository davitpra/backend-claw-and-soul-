import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsArray,
} from 'class-validator';

export class PodConfigDto {
  @ApiProperty({ example: 'canvas', description: 'Pictorem material code' })
  @IsString()
  @IsNotEmpty()
  material: string;

  @ApiProperty({ example: 'stretched', description: 'Pictorem type code' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiPropertyOptional({
    example: 'horizontal',
    description:
      'horizontal | vertical | square. Derived from Format if omitted.',
  })
  @IsString()
  @IsOptional()
  orientation?: string;

  @ApiProperty({ example: 30, description: 'Print width in inches' })
  @IsNumber()
  @IsPositive()
  width: number;

  @ApiProperty({ example: 24, description: 'Print height in inches' })
  @IsNumber()
  @IsPositive()
  height: number;

  @ApiPropertyOptional({
    example: ['c15', 'mirrorimage'],
    description:
      'Additional Pictorem options (mounting, wrap, packaging, etc.)',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additional?: string[];
}
