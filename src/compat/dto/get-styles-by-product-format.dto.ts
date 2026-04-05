import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetStylesByProductFormatDto {
  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID()
  product_id: string;

  @ApiProperty({ example: 'uuid-of-format' })
  @IsUUID()
  format_id: string;
}
