import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Estados posibles del ciclo de vida de una cuenta. */
export const ACCOUNT_STATUSES = [
  'active',
  'banned',
  'inactive',
  'deleted',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Estados que un admin puede fijar directamente. La baja va por `softDelete`. */
export const ADMIN_SETTABLE_STATUSES = [
  'active',
  'banned',
  'inactive',
] as const;

export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number];

/** Acciones que quedan registradas en `AuditLog.action`. */
const AUDIT_ACTION = {
  banned: 'user.banned',
  reactivated: 'user.reactivated',
  deactivated: 'user.deactivated',
  deactivatedInactivity: 'user.deactivated_inactivity',
  softDeleted: 'user.soft_deleted',
  restored: 'user.restored',
  anonymized: 'user.anonymized',
} as const;

export interface StatusChangeOptions {
  reason?: string;
  /** User.id del admin que ejecuta el cambio; null si actúa el cron o el propio usuario. */
  actorId?: string | null;
}

/** Campos que necesita cualquier transición para decidir y auditar. */
const STATUS_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  deletedAt: true,
  anonymizedAt: true,
} satisfies Prisma.UserSelect;

type StatusSnapshot = Prisma.UserGetPayload<{ select: typeof STATUS_SELECT }>;

/**
 * Forma que devuelven los endpoints de estado. Se declara aparte del `User`
 * completo a propósito: `prisma.user.update` devuelve también `passwordHash`, y
 * responder con la fila entera lo filtraría al admin.
 */
export interface AccountStatusSummary {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  status: string;
  statusReason: string | null;
  statusChangedAt: Date | null;
  statusChangedBy: string | null;
  deletedAt: Date | null;
  anonymizedAt: Date | null;
}

function toSummary(user: User): AccountStatusSummary {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    status: user.status,
    statusReason: user.statusReason,
    statusChangedAt: user.statusChangedAt,
    statusChangedBy: user.statusChangedBy,
    deletedAt: user.deletedAt,
    anonymizedAt: user.anonymizedAt,
  };
}

/**
 * Único escritor de `User.status` / `User.isActive` / `User.deletedAt`.
 *
 * Centralizarlo aquí es lo que sostiene el invariante `isActive === (status ===
 * 'active')`: ningún otro servicio toca esos campos. Cada transición corre en una
 * transacción que además revoca las sesiones vivas y deja traza en `AuditLog`.
 */
@Injectable()
export class AccountStatusService {
  private readonly logger = new Logger(AccountStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Suspende (`banned`), reactiva (`active`) o desactiva a mano (`inactive`) una
   * cuenta. Las cuentas dadas de baja no pasan por aquí: se recuperan con
   * `restore()`.
   */
  async setStatus(
    userId: string,
    next: AdminSettableStatus,
    options: StatusChangeOptions = {},
  ): Promise<AccountStatusSummary> {
    const user = await this.loadForTransition(userId, options.actorId);

    if (user.status === 'deleted') {
      throw new BadRequestException(
        'This account is deleted. Restore it before changing its status.',
      );
    }

    if (user.status === next) {
      throw new BadRequestException(`The account is already ${next}.`);
    }

    // El motivo es la única pista que queda de por qué se cerró una cuenta:
    // obligatorio al suspender, opcional al reactivar.
    if (next === 'banned' && !options.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required to suspend an account.',
      );
    }

    const action =
      next === 'banned'
        ? AUDIT_ACTION.banned
        : next === 'active'
          ? AUDIT_ACTION.reactivated
          : AUDIT_ACTION.deactivated;

    return toSummary(await this.applyTransition(user, next, action, options));
  }

  /**
   * Reactivación al hacer login tras una baja por inactividad. Devuelve la fila
   * completa porque `AuthService` la necesita para construir la respuesta del
   * login; no la expone ningún controlador.
   */
  async reactivateOnLogin(userId: string): Promise<User> {
    const user = await this.loadForTransition(userId, null);

    return this.applyTransition(user, 'active', AUDIT_ACTION.reactivated, {
      reason: 'reactivated on login',
    });
  }

  /**
   * Baja lógica: bloquea el acceso y arranca la ventana de 30 días tras la cual
   * `AccountLifecycleService` anonimiza el PII. Nada se borra todavía.
   */
  async softDelete(
    userId: string,
    options: StatusChangeOptions & { actor: 'admin' | 'self' },
  ): Promise<AccountStatusSummary> {
    // El autoservicio es el único caso en el que actor y objetivo coinciden.
    const user = await this.loadForTransition(
      userId,
      options.actor === 'self' ? null : options.actorId,
    );

    if (user.status === 'deleted') {
      throw new BadRequestException('This account is already deleted.');
    }

    if (options.actor === 'admin' && !options.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required to delete an account.',
      );
    }

