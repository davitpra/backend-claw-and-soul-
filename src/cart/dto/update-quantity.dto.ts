import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class UpdateQuantityDto {
  @ApiProperty({
    example: 1,
    description: 'Delta to apply to the current quantity (e.g. 1 or -1)',
  })
  @IsInt()
  delta: number;
}
