import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsIn,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SelectOptionItemDto {
  @ApiProperty({ example: 'blue' })
  @IsString()
  value: string;

  @ApiProperty({ example: 'Azul' })
  @IsString()
  label: string;
}

export class SelectTemplateVarOptionDto {
  @ApiProperty({ enum: ['select'] })
  @IsIn(['select'])
  type: 'select';

  @ApiProperty({ example: 'Fondo' })
  @IsString()
  label: string;

  @ApiProperty({ type: [SelectOptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectOptionItemDto)
  options: SelectOptionItemDto[];

  @ApiProperty({ example: 'white' })
  @IsString()
  default: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class SliderTemplateVarOptionDto {
  @ApiProperty({ enum: ['slider'] })
  @IsIn(['slider'])
  type: 'slider';

  @ApiProperty({ example: 'Cantidad de colores' })
  @IsString()
  label: string;

  @ApiProperty({ example: 3 })
  @IsNumber()
  @Min(0)
  min: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  max: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  step?: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  default: number;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class ColorTemplateVarOptionDto {
  @ApiProperty({ enum: ['color'] })
  @IsIn(['color'])
  type: 'color';

  @ApiProperty({ example: 'Color de acento' })
  @IsString()
  label: string;

  @ApiProperty({ example: '#448da6' })
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'default must be a valid hex color (e.g. #448da6)' })
  default: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export type TemplateVarOptionDto =
  | SelectTemplateVarOptionDto
  | SliderTemplateVarOptionDto
  | ColorTemplateVarOptionDto;
