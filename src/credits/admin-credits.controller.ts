import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import {
  CreditEconomicsService,
  EconomicsPeriod,
} from './credit-economics.service';
import { GrantCreditsDto } from './dto/grant-credits.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

const PERIODS: EconomicsPeriod[] = ['3d', '7d', '30d', '90d', 'all'];

@ApiTags('admin-credits')
@ApiBearerAuth()
@Controller('admin/credits')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminCreditsController {
  constructor(
    private readonly creditsService: CreditsService,
    private readonly economicsService: CreditEconomicsService,
  ) {}

  @Post('grant')
  @ApiOperation({ summary: 'Acreditar créditos de generación a un usuario' })
  async grant(
    @Body() dto: GrantCreditsDto,
  ): Promise<{ granted: boolean; balance: number }> {
    // admin_grant usa referenceId null → repetible (cada grant manual cuenta).
    const granted = await this.creditsService.grant(
      dto.userId,
      dto.amount,
      'admin_grant',
      null,
      dto.note,
    );
    const balance = await this.creditsService.getBalance(dto.userId);
    return { granted, balance };
  }

  @Get('economics')
  @ApiOperation({
    summary: 'Costo real por crédito y pasivo de los créditos en circulación',
  })
  @ApiQuery({ name: 'period', required: false, enum: PERIODS })
  economics(@Query('period') period?: string) {
    const safe = PERIODS.includes(period as EconomicsPeriod)
      ? (period as EconomicsPeriod)
      : 'all';
    return this.economicsService.globalEconomics(safe);
  }

  @Get('economics/:userId')
  @ApiOperation({
    summary: 'Créditos de un usuario traducidos a dinero (costo interno)',
  })
  userEconomics(@Param('userId') userId: string) {
    return this.economicsService.userEconomics(userId);
  }
}
