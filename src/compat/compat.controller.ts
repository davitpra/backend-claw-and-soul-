import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CompatService } from './compat.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('compat')
@Controller('compat')
export class CompatController {
  constructor(private readonly compatService: CompatService) {}

  @Public()
  @Get('formats')
  @ApiOperation({ summary: 'Formats available for a product (Flujo 1, step 1)' })
  @ApiQuery({ name: 'product_id', required: true, type: String })
  getFormatsByProduct(@Query('product_id') productId: string) {
    return this.compatService.getFormatsByProduct(productId);
  }

  @Public()
  @Get('styles')
  @ApiOperation({ summary: 'Styles compatible with product+format (Flujo 1, step 2)' })
  @ApiQuery({ name: 'product_id', required: true, type: String })
  @ApiQuery({ name: 'format_id', required: true, type: String })
  getStylesByProductAndFormat(
    @Query('product_id') productId: string,
    @Query('format_id') formatId: string,
  ) {
    return this.compatService.getStylesByProductAndFormat(productId, formatId);
  }

  @Public()
  @Get('formats-by-style')
  @ApiOperation({ summary: 'Formats available for a style (Flujo 2, step 1)' })
  @ApiQuery({ name: 'style_id', required: true, type: String })
  getFormatsByStyle(@Query('style_id') styleId: string) {
    return this.compatService.getFormatsByStyle(styleId);
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Products compatible with style+format (Flujo 2, step 2)' })
  @ApiQuery({ name: 'style_id', required: true, type: String })
  @ApiQuery({ name: 'format_id', required: true, type: String })
  getProductsByStyleAndFormat(
    @Query('style_id') styleId: string,
    @Query('format_id') formatId: string,
  ) {
    return this.compatService.getProductsByStyleAndFormat(styleId, formatId);
  }

  @Public()
  @Get('check')
  @ApiOperation({ summary: 'Validate a style+format+product combination (both flows)' })
  @ApiQuery({ name: 'style_id', required: true, type: String })
  @ApiQuery({ name: 'format_id', required: true, type: String })
  @ApiQuery({ name: 'product_id', required: true, type: String })
  checkCompat(
    @Query('style_id') styleId: string,
    @Query('format_id') formatId: string,
    @Query('product_id') productId: string,
  ) {
    return this.compatService.checkCompat(styleId, formatId, productId);
  }
}
