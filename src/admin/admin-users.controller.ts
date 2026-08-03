import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminUsersService } from './admin-users.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { AccountStatusService } from '../users/account-status.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(
    private readonly usersService: AdminUsersService,
    private readonly accountStatus: AccountStatusService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all users (paginated, searchable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'active', 'banned', 'inactive', 'deleted'],
    description: 'Sin este parámetro se ocultan las cuentas dadas de baja.',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: [
      'name',
      'email',
      'credits',
      'pets',
      'generations',
      'pbn',
      'orders',
      'lastActivity',
    ],
  })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Users list retrieved' })
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.listUsers(page, limit, {
      search,
      sort,
      order,
      status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user detail with pets and photos' })
  @ApiResponse({ status: 200, description: 'User detail retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  detail(@Param('id') id: string) {
    return this.usersService.getUserDetail(id);
  }

  @Get(':id/generations')
  @ApiOperation({ summary: 'Get generations for a user (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'User generations retrieved' })
  generations(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number,
  ) {
    return this.usersService.getUserGenerations(id, page, limit);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Get orders for a user (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'User orders retrieved' })
  orders(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.usersService.getUserOrders(id, page, limit);
  }

  @Get(':id/revenue')
  @ApiOperation({ summary: 'Get paid-order revenue totals for a user' })
  @ApiResponse({ status: 200, description: 'User revenue retrieved' })
  revenue(@Param('id') id: string) {
    return this.usersService.getUserRevenue(id);
  }

  @Get(':id/shipping-address')
  @ApiOperation({
    summary: "Get the user's latest known shipping address",
    description:
      'Sale del pedido más reciente con dirección, incluidos los de invitado con su email. `null` si nunca ha comprado.',
  })
  @ApiResponse({ status: 200, description: 'Shipping address retrieved' })
  shippingAddress(@Param('id') id: string) {
    return this.usersService.getUserShippingAddress(id);
  }

  @Get(':id/paint-by-numbers')
  @ApiOperation({
    summary: 'Get saved Paint-by-Numbers for a user (paginated)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'User paint-by-numbers retrieved' })
  paintByNumbers(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number,
  ) {
    return this.usersService.getUserPaintByNumbers(id, page, limit);
  }

  @Get(':id/credit-transactions')
  @ApiOperation({
    summary: 'Get credit ledger movements for a user (paginated)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['date', 'reason', 'note', 'amount'],
  })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: 200,
    description: 'User credit transactions retrieved',
  })
  creditTransactions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.usersService.getUserCreditTransactions(id, page, limit, {
      sort,
      order,
    });
  }

  @Get(':id/sessions')
  @ApiOperation({
    summary: 'Get active sessions for a user',
    description:
      'Solo sesiones vivas (no revocadas y sin expirar). `isCurrent` únicamente se marca cuando un admin consulta su propia ficha.',
  })
  @ApiResponse({ status: 200, description: 'User sessions retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  sessions(@Param('id') id: string, @Req() req: Request) {
    const currentToken = req.cookies?.refreshToken as string | undefined;
    return this.usersService.getUserSessions(id, currentToken);
  }

  @Delete(':id/sessions/:tokenId')
  @ApiOperation({
    summary: 'Revoke a single session of a user',
    description:
      'La ventana residual del access token ya emitido es de 15 minutos.',
  })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  @ApiResponse({ status: 404, description: 'User or live session not found' })
  revokeSession(
    @Param('id') id: string,
    @Param('tokenId') tokenId: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.usersService.revokeUserSession(id, tokenId, admin.sub);
  }

  @Post(':id/sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke every live session of a user' })
  @ApiResponse({ status: 200, description: 'Sessions revoked' })
  @ApiResponse({
    status: 400,
    description: 'An admin cannot close their own sessions from here',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  revokeAllSessions(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    // Cerrarse todas las sesiones desde el panel de usuarios es un autogol sin
    // ganancia: para eso está la página de cuenta propia.
    if (id === admin.sub) {
      throw new BadRequestException(
        'Use your own account page to close your sessions.',
      );
    }
    return this.usersService.revokeAllUserSessions(id, admin.sub);
  }

  @Get(':id/audit-log')
  @ApiOperation({
    summary: 'Get the audit trail of a user (paginated)',
    description:
      '`scope=target` (por defecto) lista lo que le pasó a la cuenta; `actor`, lo que la cuenta hizo sobre otras; `all`, ambas.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['target', 'actor', 'all'],
  })
  @ApiResponse({ status: 200, description: 'User audit log retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  auditLog(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('scope') scope?: string,
  ) {
    return this.usersService.getUserAuditLog(id, page, limit, { scope });
  }

  @Get(':id/cart')
  @ApiOperation({
    summary: "Get the user's open cart",
    description:
      'Devuelve `{ cart: null }` cuando no hay carrito o está vacío. Los importes no llevan moneda: `CartItem` no la guarda.',
  })
  @ApiResponse({ status: 200, description: 'User cart retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  cart(@Param('id') id: string) {
    return this.usersService.getUserCart(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Suspend, reactivate or deactivate a user account',
    description:
      'Cerrar una cuenta revoca todas sus sesiones. La ventana residual del access token ya emitido es de 15 minutos.',
  })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 400, description: 'Invalid transition' })
  @ApiResponse({ status: 404, description: 'User not found' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.accountStatus.setStatus(id, dto.status, {
      reason: dto.reason,
      actorId: admin.sub,
    });
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a user account',
    description:
      'Bloquea el acceso y arranca la ventana de 30 días tras la cual se anonimiza el PII. No borra generaciones, PBN ni pedidos.',
  })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({ status: 400, description: 'Account already deleted' })
  softDelete(
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.accountStatus.softDelete(id, {
      actor: 'admin',
      actorId: admin.sub,
      reason: dto.reason,
    });
  }

  @Post(':id/restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted account',
    description: 'Imposible una vez que el cron de purga la ha anonimizado.',
  })
  @ApiResponse({ status: 201, description: 'Account restored' })
  @ApiResponse({
    status: 400,
    description: 'Account is not deleted or was anonymized',
  })
  restore(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.accountStatus.restore(id, admin.sub);
  }
}
