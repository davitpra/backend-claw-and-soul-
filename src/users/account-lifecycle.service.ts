import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AccountStatusService } from './account-status.service';

/** Cuántas cuentas se procesan por ejecución, para acotar el trabajo del cron. */
const BATCH_SIZE = 250;

/** Días entre la baja lógica y la anonimización del PII. */
const PURGE_GRACE_DAYS = 30;

/**
 * Mantenimiento automático del ciclo de vida de las cuentas:
 * desactivación por inactividad y purga del PII de las cuentas dadas de baja.
 *
 * Modelado sobre `AuthCleanupService`. Va desactivado salvo que
 * `ACCOUNT_LIFECYCLE_ENABLED=true`, para que un entorno de desarrollo con datos
 * viejos no dé de baja a nadie por accidente.
 */
@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accountStatus: AccountStatusService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<string>('ACCOUNT_LIFECYCLE_ENABLED') === 'true';
  }

  private get inactivityMonths(): number {
    const raw = Number(this.config.get<string>('INACTIVITY_MONTHS'));
    return Number.isFinite(raw) && raw >= 0 ? raw : 24;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleDailySweep(): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(
        'Account lifecycle sweep skipped (ACCOUNT_LIFECYCLE_ENABLED is not true)',
      );
      return;
    }

    await this.runInactivitySweep();
    await this.runPurgeSweep();
  }

  /**
   * Marca como `inactive` las cuentas sin señales de vida desde hace
   * `INACTIVITY_MONTHS`. Los admins quedan fuera: perder el acceso admin por no
   * loguearse durante dos años sería un modo de fallo mucho peor que el problema
   * que resuelve.
   *
   * Público para poder dispararlo a mano, igual que `AuthCleanupService.manualCleanup`.
   */
  async runInactivitySweep(): Promise<number> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - this.inactivityMonths);

    // `lastLoginAt` solo se escribe al hacer login, nunca al rotar el refresh
    // token: alguien que use la app a diario durante meses sin volver a
    // autenticarse parecería inactivo. Por eso también se exige que no haya
    // ninguna sesión creada después del corte.
    const candidates = await this.prisma.user.findMany({
      where: {
        status: 'active',
        role: { not: 'admin' },
        OR: [
          { lastLoginAt: { lt: cutoff } },
          { lastLoginAt: null, createdAt: { lt: cutoff } },
        ],
        refreshTokens: { none: { createdAt: { gte: cutoff } } },
      },
      select: { id: true },
      take: BATCH_SIZE,
    });

    let deactivated = 0;

    for (const candidate of candidates) {
      try {
        await this.accountStatus.deactivateForInactivity(candidate.id);
        deactivated += 1;
      } catch (error) {
        this.logger.error(
          `Failed to deactivate inactive user ${candidate.id}`,
          error,
        );
      }
    }

    this.logger.log(
      `Inactivity sweep: ${deactivated}/${candidates.length} accounts deactivated (cutoff ${cutoff.toISOString()})`,
    );

    return deactivated;
  }

  /**
   * Anonimiza el PII de las cuentas dadas de baja hace más de 30 días. La ventana
   * existe para que un admin pueda deshacer una baja hecha por error.
   */
  async runPurgeSweep(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PURGE_GRACE_DAYS);

    const candidates = await this.prisma.user.findMany({
      where: {
        status: 'deleted',
        anonymizedAt: null,
        deletedAt: { lt: cutoff },
      },
      select: { id: true },
      take: BATCH_SIZE,
    });

    let purged = 0;

    for (const candidate of candidates) {
      try {
        await this.accountStatus.anonymize(candidate.id);
        purged += 1;
      } catch (error) {
        this.logger.error(`Failed to anonymize user ${candidate.id}`, error);
      }
    }

    this.logger.log(
      `Purge sweep: ${purged}/${candidates.length} accounts anonymized (cutoff ${cutoff.toISOString()})`,
    );

    return purged;
  }
}
