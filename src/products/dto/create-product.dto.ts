import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsIn, MaxLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'gid://shopify/Product/123456789' })
  @IsString()
  @MaxLength(255)
  shopifyProductId: string;

  @ApiProperty({ example: 'pet_portrait_canvas' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Pet Portrait Canvas' })
  @IsString()
  @MaxLength(150)
  displayName: string;

  @ApiProperty({
    example: 'A high-quality canvas print of your pet.',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Style UUID to fix to this product',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  styleId?: string;

  @ApiProperty({
    description:
      'Shopify collection handle shown in the product page showcase section',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  showcaseCollectionHandle?: string;

  @ApiProperty({
    description:
      'Storefront delivery format override. Null = use default (Canvas) fallback. "PBN" is a legacy alias of "Digital".',
    enum: ['Digital', 'Canvas', 'Poster', 'Credits', 'Accessory', 'PBN'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['Digital', 'Canvas', 'Poster', 'Credits', 'Accessory', 'PBN'])
  template?: string;

  @ApiProperty({
    description:
      'Artwork content: "pbn" (paintable/colorable outline) or "print" (finished art). Null = unassigned / not applicable.',
    enum: ['pbn', 'print'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['pbn', 'print'])
  artKind?: string;
}
