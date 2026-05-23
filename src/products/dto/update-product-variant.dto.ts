import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateProductVariantDto {
  @ApiPropertyOptional({ description: 'Format UUID to assign' })
  @IsUUID()
  @IsOptional()
  formatId?: string;

  @ApiPropertyOptional({
    description: 'Activate or deactivate the variant link',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
