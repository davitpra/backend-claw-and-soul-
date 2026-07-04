import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

/**
 * Multipart body for saving a Paint-by-Numbers. Non-file fields arrive as
 * strings; `config` is a JSON string parsed in the service. Files (source,
 * svg, preview, palette) are handled by FileFieldsInterceptor, not here.
 */
export class CreatePaintByNumbersDto {
  @ApiProperty({
    description:
      'JSON string with the PBN config (colors, render opts, palette, recipes, paper)',
  })
  @IsString()
  @IsNotEmpty()
  config!: string;

  @ApiProperty({ required: false, description: 'Source AI generation id' })
  @IsOptional()
  @IsString()
  generationId?: string;

  @ApiProperty({ required: false, description: 'Related pet id' })
  @IsOptional()
  @IsString()
  petId?: string;

  @ApiProperty({
    required: false,
    description: 'Number of colors in the palette',
  })
  @IsOptional()
  @IsString()
  colorCount?: string;
}
