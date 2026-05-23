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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminOrdersService } from './admin-orders.service';
import { OrdersService } from './orders.service';
import { OrdersSyncService } from './orders-sync.service';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';

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
}