    return toSummary(
      await this.applyTransition(user, 'deleted', AUDIT_ACTION.softDeleted, {
        ...options,
        reason: options.reason ?? `deleted by ${options.actor}`,
      }),
    );
  }

  /** Deshace una baja lógica. Imposible una vez anonimizada la cuenta. */
  async restore(
    userId: string,
    actorId: string,
  ): Promise<AccountStatusSummary> {
    const user = await this.loadForTransition(userId, actorId);

    if (user.status !== 'deleted') {
      throw new BadRequestException('This account is not deleted.');
    }

    if (user.anonymizedAt) {
      throw new BadRequestException(
        'This account was already anonymized and cannot be restored.',
      );
    }

    return toSummary(
      await this.applyTransition(user, 'active', AUDIT_ACTION.restored, {
        actorId,
      }),
    );
  }

  /** Transición que ejecuta el barrido de inactividad. Sin actor humano. */
  async deactivateForInactivity(userId: string): Promise<AccountStatusSummary> {
    const user = await this.loadForTransition(userId, null);

    return toSummary(
      await this.applyTransition(
        user,
        'inactive',
        AUDIT_ACTION.deactivatedInactivity,
        { reason: 'inactivity', actorId: null },
      ),
    );
  }

  /**
   * Purga el PII de una cuenta ya dada de baja. Irreversible.
   *
   * Deliberadamente **no** toca generaciones, paint-by-numbers, pedidos ni gastos:
   * los `OrderItem` apuntan a generaciones y PBN, y borrarlas rompería la
   * trazabilidad de pedidos ya pagados. Los pedidos guardan su propio
   * `customerEmail`/`customerName`, que la contabilidad necesita conservar.
   */
  async anonymize(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...STATUS_SELECT, avatarStorageKey: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status !== 'deleted') {
      throw new BadRequestException('Only deleted accounts can be anonymized.');
    }

    if (user.anonymizedAt) {
      return;
    }

    // Las claves de storage se recogen antes de la transacción: los objetos se
    // borran después, porque un fallo del proveedor no debe revertir la purga.
    const photos = await this.prisma.petPhoto.findMany({
      where: { pet: { userId } },
      select: { id: true, photoStorageKey: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          // El email es único: el sufijo del uuid basta para no colisionar y
          // libera el correo real por si la persona vuelve a registrarse.
          email: `deleted-${userId.slice(0, 8)}@deleted.clawandsoul.local`,
          fullName: null,
          googleId: null,
          passwordHash: null,
          avatarUrl: null,
          avatarStorageKey: null,
          anonymizedAt: new Date(),
        },
      });

      await tx.petPhoto.deleteMany({ where: { pet: { userId } } });

      await tx.pet.updateMany({
        where: { userId },
        data: { name: 'Mascota', description: null, isActive: false },
      });

      await this.writeAuditLog(tx, {
        action: AUDIT_ACTION.anonymized,
        actorId: null,
        targetId: userId,
        details: { photosDeleted: photos.length },
      });
    });

    const keys = [
      ...(user.avatarStorageKey ? [user.avatarStorageKey] : []),
      ...photos.map((photo) => photo.photoStorageKey),
    ];

    await Promise.all(
      keys.map((key) => this.storage.delete(key).catch(() => undefined)),
    );

    this.logger.log(
      `Anonymized user ${userId} (${keys.length} storage objects removed)`,
    );
  }

  /** Lee el usuario y aplica las guardas comunes a toda transición. */
  private async loadForTransition(
    userId: string,
    actorId: string | null | undefined,
  ): Promise<StatusSnapshot> {
    if (actorId && actorId === userId) {
      throw new BadRequestException(
        'You cannot change the status of your own account.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: STATUS_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Escribe el nuevo estado, revoca las sesiones vivas y audita, todo en una
   * transacción para que no exista un instante con la cuenta cerrada y sesiones
   * abiertas (ni al revés).
   */
  private async applyTransition(
    user: StatusSnapshot,
    next: AccountStatus,
    action: string,
    options: StatusChangeOptions,
  ): Promise<User> {
    const now = new Date();
    const reason = options.reason?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          status: next,
          isActive: next === 'active',
          statusReason: reason,
          statusChangedAt: now,
          statusChangedBy: options.actorId ?? null,
          deletedAt: next === 'deleted' ? now : null,
        },
      });

      // Volver a `active` no reabre las sesiones anteriores: el usuario vuelve a
      // entrar con normalidad. Cualquier otro estado las cierra todas.
      if (next !== 'active') {
        await tx.refreshToken.updateMany({
          where: { userId: user.id, isRevoked: false },
          data: { isRevoked: true },
        });
      }

      await this.writeAuditLog(tx, {
        action,
        actorId: options.actorId ?? null,
        targetId: user.id,
        details: { from: user.status, to: next, reason },
      });

      this.logger.log(
        `User ${user.id}: ${user.status} → ${next}${reason ? ` (${reason})` : ''}`,
      );

      return updated;
    });
  }

  private writeAuditLog(
    tx: Prisma.TransactionClient,
    entry: {
      action: string;
      actorId: string | null;
      targetId: string;
      details: Prisma.InputJsonValue;
    },
  ) {
    return tx.auditLog.create({
      data: {
        // `userId` es quien actúa; el objetivo va en `entityId`. Cuando actúa el
        // cron no hay actor y la fila queda con userId null.
        userId: entry.actorId,
        action: entry.action,
        entityType: 'User',
        entityId: entry.targetId,
        details: entry.details,
      },
    });
  }
}
