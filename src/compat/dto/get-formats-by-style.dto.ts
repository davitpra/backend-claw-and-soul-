import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetFormatsByStyleDto {
  @ApiProperty({ example: 'uuid-of-style' })
  @IsUUID()
  style_id: string;
}
