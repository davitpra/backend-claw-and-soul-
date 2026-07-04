import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class SetPbnProductDto {
  @ApiProperty({
    description:
      'ID del producto que será el kit Paint-by-Numbers dedicado. null para desasignar.',
    nullable: true,
    required: false,
    example: '3f2a…',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  productId: string | null;
}
