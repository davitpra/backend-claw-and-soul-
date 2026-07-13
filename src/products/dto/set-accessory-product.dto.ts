import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAccessoryProductDto {
  @ApiProperty({
    description:
      'Si el producto es un accesorio PBN (pinturas, pinceles, etc.). No es único: pueden existir muchos.',
    example: true,
  })
  @IsBoolean()
  isAccessory: boolean;
}
