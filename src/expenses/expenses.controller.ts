import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { ProviderRateService } from './provider-rate.service';
import { ManualExpenseDto } from './dto/manual-expense.dto';
import { UpdateRateDto } from './dto/update-rate.dto';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller()
@UseGuards(RolesGuard)
@Roles('admin')
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly providerRateService: ProviderRateService,
  ) {}

  @Get('admin/expenses/summary')
  getSummary(@Query('period') period: '7d' | '30d' | '90d' | 'all') {
    return this.expensesService.globalSummary(period ?? '30d');
  }

  @Get('admin/orders/:orderId/expenses')
  getOrderExpenses(@Param('orderId') orderId: string) {
    return this.expensesService.listForOrder(orderId);
  }

  @Post('admin/orders/:orderId/expenses')
  @HttpCode(HttpStatus.CREATED)
  addManualExpense(
    @Param('orderId') orderId: string,
    @Body() dto: ManualExpenseDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.expensesService.recordManual({
      orderId,
      amount: dto.amount,
      currency: dto.currency,
      note: dto.note,
      createdBy: user.id,
    });
  }

  @Delete('admin/expenses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteExpense(@Param('id') id: string) {
    try {
      await this.expensesService.deleteExpense(id);
    } catch {
      throw new NotFoundException('Expense not found');
    }
  }

  @Get('admin/users/:userId/expenses')
  getUserExpenses(@Param('userId') userId: string) {
    return this.expensesService.customerSummary(userId);
  }

  @Post('admin/expenses/backfill-generations')
  backfillGenerations() {
    return this.expensesService.backfillGenerationCosts();
  }

  @Get('admin/expense-rates')
  getRates() {
    return this.providerRateService.list();
  }

  @Patch('admin/expense-rates/:id')
  updateRate(
    @Param('id') id: string,
    @Body() dto: UpdateRateDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.providerRateService.upsertById(id, dto, user.id);
  }
}
