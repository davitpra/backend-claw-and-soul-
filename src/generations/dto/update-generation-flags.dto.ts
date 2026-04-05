import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateGenerationFlagsDto {
  @ApiProperty({ description: 'Make generation public', required: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({ description: 'Mark generation as favorite', required: false })
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
