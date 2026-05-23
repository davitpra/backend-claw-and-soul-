import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateStyleImageDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  altImage?: string;
}
