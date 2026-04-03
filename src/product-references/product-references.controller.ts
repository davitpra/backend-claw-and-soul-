import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProductReferencesService } from './product-references.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('product-references')
@Controller('product-references')
export class ProductReferencesController {
  constructor(private readonly productReferencesService: ProductReferencesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all active product references' })
  findAll() {
    return this.productReferencesService.findActive();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get product reference by ID' })
  findOne(@Param('id') id: string) {
    return this.productReferencesService.findOne(id);
  }
}
