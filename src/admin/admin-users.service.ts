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

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private adminOrdersService: AdminOrdersService,
    private pbnService: PaintByNumbersService,
  ) {}

  async listUsers(
    page = 1,
    limit = 20,
    opts: { search?: string; sort?: string; order?: string } = {},
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where = opts.search
      ? {
          OR: [
            { email: { contains: opts.search, mode: 'insensitive' as const } },
            {
              fullName: { contains: opts.search, mode: 'insensitive' as const },
            },
          ],
        }
      : {};

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
        role: true,
        isActive: true,
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

    return { ...user, creditsSpent: await this.getCreditsSpent(id) };
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

    return createPaginatedResult(transactions, total, page, limit);
  }
}
