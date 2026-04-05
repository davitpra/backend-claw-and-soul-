import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetFormatsByProductDto {
  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID()
  product_id: string;
}
