import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedPeriod, deltaPct, safeRatio } from './period.util';
import { CUSTOMER_ONLY, NOT_DELETED, activeSince } from './user-activity.util';

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
      this.prisma.user.count({ where: { ...CUSTOMER_ONLY, ...NOT_DELETED } }),

      this.prisma.user.count({
        where: {
          ...CUSTOMER_ONLY,
          createdAt: { gte: period.from, lt: period.to },
        },
      }),
      this.prisma.user.count({
        where: {
          ...CUSTOMER_ONLY,
          createdAt: { gte: period.prevFrom, lt: period.prevTo },
        },
      }),
      // Una cuenta dada de baja no es «activa» aunque su última señal caiga
      // dentro de la ventana.
      //
      // Sin tope superior a propósito: `resolvePeriod` fija `to = now`, así que
      // `>= from` y `[from, to)` cuentan lo mismo, y `activeSince` se expresa con
      // una sola cota igual que en el filtro de /admin/users.
      //
      // Ni `lastSeenAt` ni `lastLoginAt` son un historial —los dos se pisan—, así
      // que esto es exacto para el periodo en curso e infra-cuenta hacia atrás:
      // quien estuvo activo en la ventana y volvió después ya no aparece. Por eso
      // esta cifra no lleva delta contra el periodo anterior.
      this.prisma.user.count({
        where: {
          ...CUSTOMER_ONLY,
          ...NOT_DELETED,
          ...activeSince(period.from),
        },
      }),

      // Mismo criterio de clientela que el resto del bloque: los otros escalones
      // ya se lo aplican por otra vía (`isAdminTest` en generaciones, `origin`
      // en PBN), y sin esto el primer escalón contaría las mascotas de prueba
      // del equipo y las de cuentas dadas de baja, hundiendo el embudo entero.
      this.prisma.pet.count({
        where: {
          createdAt: { gte: period.from, lt: period.to },
          user: { ...CUSTOMER_ONLY, ...NOT_DELETED },
        },
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

      // Global, no acotado al periodo: es un «ahora mismo», el umbral de días es
      // fijo y no depende de la ventana elegida. El carrito de una cuenta del
      // equipo o dada de baja no es una venta que se pueda recuperar.
      this.prisma.cart.count({
        where: {
          updatedAt: { lt: abandonedBefore },
          items: { some: {} },
          user: { ...CUSTOMER_ONLY, ...NOT_DELETED },
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
