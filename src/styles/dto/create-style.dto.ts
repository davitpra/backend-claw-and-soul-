import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateStyleDto {
  @ApiProperty({ example: 'watercolor_classic' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Watercolor Classic' })
  @IsString()
  @MaxLength(150)
  displayName: string;

  @ApiProperty({ example: 'watercolor' })
  @IsString()
  @MaxLength(100)
  category: string;

  @ApiProperty({
    example: 'https://cdn.example.com/thanks/watercolor.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  thanksUrl?: string;

  @ApiProperty({ example: 'default', required: false })
  @IsOptional()
  @IsString()
  strategyKey?: string;

  @ApiProperty({
    example: 'uuid-of-vision-config',
    description: 'ID of the VisionConfig to use for this style',
    required: false,
  })
  @IsOptional()
  @IsString()
  visionConfigId?: string;

  @ApiProperty({
    example: 'uuid-of-image-gen-config',
    description: 'ID of the ImageGenConfig to use for this style',
    required: false,
  })
  @IsOptional()
  @IsString()
  imageGenConfigId?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
