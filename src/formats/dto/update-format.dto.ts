import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateFormatDto {
  @ApiProperty({ example: 'Square 1:1', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  displayName?: string;

  @ApiProperty({ example: 1024, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @ApiProperty({ example: 1024, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
