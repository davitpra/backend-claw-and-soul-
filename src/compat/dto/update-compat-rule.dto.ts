import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsObject, IsBoolean } from 'class-validator';

export class UpdateCompatRuleDto {
  @ApiProperty({ example: { max_dpi: 300 }, required: false })
  @IsOptional()
  @IsObject()
  constraints?: Record<string, any>;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
