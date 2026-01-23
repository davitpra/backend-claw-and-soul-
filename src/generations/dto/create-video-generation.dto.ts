import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsInt, Min, Max, IsOptional } from 'class-validator';

export class CreateVideoGenerationDto {
  @ApiProperty({ description: 'Source generation ID (must be an image)' })
  @IsUUID()
  sourceGenerationId: string;

  @ApiProperty({ description: 'Video duration in seconds', default: 3 })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(10)
  duration?: number;

  @ApiProperty({
    description: 'Motion intensity',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsString()
  motion?: string;

  @ApiProperty({ description: 'AI provider', default: 'runway' })
  @IsOptional()
  @IsString()
  provider?: string;
}
