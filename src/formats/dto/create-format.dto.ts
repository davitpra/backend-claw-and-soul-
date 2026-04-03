import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, MaxLength, Min } from 'class-validator';

export class CreateFormatDto {
  @ApiProperty({ example: 'square_1x1' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Square 1:1' })
  @IsString()
  @MaxLength(150)
  displayName: string;

  @ApiProperty({ example: '1:1' })
  @IsString()
  @MaxLength(20)
  aspectRatio: string;

  @ApiProperty({ example: 1024 })
  @IsInt()
  @Min(1)
  width: number;

  @ApiProperty({ example: 1024 })
  @IsInt()
  @Min(1)
  height: number;
}
