import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateQuantityDto } from './dto/update-quantity.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's cart" })
  @ApiResponse({ status: 200, description: 'Cart retrieved successfully' })
  getCart(@CurrentUser() user: JwtPayload) {
    return this.cartService.getCart(user.sub);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add an item to the cart (dedup + increment)' })
  @ApiResponse({ status: 201, description: 'Item added successfully' })
  addItem(@CurrentUser() user: JwtPayload, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.sub, dto);
  }

  @Patch('items')
  @ApiOperation({ summary: 'Update quantity of cart items by variantId' })
  @ApiQuery({ name: 'variantId', required: true })
  @ApiResponse({ status: 200, description: 'Quantity updated successfully' })
  updateQuantity(
    @CurrentUser() user: JwtPayload,
    @Query('variantId') variantId: string,
    @Body() dto: UpdateQuantityDto,
  ) {
    return this.cartService.updateQuantity(user.sub, variantId, dto.delta);
  }

  @Delete('items')
  @ApiOperation({ summary: 'Remove cart items by variantId' })
  @ApiQuery({ name: 'variantId', required: true })
  @ApiResponse({ status: 200, description: 'Item removed successfully' })
  removeItem(
    @CurrentUser() user: JwtPayload,
    @Query('variantId') variantId: string,
  ) {
    return this.cartService.removeItem(user.sub, variantId);
  }

  @Patch('image')
  @ApiOperation({ summary: 'Set imageUrl on items matching a generationId' })
  @ApiResponse({ status: 200, description: 'Image updated successfully' })
  updateImage(@CurrentUser() user: JwtPayload, @Body() dto: UpdateImageDto) {
    return this.cartService.updateImage(user.sub, dto.generationId, dto.imageUrl);
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge guest cart items into the user cart' })
  @ApiResponse({ status: 201, description: 'Cart merged successfully' })
  merge(@CurrentUser() user: JwtPayload, @Body() dto: MergeCartDto) {
    return this.cartService.merge(user.sub, dto.items);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear the cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared successfully' })
  clear(@CurrentUser() user: JwtPayload) {
    return this.cartService.clear(user.sub);
  }
}
