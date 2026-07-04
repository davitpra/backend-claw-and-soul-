import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  FileInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOrdersService } from './admin-orders.service';
import { OrdersService } from './orders.service';
import { OrdersSyncService } from './orders-sync.service';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';
import { ImageEnhancementService } from './image-enhancement.service';
import { EnhanceDto } from './dto/enhance.dto';
import { PICTOREM_CATALOG } from './pod/catalog/pictorem-catalog';

@ApiTags('admin-orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(
    private readonly adminOrdersService: AdminOrdersService,
    private readonly ordersService: OrdersService,
    private readonly ordersSyncService: OrdersSyncService,
    private readonly shopifyApiService: ShopifyApiService,
    private readonly imageEnhancementService: ImageEnhancementService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List orders (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'method', required: false, type: String })
  @ApiQuery({ name: 'fulfillmentStatus', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('fulfillmentStatus') fulfillmentStatus?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('q') q?: string,
  ) {
    return this.adminOrdersService.listOrders(page, limit, {
      status,
      method,
      fulfillmentStatus,
      dateFrom,
      dateTo,
      q,
    });
  }

  @Get('stats/summary')
  @ApiOperation({ summary: 'Order KPI summary' })
  @ApiQuery({ name: 'period', required: false, enum: ['7d', '30d', '90d'] })
  stats(@Query('period') period?: '7d' | '30d' | '90d') {
    return this.adminOrdersService.getStats(period ?? '30d');
  }

  @Get('sync/status')
  @ApiOperation({ summary: 'Last orders sync log' })
  syncStatus() {
    return this.ordersSyncService.getLastSyncStatus();
  }

  @Post('sync')
  @ApiOperation({ summary: 'Trigger order backfill from Shopify' })
  triggerSync(@Body('since') since?: string) {
    return this.ordersSyncService.triggerBackfill(since);
  }

  @Get('pod/catalog')
  @ApiOperation({
    summary:
      'Catálogo estático de impresión (materiales, tipos, tamaños, opciones) para configurar variantes',
  })
  podCatalog() {
    return PICTOREM_CATALOG;
  }

  @Get('pod/providers')
  @ApiOperation({ summary: 'Lista de proveedores de impresión disponibles' })
  podProviders() {
    return { providers: ['pictorem'] };
  }

  @Get('production/queue')
  @ApiOperation({
    summary: 'Production queue: active orders (FIFO) with their prints',
  })
  @ApiQuery({ name: 'method', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  productionQueue(@Query('method') method?: string, @Query('q') q?: string) {
    return this.adminOrdersService.listProductionQueue({ method, q });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order detail' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async detail(@Param('id') id: string) {
    const order = await this.adminOrdersService.getOrderDetail(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  @Patch(':id/items/:itemId/status')
  @ApiOperation({ summary: 'Transition production status of an order item' })
  updateStatus(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body('toStatus') toStatus: string,
    @Body('notes') notes?: string,
    @CurrentUser() user?: { id: string },
  ) {
    return this.ordersService.transitionItemStatus(
      orderId,
      itemId,
      toStatus,
      notes,
      user?.id,
    );
  }

  @Patch(':id/items/:itemId/fulfillment')
  @ApiOperation({
    summary: 'Override fulfillment method of an order item (in_house | pod)',
  })
  updateFulfillmentMethod(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body('fulfillmentMethod') fulfillmentMethod: 'in_house' | 'pod',
    @CurrentUser() user?: { id: string },
  ) {
    return this.ordersService.updateItemFulfillmentMethod(
      orderId,
      itemId,
      fulfillmentMethod,
      user?.id,
    );
  }

  @Post(':id/resync')
  @ApiOperation({ summary: 'Re-sync a single order from Shopify' })
  async resync(@Param('id') id: string) {
    const order = await this.adminOrdersService.getOrderDetail(id);
    if (!order) throw new NotFoundException('Order not found');

    const shopifyOrder = await this.shopifyApiService.fetchOrderById(
      order.shopifyOrderId,
    );
    if (!shopifyOrder)
      throw new NotFoundException('Order not found in Shopify');

    await this.ordersService.ingestShopifyOrder(
      shopifyOrder,
      undefined,
      'manual_resync',
    );
    return { ok: true };
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel order items (reflects in Shopify strictly, Pictorem best-effort)',
  })
  cancel(
    @Param('id') orderId: string,
    @Body('itemIds') itemIds?: string[],
    @Body('reason') reason?: string,
    @Body('refund') refund?: boolean,
    @Body('restock') restock?: boolean,
    @CurrentUser() user?: { id: string },
  ) {
    return this.ordersService.cancelOrderItems(orderId, {
      itemIds,
      reason,
      refund,
      restock,
      adminUserId: user?.id,
    });
  }

  @Post(':id/link-user')
  @ApiOperation({ summary: 'Manually link an order to a user' })
  linkUser(@Param('id') orderId: string, @Body('userId') userId: string) {
    return this.ordersService.linkUserToOrder(orderId, userId);
  }

  @Post(':id/items/:itemId/link-generation')
  @ApiOperation({ summary: 'Manually link an order item to a generation' })
  linkGeneration(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body('generationId') generationId: string,
    @CurrentUser() user?: { id: string },
  ) {
    return this.ordersService.linkGenerationToItem(
      orderId,
      itemId,
      generationId,
      user?.id,
    );
  }

  @Post(':id/items/:itemId/unlink-generation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Unlink the generation from an order item (does not delete the generation)',
  })
  unlinkGeneration(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user?: { id: string },
  ) {
    return this.ordersService.unlinkGenerationFromItem(
      orderId,
      itemId,
      user?.id,
    );
  }

  @Patch(':id/production-cost')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save the production cost for an order' })
  updateProductionCost(
    @Param('id') id: string,
    @Body('productionCost') value: number | null,
  ) {
    return this.adminOrdersService.updateProductionCost(id, value);
  }

  @Post(':id/items/:itemId/print-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Upload a print/POD override image for an order item',
  })
  @ApiResponse({ status: 201, description: 'Print image uploaded' })
  uploadPrintImage(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user?: { id: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!file.mimetype.startsWith('image/'))
      throw new BadRequestException('File must be an image');
    // Cloudinary (plan gratuito) rechaza imágenes de más de 10 MB. Validamos
    // aquí para devolver un mensaje claro en vez de un 500 genérico.
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      throw new BadRequestException(
        `La imagen pesa ${mb} MB y supera el máximo de 10 MB. ` +
          `Súbela como JPEG o reduce su tamaño antes de reemplazarla.`,
      );
    }
    return this.ordersService.updateItemPrintImage(
      orderId,
      itemId,
      file,
      user?.id,
    );
  }

  @Post(':id/items/:itemId/paint-by-numbers')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'source', maxCount: 1 },
      { name: 'svg', maxCount: 1 },
      { name: 'preview', maxCount: 1 },
      { name: 'palette', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Save a Paint-by-Numbers rendered in the studio onto the item',
  })
  @ApiResponse({ status: 201, description: 'PBN saved and linked to the item' })
  savePaintByNumbers(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @UploadedFiles()
    files: {
      source?: Express.Multer.File[];
      svg?: Express.Multer.File[];
      preview?: Express.Multer.File[];
      palette?: Express.Multer.File[];
    },
    @Body('config') config: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.ordersService.attachPbnToItem(
      orderId,
      itemId,
      user.sub,
      {
        source: files.source?.[0],
        svg: files.svg?.[0],
        preview: files.preview?.[0],
        palette: files.palette?.[0],
      },
      config,
    );
  }

  @Post(':id/items/:itemId/generation-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: "Overwrite the linked customer generation's image for an item",
  })
  @ApiResponse({ status: 201, description: 'Generation image replaced' })
  uploadGenerationImage(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user?: { id: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!file.mimetype.startsWith('image/'))
      throw new BadRequestException('File must be an image');
    // Cloudinary (plan gratuito) rechaza imágenes de más de 10 MB. Validamos
    // aquí para devolver un mensaje claro en vez de un 500 genérico.
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      throw new BadRequestException(
        `La imagen pesa ${mb} MB y supera el máximo de 10 MB. ` +
          `Súbela como JPEG o reduce su tamaño antes de reemplazarla.`,
      );
    }
    return this.ordersService.replaceItemGenerationImage(
      orderId,
      itemId,
      file,
      user?.id,
    );
  }

  @Get(':id/items/:itemId/enhance-info')
  @ApiOperation({
    summary:
      'Print-readiness info (source, pixel dims, print size, DPI) for an item',
  })
  getEnhanceInfo(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.imageEnhancementService.getEnhanceInfo(orderId, itemId);
  }

  @Post(':id/items/:itemId/enhance-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Build a non-committed preview URL for the requested adjustments',
  })
  enhancePreview(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() options: EnhanceDto,
  ) {
    return this.imageEnhancementService.previewEnhance(
      orderId,
      itemId,
      options,
    );
  }

  @Post(':id/items/:itemId/enhance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Enhance/upscale the print image and persist it for POD submission',
  })
  enhance(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() options: EnhanceDto,
    @CurrentUser() user?: { id: string },
  ) {
    return this.imageEnhancementService.applyEnhance(
      orderId,
      itemId,
      options,
      user?.id,
    );
  }

  @Post(':id/items/:itemId/enhance/revert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revert to the original image (drop the enhanced print image)',
  })
  enhanceRevert(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user?: { id: string },
  ) {
    return this.imageEnhancementService.revertEnhance(
      orderId,
      itemId,
      user?.id,
    );
  }
}
