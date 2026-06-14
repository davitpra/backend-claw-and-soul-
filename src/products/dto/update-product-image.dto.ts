import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export const PRODUCT_IMAGE_TYPES = [
  'scene',
  'in_use',
  'explainer',
  'gallery',
] as const;

export class UpdateProductImageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  altImage?: string;

  @ApiProperty({ required: false, enum: PRODUCT_IMAGE_TYPES })
  @IsOptional()
  @IsIn(PRODUCT_IMAGE_TYPES)
  type?: (typeof PRODUCT_IMAGE_TYPES)[number];

  // null clears the variant association (moves the image to "General").
  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'ProductFormatVariant id, or null to move the image to "General".',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  productFormatVariantId?: string | null;
}
