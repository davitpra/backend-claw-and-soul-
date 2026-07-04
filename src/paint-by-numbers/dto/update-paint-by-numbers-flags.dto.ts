import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdatePaintByNumbersFlagsDto {
  @ApiProperty({ description: 'Make the PBN public', required: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
