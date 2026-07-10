import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class GrantCreditsDto {
  @ApiProperty({ description: 'ID del usuario que recibe los créditos' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  amount: number;

  @ApiProperty({ required: false, example: 'Compensación por incidencia' })
  @IsOptional()
  @IsString()
  note?: string;
}
