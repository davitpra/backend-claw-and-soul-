import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';

/**
 * Liveness probe para el healthcheck de la plataforma.
 *
 * A propósito no toca la base de datos ni Redis: si el healthcheck fallara por
 * una caída pasajera de Postgres, la plataforma reiniciaría el contenedor en
 * bucle en vez de dejar que la app se recupere sola. El estado de las
 * dependencias se consulta en /api/admin/sync/health.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
