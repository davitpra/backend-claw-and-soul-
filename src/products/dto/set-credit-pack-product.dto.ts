import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class SetCreditPackProductDto {
  @ApiProperty({
    description:
      'ID del producto que será el pack de créditos dedicado. null para desasignar.',
    nullable: true,
    required: false,
    example: '3f2a…',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  productId: string | null;
}
