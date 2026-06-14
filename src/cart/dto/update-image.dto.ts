import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateImageDto {
  @ApiProperty({ description: 'generationId of the cart item(s) to update' })
  @IsString()
  @MaxLength(255)
  generationId: string;

  @ApiProperty({ description: 'Final image URL for the AI-generated product' })
  @IsString()
  @MaxLength(1000)
  imageUrl: string;
}
