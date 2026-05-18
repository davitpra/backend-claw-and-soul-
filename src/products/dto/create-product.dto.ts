import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';

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

  @ApiProperty({ description: 'Style UUID to fix to this product', required: false })
  @IsOptional()
  @IsUUID()
  styleId?: string;

  @ApiProperty({ description: 'ProductType UUID', required: false })
  @IsOptional()
  @IsUUID()
  productTypeId?: string;
}
