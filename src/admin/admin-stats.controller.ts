import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminStatsService } from './admin-stats.service';
import { STATS_PERIODS, isStatsPeriod } from './stats/period.util';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('admin-stats')
@ApiBearerAuth()
@Controller('admin/stats')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get admin dashboard overview stats' })
  @ApiQuery({ name: 'period', required: false, enum: STATS_PERIODS })
  @ApiResponse({ status: 200, description: 'Overview stats retrieved' })
  getOverview(@Query('period') period?: string) {
    // Un periodo inválido cae al default en vez de dar 400: es un parámetro de
    // presentación, y un dashboard en blanco por un typo no ayuda a nadie.
    return this.statsService.getOverview(
      isStatsPeriod(period) ? period : '30d',
    );
  }
}
