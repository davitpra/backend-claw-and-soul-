import { Controller, Post, Get, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SyncService } from './sync.service';

@ApiTags('admin-sync')
@ApiBearerAuth()
@Controller('admin/products/sync')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminSyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  @ApiOperation({ summary: 'Trigger a manual Shopify product sync' })
  triggerSync() {
    return this.syncService.triggerManualSync();
  }

  @Get('status')
  @ApiOperation({ summary: 'Get last sync status' })
  getStatus() {
    return this.syncService.getLastSyncStatus();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get sync history' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getHistory(@Query('limit') limit?: number) {
    return this.syncService.getSyncHistory(limit ? Number(limit) : 20);
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check for sync subsystem' })
  getHealth() {
    return this.syncService.getHealthStatus();
  }
}
