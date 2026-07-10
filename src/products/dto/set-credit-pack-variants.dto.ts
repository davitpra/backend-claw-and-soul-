import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreditPackVariantEntryDto {
  @ApiProperty({ description: 'ID numérico de la variante Shopify' })
  @IsString()
  @MaxLength(64)
  shopifyVariantId: string;

  @ApiProperty({
    description: 'Créditos que otorga esta variante',
    example: 10,
  })
  @IsInt()
  @Min(1)
  creditAmount: number;
}

export class SetCreditPackVariantsDto {
  @ApiProperty({
    type: [CreditPackVariantEntryDto],
    description:
      'Mapeo completo variante→créditos. Reemplaza el mapeo actual: las variantes ausentes se borran.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditPackVariantEntryDto)
  variants: CreditPackVariantEntryDto[];
}
