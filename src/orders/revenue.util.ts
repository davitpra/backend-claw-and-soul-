import { Prisma } from '@prisma/client';
import { FxRateService } from '../fx/fx-rate.service';
import { BASE_CURRENCY } from '../expenses/expenses.service';

/**
 * Fila de un `order.groupBy({ by: ['currency'], _sum: { totalAmount } })`.
 * Se tipa aquí para que quien la produzca no tenga que exponer el shape de
 * Prisma en su firma.
 */
export interface RevenueCurrencyGroup {
  currency: string;
  _sum: { totalAmount: Prisma.Decimal | null };
  _count: { _all: number };
}

export interface RevenueTotal {
  baseCurrency: string;
  total: number;
  orderCount: number;
  /** Monedas que se sumaron en crudo por no haber tipo de cambio disponible. */
  unconvertedCurrencies: string[];
}

/**
 * Suma cubos de ingresos en la moneda base.
 *
 * Cada pedido guarda su propia moneda, así que un `_sum` plano sobre
 * `totalAmount` mezclaría divisas y daría un número sin significado. Se agrupa
 * por moneda y se convierte cubo a cubo.
 *
 * Sin tipo de cambio se suma el importe crudo (igual que
 * `ExpensesService.customerSummary`) y se declara la moneda en
 * `unconvertedCurrencies`: mejor un total con la salvedad a la vista que un
 * hueco silencioso.
 */
export async function sumRevenueByCurrency(
  groups: RevenueCurrencyGroup[],
  fxRate: FxRateService,
): Promise<RevenueTotal> {
  let total = 0;
  let orderCount = 0;
  const unconvertedCurrencies: string[] = [];

  for (const group of groups) {
    const amount = group._sum.totalAmount?.toNumber() ?? 0;
    orderCount += group._count._all;

    if (group.currency === BASE_CURRENCY) {
      total += amount;
      continue;
    }

    const converted = await fxRate.convert(
      amount,
      group.currency,
      BASE_CURRENCY,
    );

    if (converted) {
      total += converted.amount;
    } else {
      total += amount;
      unconvertedCurrencies.push(group.currency);
    }
  }

  return {
    baseCurrency: BASE_CURRENCY,
    total,
    orderCount,
    unconvertedCurrencies,
  };
}
