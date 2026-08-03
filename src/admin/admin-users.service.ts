import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPaginationParams,
  createPaginatedResult,
} from '../common/utils/pagination.util';
import { resolveOrderBy, SortDirection } from '../common/utils/sorting.util';
import { AdminOrdersService } from '../orders/admin-orders.service';
import { PaintByNumbersService } from '../paint-by-numbers/paint-by-numbers.service';
import { AuthService } from '../auth/auth.service';
import { AUDIT_ACTION } from '../common/constants/audit-actions';
import { lookupLocation } from '../common/utils/geoip.util';

type UserOrderBy =
  | Prisma.UserOrderByWithRelationInput
  | Prisma.UserOrderByWithRelationInput[];

/**
 * Columnas ordenables de las tablas de usuarios y de créditos del admin (las dos
 * consumen `GET /admin/users`). Las claves son los `sortKey` del front.
 */
const USER_ORDER_BY_FIELDS: Record<
  string,
  (dir: SortDirection) => UserOrderBy
> = {
  // La celda muestra `fullName || @handle-del-email`: el email hace de segundo
  // criterio para los usuarios que no han puesto nombre.
  name: (dir) => [{ fullName: { sort: dir, nulls: 'last' } }, { email: dir }],
  email: (dir) => ({ email: dir }),
  credits: (dir) => ({ generationCredits: dir }),
  pets: (dir) => ({ pets: { _count: dir } }),
  generations: (dir) => ({ generations: { _count: dir } }),
  pbn: (dir) => ({ paintByNumbers: { _count: dir } }),
  // Solo cuenta los pedidos enlazados a la cuenta: `Order.userId` es nullable y
  // un pedido de invitado no se atribuye a nadie hasta que se enlaza a mano.
  orders: (dir) => ({ orders: { _count: dir } }),
  lastActivity: (dir) => ({ lastLoginAt: { sort: dir, nulls: 'last' } }),
};

const DEFAULT_USER_ORDER_BY: UserOrderBy = { createdAt: 'desc' };

/** Columnas ordenables del historial de movimientos de crédito. */
const CREDIT_TX_ORDER_BY_FIELDS: Record<
  string,
  (dir: SortDirection) => Prisma.CreditTransactionOrderByWithRelationInput
> = {
  date: (dir) => ({ createdAt: dir }),
  reason: (dir) => ({ reason: dir }),
  note: (dir) => ({ note: { sort: dir, nulls: 'last' } }),
  amount: (dir) => ({ amount: dir }),
};

const DEFAULT_CREDIT_TX_ORDER_BY: Prisma.CreditTransactionOrderByWithRelationInput =
  { createdAt: 'desc' };

/**
 * Qué filas del audit log entran en el historial de un usuario.
 *
 * `writeAuditLog` guarda al actor en `userId` y al objetivo en `entityId`, así
 * que las dos ramas responden a preguntas distintas: `target` es "lo que le pasó
 * a esta cuenta" (el caso normal) y `actor` es "lo que esta cuenta le hizo a
 * otras", que solo tiene filas cuando el usuario es admin.
 */
export const AUDIT_SCOPES = ['target', 'actor', 'all'] as const;

export type AuditScope = (typeof AUDIT_SCOPES)[number];

function auditWhere(
  userId: string,
  scope: AuditScope,
): Prisma.AuditLogWhereInput {
  const asTarget: Prisma.AuditLogWhereInput = {
    entityType: 'User',
    entityId: userId,
  };
  const asActor: Prisma.AuditLogWhereInput = { userId };

  if (scope === 'target') return asTarget;
  if (scope === 'actor') return asActor;
  return { OR: [asTarget, asActor] };
}

/** Métodos de acceso de una cuenta, derivados de qué credenciales tiene. */
export type AuthProvider = 'password' | 'google' | 'both' | 'none';

