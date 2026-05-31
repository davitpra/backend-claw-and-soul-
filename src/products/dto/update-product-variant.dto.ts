import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PodConfigDto } from './pod-config.dto';

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

  @ApiPropertyOptional({
    description: 'POD provider name for this variant (e.g. "pictorem")',
    example: 'pictorem',
  })
  @IsString()
  @IsOptional()
  podProvider?: string | null;

  @ApiPropertyOptional({
    description: 'POD config for this variant (shape depends on the provider)',
    type: PodConfigDto,
  })
  @ValidateNested()
  @Type(() => PodConfigDto)
  @IsOptional()
  podConfig?: PodConfigDto;
}
