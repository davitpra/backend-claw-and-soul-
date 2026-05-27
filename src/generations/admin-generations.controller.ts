import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { StrategyRegistry } from './pipeline/strategy.registry';

@ApiTags('admin-generations')
@ApiBearerAuth()
@Controller('admin/strategies')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminGenerationsController {
  constructor(private readonly registry: StrategyRegistry) {}

  @Get()
  @ApiOperation({ summary: 'List registered pipeline strategy keys' })
  list(): string[] {
    return this.registry.listKeys();
  }
}
