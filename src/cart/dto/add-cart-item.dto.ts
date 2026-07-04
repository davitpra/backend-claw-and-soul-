import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ example: 'gid://shopify/ProductVariant/123' })
  @IsString()
  @MaxLength(255)
  variantId: string;

  @ApiProperty({ example: 'Watercolor Portrait 12x16' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: '12x16', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  size?: string;

  @ApiProperty({ example: 'Watercolor', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  style?: string;

  @ApiProperty({ example: 'Black', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string;

  @ApiProperty({ example: 49.99 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 1, required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ example: 'https://cdn.shopify.com/...' })
  @IsString()
  @MaxLength(1000)
  img: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  generationId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  paintByNumbersId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string;
}
