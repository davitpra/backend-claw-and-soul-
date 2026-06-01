import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PodConfigDto } from './pod-config.dto';

export class LinkVariantDto {
  @ApiProperty({ example: '12345678901234' })
  @IsString()
  @IsNotEmpty()
  shopifyVariantId: string;

  @ApiProperty({ example: '8x10' })
  @IsString()
  @IsNotEmpty()
  shopifyVariantTitle: string;

  @ApiProperty({ description: 'Format UUID to assign' })
  @IsUUID()
  formatId: string;

  @ApiPropertyOptional({
    example: '8x10',
    description:
      'Shopify option1 value to persist on the Format for future auto-linking',
  })
  @IsString()
  @IsOptional()
  shopifyVariantOption?: string;

  @ApiPropertyOptional({
    description:
      'Pictorem POD config for this variant (material, type, dimensions, options)',
    type: PodConfigDto,
  })
  @ValidateNested()
  @Type(() => PodConfigDto)
  @IsOptional()
  podConfig?: PodConfigDto;
}
