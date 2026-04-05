import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsObject } from 'class-validator';

export class CreateCompatRuleDto {
  @ApiProperty({ example: 'uuid-of-style' })
  @IsUUID()
  style_id: string;

  @ApiProperty({ example: 'uuid-of-format' })
  @IsUUID()
  format_id: string;

  @ApiProperty({ example: 'uuid-of-product-ref' })
  @IsUUID()
  product_ref_id: string;

  @ApiProperty({ example: { max_dpi: 300 }, required: false })
  @IsOptional()
  @IsObject()
  constraints?: Record<string, any>;
}
