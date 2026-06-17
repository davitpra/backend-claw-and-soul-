import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserOrdersService } from './user-orders.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly userOrdersService: UserOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List current user orders' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.userOrdersService.listUserOrders(user.sub, page, limit);
  }

  // Must be declared before ':id' so it is not captured as an order id.
  @Get('default-address')
  @ApiOperation({ summary: "Get current user's default shipping address" })
  @ApiResponse({ status: 200, description: 'Returns { address }' })
  getDefaultAddress(@CurrentUser() user: JwtPayload) {
    return this.userOrdersService.getDefaultAddress(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of the current user orders' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Order belongs to another user' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.userOrdersService.getUserOrder(user.sub, id);
  }
}
