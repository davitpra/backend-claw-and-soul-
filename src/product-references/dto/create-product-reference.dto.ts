import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateProductReferenceDto {
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

  @ApiProperty({ example: 'A high-quality canvas print of your pet.', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
