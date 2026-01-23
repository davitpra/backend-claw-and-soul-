import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreatePetDto {
  @ApiProperty({ example: 'Max' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'dog',
    enum: ['dog', 'cat', 'bird', 'rabbit', 'other'],
  })
  @IsString()
  @IsIn(['dog', 'cat', 'bird', 'rabbit', 'other'])
  species: string;

  @ApiProperty({ example: 'Golden Retriever', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  breed?: string;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsInt()
  age?: number;

  @ApiProperty({ example: 'Friendly and playful', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
