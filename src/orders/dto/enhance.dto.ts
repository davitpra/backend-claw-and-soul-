import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * Options for the image-enhancement pipeline applied to an order item's print
 * image before POD submission. The pipeline runs a real AI upscale via fal.ai
 * (optional) plus adjustments with sharp, storing the result as a flat file.
 */
export class EnhanceDto {
  @ApiProperty({
    description:
      'fal.ai upscale factor (float, 1–8). When provided it takes priority ' +
      'over targetDpi and upscale. Still subject to the 30 MP output safety cap.',
    minimum: 1,
    maximum: 8,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8)
  upscaleFactor?: number;

  @ApiProperty({
    description:
      'AI upscale factor (0 = no upscale, run fal.ai when 2 or 4). ' +
      'Ignored when upscaleFactor or targetDpi is provided.',
    enum: [0, 2, 4],
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @IsIn([0, 2, 4])
  upscale?: 0 | 2 | 4;

  @ApiProperty({
    description:
      'Target print DPI. When provided, the backend auto-calculates the fal.ai ' +
      'upscale factor needed to reach this resolution at the product print size. ' +
      'Takes precedence over upscale.',
    minimum: 72,
    maximum: 600,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(72)
  @Max(600)
  targetDpi?: number;

  @ApiProperty({
    description: 'sharpen strength (sharp sigma = 1 + value / 100)',
    minimum: 0,
    maximum: 200,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  sharpen?: number;

  @ApiProperty({ minimum: -50, maximum: 100, required: false })
  @IsOptional()
  @IsInt()
  @Min(-50)
  @Max(100)
  contrast?: number;

  @ApiProperty({ minimum: -50, maximum: 100, required: false })
  @IsOptional()
  @IsInt()
  @Min(-50)
  @Max(100)
  brightness?: number;

  @ApiProperty({ minimum: -50, maximum: 100, required: false })
  @IsOptional()
  @IsInt()
  @Min(-50)
  @Max(100)
  saturation?: number;

  @ApiProperty({
    description: 'Apply auto-levels (normalise the tonal range)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  improve?: boolean;

  @ApiProperty({
    description:
      'Crop the image to the exact product print aspect ratio (centered) so ' +
      'Pictorem does not crop it — guarantees centering and scale.',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  fitToFormat?: boolean;

  @ApiProperty({
    description:
      'Output format. Defaults to jpeg. Use png for lossless output.',
    enum: ['jpeg', 'png'],
    required: false,
    default: 'jpeg',
  })
  @IsOptional()
  @IsString()
  @IsIn(['jpeg', 'png'])
  format?: 'jpeg' | 'png';

  @ApiProperty({
    description:
      'Extend the image by 3 mm on each side with a solid colour (bleed for POD). ' +
      'The colour is taken from bleedColor (defaults to #ffffff).',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  bleed?: boolean;

  @ApiProperty({
    description:
      'Hex colour used for the bleed extension (#rrggbb). Only effective when bleed=true.',
    pattern: '^#[0-9a-fA-F]{6}$',
    required: false,
    default: '#ffffff',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6})$/)
  bleedColor?: string;

  @ApiProperty({
    description:
      'When true, the enhance-preview endpoint also runs the fal.ai upscale so ' +
      'the preview is fully accurate (slower — costs one fal.ai call).',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  previewUpscale?: boolean;
}
