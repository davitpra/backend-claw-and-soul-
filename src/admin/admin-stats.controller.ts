import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminStatsService } from './admin-stats.service';
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
  @ApiResponse({ status: 200, description: 'Overview stats retrieved' })
  getOverview() {
    return this.statsService.getOverview();
  }
}
