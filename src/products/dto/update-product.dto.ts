import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 'in_house', enum: ['in_house', 'pod'], required: false })
  @IsOptional()
  @IsString()
  @IsIn(['in_house', 'pod'])
  fulfillmentMethod?: string;
}
