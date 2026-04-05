import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetProductsByStyleFormatDto {
  @ApiProperty({ example: 'uuid-of-style' })
  @IsUUID()
  style_id: string;

  @ApiProperty({ example: 'uuid-of-format' })
  @IsUUID()
  format_id: string;
}
