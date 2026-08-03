import { Injectable, Logger } from '@nestjs/common';
import { Expense, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FxRateService } from '../fx/fx-rate.service';
import { ProviderRateService } from './provider-rate.service';
import { createPaginatedResult } from '../common/utils/pagination.util';

export const BASE_CURRENCY = 'CAD';

/** Los Decimal de Prisma no serializan a JSON: se exponen como number. */
function toExpenseItem(row: Expense) {
  return {
    ...row,
    amount: row.amount.toNumber(),
    amountBase: row.amountBase?.toNumber() ?? null,
    fxRate: row.fxRate?.toNumber() ?? null,
  };
}

export interface RecordExpenseInput {
  category: string;
  userId?: string;
  orderId?: string;
  orderItemId?: string;
  generationId?: string;
  provider?: string;
  providerRef?: string;
  amount: number;
  currency?: string;
  detail?: Record<string, unknown>;
  note?: string;
  source?: string;
  createdBy?: string;
  dedupeKey?: string;
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxRateService,
    private readonly rates: ProviderRateService,
  ) {}

  async record(input: RecordExpenseInput) {
    const currency = (input.currency ?? 'USD').toUpperCase();
    let amountBase: number | undefined;
    let fxRate: number | undefined;
    let baseCurrency: string | undefined;

    const converted = await this.fx.convert(
      input.amount,
      currency,
      BASE_CURRENCY,
    );
    if (converted) {
      amountBase = converted.amount;
      fxRate = converted.rate;
      baseCurrency = BASE_CURRENCY;
    } else if (currency === BASE_CURRENCY) {
      amountBase = input.amount;
      baseCurrency = BASE_CURRENCY;
    }

    const data: Prisma.ExpenseCreateInput = {
      category: input.category,
      provider: input.provider ?? null,
      providerRef: input.providerRef ?? null,
      amount: input.amount,
      currency,
      amountBase: amountBase ?? null,
      baseCurrency: baseCurrency ?? null,
      fxRate: fxRate ?? null,
      detail: (input.detail as Prisma.InputJsonValue) ?? null,
      note: input.note ?? null,
      source: input.source ?? 'system',
      createdBy: input.createdBy ?? null,
      dedupeKey: input.dedupeKey ?? null,
      ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
      ...(input.orderId ? { order: { connect: { id: input.orderId } } } : {}),
      ...(input.orderItemId
        ? { orderItem: { connect: { id: input.orderItemId } } }
        : {}),
      ...(input.generationId
        ? { generation: { connect: { id: input.generationId } } }
        : {}),
    };

    if (input.dedupeKey) {
      return this.prisma.expense.upsert({
        where: { dedupeKey: input.dedupeKey },
        create: data,
        update: {
          amount: input.amount,
          currency,
          amountBase: amountBase ?? null,
          fxRate: fxRate ?? null,
          detail: (input.detail as Prisma.InputJsonValue) ?? null,
        },
      });
    }

    return this.prisma.expense.create({ data });
  }

  async recordGenerationCost(generationId: string) {
    const gen = await this.prisma.generation.findUnique({
      where: { id: generationId },
      select: {
        id: true,
        userId: true,
        falRequestId: true,
        visionAnalysis: true,
        promptSnapshot: true,
        orderItems: { select: { id: true, orderId: true }, take: 1 },
      },
    });
    if (!gen) return null;

    type VisionAnalysis = { usage?: { cost?: number }; model?: string } | null;
    type PromptSnapshot = { falModel?: string } | null;
    const vision = gen.visionAnalysis as VisionAnalysis;
    const snapshot = gen.promptSnapshot as PromptSnapshot;
    const visionCost: number = vision?.usage?.cost ?? 0;
    const falModel: string = snapshot?.falModel ?? 'fal-ai/flux/dev';

    const imageRate = await this.rates.getRateOrEnsure(
      'fal',
      falModel,
      'per_image',
    );
    const imageCost = imageRate.amount;

    const totalAmount = visionCost + imageCost;

    const detail: Record<string, unknown> = {
      vision: { cost: visionCost, model: vision?.model ?? null },
      image: {
        cost: imageCost,
        model: falModel,
        unit: imageRate.unit,
      },
    };

    const item = gen.orderItems[0];

    return this.record({
      category: 'image_generation',
      userId: gen.userId,
      orderId: item?.orderId ?? undefined,
      orderItemId: item?.id ?? undefined,
      generationId: gen.id,
      provider: 'fal',
      providerRef: gen.falRequestId ?? undefined,
      amount: totalAmount,
      currency: 'USD',
      detail,
      dedupeKey: `gen:${gen.id}`,
    });
  }

  async recordUpscaleCost(input: {
    orderId: string;
    orderItemId: string;
    userId?: string;
    generationId?: string;
    model: string;
    factor: number;
    sourcePx: { width: number; height: number } | null;
    requestId?: string;
  }) {
    const rate = await this.rates.getRateOrEnsure(
      'fal',
      input.model,
      'per_image',
    );
    let amount = 0;
    let detail: Record<string, unknown> = {
      model: input.model,
      factor: input.factor,
    };

    if (rate.unit === 'per_megapixel' && input.sourcePx) {
      const outputMp =
        (input.sourcePx.width *
          input.sourcePx.height *
          input.factor *
          input.factor) /
        1_000_000;
      amount = outputMp * rate.amount;
      detail = {
        ...detail,
        outputMegapixels: outputMp,
        ratePerMp: rate.amount,
      };
    } else {
      amount = rate.amount;
    }

    return this.record({
      category: 'image_upscale',
      userId: input.userId ?? undefined,
      orderId: input.orderId,
      orderItemId: input.orderItemId,
      generationId: input.generationId ?? undefined,
      provider: 'fal',
      providerRef: input.requestId ?? undefined,
      amount,
      currency: rate.currency,
      detail,
    });
  }

  async recordProductionCost(input: {
    orderId: string;
    userId?: string;
    amount: number;
    currency: string;
    detail?: Record<string, unknown>;
  }) {
    return this.record({
      category: 'pod_production',
      userId: input.userId ?? undefined,
      orderId: input.orderId,
      provider: 'pictorem',
      amount: input.amount,
      currency: input.currency,
      detail: input.detail ?? undefined,
      dedupeKey: `pod:${input.orderId}`,
    });
  }

  async recordManual(input: {
    orderId: string;
    userId?: string;
    amount: number;
    currency: string;
    note?: string;
    createdBy?: string;
  }) {
    return this.record({
      category: 'manual',
      userId: input.userId ?? undefined,
      orderId: input.orderId,
      provider: 'manual',
      amount: input.amount,
      currency: input.currency,
      note: input.note ?? undefined,
      source: 'admin',
      createdBy: input.createdBy ?? undefined,
    });
  }

  async deleteExpense(id: string) {
    return this.prisma.expense.delete({ where: { id } });
  }

  async listForOrder(orderId: string) {
    const rows = await this.prisma.expense.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    const items = rows.map(toExpenseItem);

    const byCategory: Record<string, { count: number; totalBase: number }> = {};
    let grandTotal = 0;

    for (const item of items) {
      const base = item.amountBase ?? item.amount;
      if (!byCategory[item.category]) {
        byCategory[item.category] = { count: 0, totalBase: 0 };
      }
      byCategory[item.category].count += 1;
      byCategory[item.category].totalBase += base;
      grandTotal += base;
    }

    return {
      items,
      summary: byCategory,
      grandTotal,
      baseCurrency: BASE_CURRENCY,
    };
  }

  async globalSummary(period: '3d' | '7d' | '30d' | '90d' | 'all' = '30d') {
    let since: Date | undefined;
    if (period !== 'all') {
      const days = parseInt(period.replace('d', ''), 10);
      since = new Date(Date.now() - days * 86400000);
    }

    const groups = await this.prisma.expense.groupBy({
      by: ['category'],
      where: since ? { createdAt: { gte: since } } : undefined,
      _sum: { amountBase: true },
      _count: { _all: true },
    });

    const byCategory: Record<string, { total: number; count: number }> = {};
    let grandTotal = 0;
    let count = 0;

    for (const g of groups) {
      const total = g._sum.amountBase?.toNumber() ?? 0;
      byCategory[g.category] = { total, count: g._count._all };
      grandTotal += total;
      count += g._count._all;
    }

    return {
      period,
      baseCurrency: BASE_CURRENCY,
      byCategory,
      grandTotal,
      count,
    };
  }

  /**
   * Totales por categoría de todos los gastos del cliente. Sin límite de filas:
   * un total capado sería silenciosamente incorrecto. Se lee con `select` de tres
   * columnas (barato aun sin `take`) en vez de `groupBy` porque `_sum.amountBase`
   * ignoraría las filas sin conversión FX, que caen a `amount`.
   */
  async customerSummary(userId: string) {
    const rows = await this.prisma.expense.findMany({
      where: { userId },
      select: { category: true, amount: true, amountBase: true },
    });

    const byCategory: Record<string, number> = {};
    let grandTotal = 0;

    for (const row of rows) {
      const base = row.amountBase?.toNumber() ?? row.amount.toNumber();
      byCategory[row.category] = (byCategory[row.category] ?? 0) + base;
      grandTotal += base;
    }

    return {
      byCategory,
      grandTotal,
      count: rows.length,
      baseCurrency: BASE_CURRENCY,
    };
  }

  /** Movimientos individuales del cliente, del más reciente al más antiguo. */
  async customerExpenses(userId: string, page = 1, limit = 20) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where: { userId } }),
    ]);

    return createPaginatedResult(rows.map(toExpenseItem), total, page, limit);
  }

  async backfillGenerationCosts(): Promise<{
    processed: number;
    total: number;
  }> {
    const generations = await this.prisma.generation.findMany({
      where: { status: 'completed' },
      select: { id: true },
    });
    const total = generations.length;
    let processed = 0;
    for (const gen of generations) {
      try {
        await this.recordGenerationCost(gen.id);
        processed++;
      } catch (err) {
        this.logger.warn(
          `backfill: failed for gen ${gen.id}: ${(err as Error).message}`,
        );
      }
    }
    return { processed, total };
  }
}
