import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import { GrantCreditsDto } from './dto/grant-credits.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('admin-credits')
@ApiBearerAuth()
@Controller('admin/credits')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminCreditsController {
  constructor(private readonly creditsService: CreditsService) {}

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
}
