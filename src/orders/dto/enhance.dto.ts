import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Options for the image-enhancement pipeline applied to an order item's print
 * image before POD submission.
 *
 * Two selectable engines:
 *  - `cloudinary`: enhancement via Cloudinary transformations (improve, auto_color, …)
 *    delivered over a stored upload asset.
 *  - `sharp`: real AI upscale via fal.ai + adjustments with sharp, stored as a flat JPEG.
 */
export class EnhanceDto {
  @ApiProperty({
    description: 'Enhancement engine',
    enum: ['cloudinary', 'sharp'],
    required: false,
    default: 'sharp',
  })
  @IsOptional()
  @IsString()
  @IsIn(['cloudinary', 'sharp'])
  engine?: 'cloudinary' | 'sharp';

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
    description: 'Apply Cloudinary auto-color balance (e_auto_color)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  autoColor?: boolean;

  @ApiProperty({
    description: 'Apply Cloudinary generative improve (e_improve)',
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
