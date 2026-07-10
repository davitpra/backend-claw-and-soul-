import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('credits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Saldo de créditos de generación del usuario' })
  async getMyBalance(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ balance: number }> {
    const balance = await this.creditsService.getBalance(user.sub);
    return { balance };
  }
}