function authProviderOf(
  passwordHash: string | null,
  googleId: string | null,
): AuthProvider {
  if (passwordHash && googleId) return 'both';
  if (googleId) return 'google';
  if (passwordHash) return 'password';
  // Posible tras anonimizar una cuenta dada de baja: se le borra el PII.
  return 'none';
}

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private adminOrdersService: AdminOrdersService,
    private pbnService: PaintByNumbersService,
    private authService: AuthService,
  ) {}

  async listUsers(
    page = 1,
    limit = 20,
    opts: {
      search?: string;
      sort?: string;
      order?: string;
      status?: string;
    } = {},
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.UserWhereInput = {};

    if (opts.search) {
      where.OR = [
        { email: { contains: opts.search, mode: 'insensitive' } },
        { fullName: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    // Las cuentas dadas de baja se ocultan salvo que se pidan explícitamente:
    // el listado por defecto es el de gente con la que aún se puede trabajar.
    if (opts.status && opts.status !== 'all') {
      where.status = opts.status;
    } else if (!opts.status) {
      where.status = { not: 'deleted' };
    }

    const orderBy = resolveOrderBy(
      USER_ORDER_BY_FIELDS,
      DEFAULT_USER_ORDER_BY,
      opts.sort,
      opts.order,
    );

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          status: true,
          statusReason: true,
          statusChangedAt: true,
          deletedAt: true,
          generationCredits: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              pets: true,
              generations: true,
              paintByNumbers: true,
              orders: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return createPaginatedResult(users, total, page, limit);
  }

  /**
   * Consumo neto de créditos en generaciones: los `generation_spend` (negativos)
   * netean con los `generation_refund` de las generaciones fallidas. Se deja
   * fuera el resto del ledger (bonos, packs y sus reversas) porque son saldo
   * concedido o retirado, no gasto del usuario.
   */
  private async getCreditsSpent(userId: string): Promise<number> {
    const { _sum } = await this.prisma.creditTransaction.aggregate({
      where: {
        userId,
        reason: { in: ['generation_spend', 'generation_refund'] },
      },
      _sum: { amount: true },
    });

    return -(_sum.amount ?? 0);
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        // No salen tal cual: alimentan el `authProvider` derivado de abajo. El
        // hash no puede cruzar la frontera de la API ni en el admin.
        passwordHash: true,
        googleId: true,
        role: true,
        isActive: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        statusChangedBy: true,
        deletedAt: true,
        anonymizedAt: true,
        emailVerified: true,
        generationCredits: true,
        createdAt: true,
        lastLoginAt: true,
        pets: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            age: true,
            description: true,
            isActive: true,
            photos: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                photoUrl: true,
                isPrimary: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const { passwordHash, googleId, ...rest } = user;

    return {
      ...rest,
      // Cómo entra a la cuenta. `google` sin contraseña es el caso que explica
      // los "no puedo recuperar mi contraseña": no hay ninguna que recuperar.
      authProvider: authProviderOf(passwordHash, googleId),
      creditsSpent: await this.getCreditsSpent(id),
    };
  }

  async getUserGenerations(userId: string, page = 1, limit = 24) {
    const { skip, take } = getPaginationParams(page, limit);

    const [generations, total] = await Promise.all([
      this.prisma.generation.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          type: true,
          resultUrl: true,
          thumbnailUrl: true,
          createdAt: true,
          pet: { select: { id: true, name: true, species: true } },
          style: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.generation.count({ where: { userId } }),
    ]);

    return createPaginatedResult(generations, total, page, limit);
  }

  async getUserOrders(userId: string, page = 1, limit = 10) {
    return this.adminOrdersService.getUserOrders(userId, page, limit);
  }

  async getUserRevenue(userId: string) {
    return this.adminOrdersService.getUserRevenue(userId);
  }

  /** `null` si el usuario nunca ha comprado: no hay dirección que mostrar. */
  async getUserShippingAddress(userId: string) {
    return this.adminOrdersService.getUserShippingAddress(userId);
  }

  /**
   * PBNs guardados del usuario. La consulta ya existe user-scoped (la usa
   * `GET /paint-by-numbers` con el id del JWT); aquí sólo se reexpone con el id
   * que llega por la ruta, ya protegida por `@Roles('admin')`.
   */
  async getUserPaintByNumbers(userId: string, page = 1, limit = 24) {
    return this.pbnService.findUserPbns(userId, page, limit);
  }

  async getUserCreditTransactions(
    userId: string,
    page = 1,
    limit = 20,
    opts: { sort?: string; order?: string } = {},
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const orderBy = resolveOrderBy(
      CREDIT_TX_ORDER_BY_FIELDS,
      DEFAULT_CREDIT_TX_ORDER_BY,
      opts.sort,
      opts.order,
    );

    const [transactions, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where: { userId },
        skip,
        take,
        orderBy,
        select: {
          id: true,
          amount: true,
          reason: true,
          referenceId: true,
          note: true,
          createdAt: true,
        },
      }),
      this.prisma.creditTransaction.count({ where: { userId } }),
    ]);

    const costByGeneration = await this.generationCosts(transactions);

    const rows = transactions.map((t) => ({
      ...t,
      costBase: t.referenceId
        ? (costByGeneration.get(t.referenceId) ?? null)
        : null,
    }));

    return createPaginatedResult(rows, total, page, limit);
  }

  /**
   * Costo real (en moneda base) de las generaciones referenciadas por los
   * movimientos de gasto/reembolso de la página. Una sola consulta extra.
   *
   * Sólo `generation_spend`/`generation_refund` llevan un `generationId` en
   * `referenceId`; el resto de motivos son saldo concedido o retirado, no
   * gasto, y se quedan sin costo. Un `generation_refund` normalmente tampoco
   * tendrá costo: `recordGenerationCost` sólo corre al completar, así que una
   * generación fallida nunca deja `Expense`.
   */
  private async generationCosts(
    transactions: { reason: string; referenceId: string | null }[],
  ): Promise<Map<string, number>> {
    const generationIds = transactions
      .filter(
        (t) =>
          t.reason === 'generation_spend' || t.reason === 'generation_refund',
      )
      .map((t) => t.referenceId)
      .filter((id): id is string => Boolean(id));

    if (generationIds.length === 0) return new Map();

    const expenses = await this.prisma.expense.findMany({
      where: {
        category: 'image_generation',
        generationId: { in: generationIds },
      },
      select: { generationId: true, amount: true, amountBase: true },
    });

    const map = new Map<string, number>();
    for (const e of expenses) {
      if (!e.generationId) continue;
      // `amountBase` es null si faltó la conversión FX: se cae a `amount`.
      const base = e.amountBase?.toNumber() ?? e.amount.toNumber();
      map.set(e.generationId, (map.get(e.generationId) ?? 0) + base);
    }
    return map;
  }

  /** 404 antes de devolver colecciones vacías de un usuario que no existe. */
  private async assertUserExists(id: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('User not found');
  }

  /**
   * Sesiones vivas del usuario. Se delega en `AuthService` en vez de repetir la
   * consulta: si mañana cambia qué cuenta como sesión viva, el admin y la página
   * de cuenta del usuario siguen mostrando lo mismo.
   *
   * `currentRefreshToken` es el del admin que mira, no el del usuario mirado:
   * solo marca `isCurrent` cuando un admin abre su propia ficha, para que no se
   * cierre a sí mismo por error.
   */
  async getUserSessions(id: string, currentRefreshToken?: string) {
    await this.assertUserExists(id);

    const { sessions, total } = await this.authService.getActiveSessions(
      id,
      currentRefreshToken,
    );

    // La ubicación se resuelve aquí y no en `AuthService`: es información para
    // el admin, y la página de cuenta del propio usuario no la necesita.
    return {
      sessions: sessions.map((session) => ({
        ...session,
        location: lookupLocation(session.ipAddress),
      })),
      total,
    };
  }

  /**
   * Revoca una sesión concreta. No reutiliza `AuthService.revokeSession` porque
   * la revocación y su fila de auditoría tienen que caer en la misma
   * transacción, y aquel método no acepta un `tx`.
   */
  async revokeUserSession(id: string, tokenId: string, actorId: string) {
    await this.assertUserExists(id);

    return this.prisma.$transaction(async (tx) => {
      // `isRevoked: false` hace la operación idempotente: revocar dos veces la
      // misma sesión da 404 en la segunda en vez de duplicar la auditoría.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: tokenId, userId: id, isRevoked: false },
        data: { isRevoked: true },
      });

      if (count === 0) {
        throw new NotFoundException('Session not found');
      }

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: AUDIT_ACTION.sessionRevoked,
          entityType: 'User',
          entityId: id,
          // Sin IP ni user-agent a propósito: `audit_logs` no se purga nunca y
          // no debe acumular PII que `refresh_tokens` sí acaba soltando.
          details: { sessionId: tokenId },
        },
      });

      return { revoked: 1 };
    });
  }

  /** Cierra todas las sesiones vivas del usuario. */
  async revokeAllUserSessions(id: string, actorId: string) {
    await this.assertUserExists(id);

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });

      // Sin nada que revocar no hay evento que auditar.
      if (count > 0) {
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: AUDIT_ACTION.sessionsRevokedAll,
            entityType: 'User',
            entityId: id,
            details: { count },
          },
        });
      }

      return { revoked: count };
    });
  }

  /**
   * Historial de auditoría del usuario. Por defecto solo lo que le pasó a la
   * cuenta; ver `AUDIT_SCOPES` para las otras lecturas.
   */
  async getUserAuditLog(
    id: string,
    page = 1,
    limit = 20,
    opts: { scope?: string } = {},
  ) {
    await this.assertUserExists(id);

    const { skip, take } = getPaginationParams(page, limit);
    const scope: AuditScope = AUDIT_SCOPES.includes(opts.scope as AuditScope)
      ? (opts.scope as AuditScope)
      : 'target';
    const where = auditWhere(id, scope);

    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          ipAddress: true,
          userAgent: true,
          details: true,
          createdAt: true,
          // El actor. Null cuando actúa el cron (baja por inactividad, purga).
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const rows = entries.map(({ user, ...entry }) => ({
      ...entry,
      actor: user,
      location: lookupLocation(entry.ipAddress),
      // Una baja self-service deja `userId === entityId`: prevalece `target`,
      // que es como debe leerse la fila.
      direction:
        entry.entityId === id ? ('target' as const) : ('actor' as const),
    }));

    return createPaginatedResult(rows, total, page, limit);
  }

  /**
   * Carrito abierto del usuario, envuelto en `{ cart }`.
   *
   * El objeto extra no es decorativo: `TransformInterceptor` mete la respuesta
   * en `{ success, data, timestamp }` y el `adminFetch` del front desempaqueta
   * con `data?.data ?? data`, que ante un `data: null` devuelve el envelope
   * entero. Un payload que puede ser nulo tiene que ir dentro de un objeto.
   *
   * Consulta directa en vez de `CartService.getCart`: aquel llama a
   * `findOrCreateCart` y crearía una fila `Cart` como efecto secundario de un
   * GET del admin. Por lo mismo hay carritos vacíos huérfanos de sobra en la
   * base, y devolverlos haría aparecer la card en fichas sin nada que contar.
   */
  async getUserCart(id: string) {
    await this.assertUserExists(id);

    const cart = await this.prisma.cart.findUnique({
      where: { userId: id },
      include: { items: { orderBy: { createdAt: 'desc' } } },
    });

    if (!cart || cart.items.length === 0) return { cart: null };

    // Los precios son `Decimal`: se acumulan como tal y se convierten una sola
    // vez al final, para no arrastrar error de coma flotante.
    const subtotal = cart.items.reduce(
      (acc, item) => acc.plus(item.price.mul(item.quantity)),
      new Prisma.Decimal(0),
    );

    return {
      cart: {
        id: cart.id,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
        lineCount: cart.items.length,
        itemCount: cart.items.reduce((acc, item) => acc + item.quantity, 0),
        // Sin moneda a propósito: `CartItem` no la guarda. Los precios vienen
        // del Storefront de Shopify y etiquetarlos con la moneda contable
        // (`CAD`) sería inventar. La UI muestra el importe sin símbolo.
        subtotal: subtotal.toNumber(),
        items: cart.items.map((item) => ({
          id: item.id,
          variantId: item.variantId,
          name: item.name,
          size: item.size,
          style: item.style,
          color: item.color,
          price: item.price.toNumber(),
          quantity: item.quantity,
          // `imageUrl` es la imagen personalizada; `img` la del producto.
          imageUrl: item.imageUrl ?? item.img,
          generationId: item.generationId,
          paintByNumbersId: item.paintByNumbersId,
          createdAt: item.createdAt,
        })),
      },
    };
  }
}
