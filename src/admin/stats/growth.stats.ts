import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedPeriod, deltaPct, safeRatio } from './period.util';

/** Un carrito con líneas y sin tocar en este tiempo se da por abandonado. */
const ABANDONED_AFTER_DAYS = 3;

/**
 * Bloque de crecimiento: base de usuarios, altas, actividad y el embudo
 * mascota → generación → PBN guardado → pedido pagado.
 *
 * El embudo cuenta hechos ocurridos DENTRO de la ventana, no cohortes: no
 * persigue al mismo usuario de un escalón al siguiente. Sirve para ver la forma
 * del volumen, no para atribuir conversión individual.
 */
@Injectable()
export class GrowthStats {
  constructor(private readonly prisma: PrismaService) {}

  async collect(period: ResolvedPeriod) {
    const abandonedBefore = new Date(
      Date.now() - ABANDONED_AFTER_DAYS * 86_400_000,
    );

    const [
      totalUsers,
      newUsers,
      newUsersPrev,
      activeUsers,
      pets,
      generations,
      pbnSaved,
      ordersPaid,
      abandonedCarts,
    ] = await Promise.all([
      // Acumulado, no ventana. Excluye las cuentas dadas de baja igual que hace
      // `listUsers` por defecto, para que cuadre con el «N en total» que muestra
      // /admin/users en vez de contradecirlo.
      this.prisma.user.count({ where: { status: { not: 'deleted' } } }),

      this.prisma.user.count({
        where: { createdAt: { gte: period.from, lt: period.to } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: period.prevFrom, lt: period.prevTo } },
      }),
      // Solo clientes reales: con poco tráfico los logins del propio equipo
      // inflan el número hasta hacerlo ilegible, y una cuenta dada de baja no es
      // «activa» aunque su último login caiga dentro de la ventana.
      //
      // `lastLoginAt` se pisa en cada login, no es un historial: en periodos
      // pasados esto infra-cuenta (quien entró en la ventana y volvió después ya
      // no aparece). Exacto para el periodo en curso; medir ventanas históricas
      // pediría la tabla de sesiones.
      this.prisma.user.count({
        where: {
          role: { not: 'admin' },
          status: { not: 'deleted' },
          lastLoginAt: { gte: period.from, lt: period.to },
        },
      }),

      this.prisma.pet.count({
        where: { createdAt: { gte: period.from, lt: period.to } },
      }),
      this.prisma.generation.count({
        where: {
          isAdminTest: false,
          status: 'completed',
          createdAt: { gte: period.from, lt: period.to },
        },
      }),
      this.prisma.paintByNumbers.count({
        where: {
          origin: 'customer',
          createdAt: { gte: period.from, lt: period.to },
        },
      }),
      this.prisma.order.count({
        where: {
          financialStatus: 'paid',
          shopifyCreatedAt: { gte: period.from, lt: period.to },
        },
      }),

      this.prisma.cart.count({
        where: {
          updatedAt: { lt: abandonedBefore },
          items: { some: {} },
        },
      }),
    ]);

    const conversion = safeRatio(ordersPaid, generations);

    return {
      totalUsers,
      newUsers,
      newUsersPrev,
      newUsersDeltaPct: deltaPct(newUsers, newUsersPrev),
      activeUsers,
      funnel: { pets, generations, pbnSaved, ordersPaid },
      conversionRate: conversion === null ? null : conversion * 100,
      abandonedCarts,
      abandonedAfterDays: ABANDONED_AFTER_DAYS,
    };
  }
}
