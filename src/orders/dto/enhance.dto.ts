import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Options for the image-enhancement pipeline applied to an order item's print
 * image before POD submission. The pipeline runs a real AI upscale via fal.ai
 * (optional) plus adjustments with sharp, storing the result as a flat JPEG.
 */
export class EnhanceDto {
  @ApiProperty({
    description: 'AI upscale factor (0 = no upscale, run fal.ai when 2 or 4)',
    enum: [0, 2, 4],
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @IsIn([0, 2, 4])
  upscale?: 0 | 2 | 4;

  @ApiProperty({
    description: 'Cloudinary sharpen strength (e_sharpen)',
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
}
