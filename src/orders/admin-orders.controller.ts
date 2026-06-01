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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { PodService } from './pod/pod.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ORDERS_QUEUE,
  ORDERS_JOB_NAMES,
  ORDERS_JOB_OPTIONS,
} from './constants/queues.constants';

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
    private readonly podService: PodService,
    @InjectQueue(ORDERS_QUEUE) private readonly ordersQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List orders (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'method', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('q') q?: string,
  ) {
    return this.adminOrdersService.listOrders(page, limit, {
      status,
      method,
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

  @Get('pod/health')
  @ApiOperation({
    summary: 'Test connectivity for all registered POD providers',
  })
  async podHealth() {
    return this.podService.testConnection();
  }

  @Get('pod/providers')
  @ApiOperation({ summary: 'List available POD provider names' })
  podProviders() {
    return { providers: this.podService.listProviders() };
  }

  @Get('pod/catalog')
  @ApiOperation({ summary: 'Get Pictorem product catalog (materials, types, sizes, options)' })
  podCatalog() {
    return this.podService.getCatalog();
  }

  @Get('pod/settings')
  @ApiOperation({ summary: 'Get current POD auto-fulfillment enabled state' })
  async podSettingsGet() {
    return await this.podService.getPodEnabled();
  }

  @Patch('pod/settings')
  @ApiOperation({
    summary: 'Enable or disable POD auto-fulfillment at runtime',
  })
  async podSettingsPatch(
    @Body('enabled') enabled: boolean,
    @CurrentUser() user?: { id: string },
  ) {
    return await this.podService.setPodEnabled(enabled, user?.id);
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

  @Patch(':id/items/:itemId/tracking')
  @ApiOperation({ summary: 'Set tracking info for an order item' })
  updateTracking(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body('trackingNumber') trackingNumber: string,
    @Body('trackingUrl') trackingUrl?: string,
    @Body('trackingCarrier') trackingCarrier?: string,
    @CurrentUser() user?: { id: string },
  ) {
    return this.ordersService.updateItemTracking(
      orderId,
      itemId,
      { trackingNumber, trackingUrl, trackingCarrier },
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
  ) {
    return this.ordersService.linkGenerationToItem(
      orderId,
      itemId,
      generationId,
    );
  }

  @Post(':id/items/:itemId/pod/submit')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Enqueue POD submission (or re-submit) for an order item to Pictorem',
  })
  async podSubmit(
    @Param('itemId') itemId: string,
    @Body('force') force?: boolean,
  ) {
    await this.ordersQueue.add(
      ORDERS_JOB_NAMES.POD_SUBMIT,
      { orderItemId: itemId, force: force ?? false, manual: true },
      ORDERS_JOB_OPTIONS,
    );
    return { ok: true, queued: true, orderItemId: itemId };
  }

  @Post(':id/items/:itemId/pod/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Immediately sync POD status + tracking for an order item from Pictorem',
  })
  async podSync(@Param('itemId') itemId: string) {
    await this.podService.syncItem(itemId);
    return { ok: true, orderItemId: itemId };
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
    return this.ordersService.updateItemPrintImage(
      orderId,
      itemId,
      file,
      user?.id,
    );
  }
}
