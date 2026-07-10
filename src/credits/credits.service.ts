import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cliente Prisma que puede ser el servicio global o un cliente de transacción.
 * Los métodos que componen operaciones aceptan un `tx` para participar en la
 * transacción del llamador.
 */
type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export type CreditReason =
  | 'signup_bonus'
  | 'order_bonus'
  | 'pack_purchase'
  | 'admin_grant'
  | 'generation_spend'
  | 'generation_refund'
  | 'order_bonus_reversal'
  | 'pack_purchase_reversal';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Saldo actual de créditos de generación del usuario. */
  async getBalance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { generationCredits: true },
    });
    return user?.generationCredits ?? 0;
  }

  /**
   * Acredita `amount` créditos de forma idempotente. La unique (reason,
   * referenceId) del ledger evita doble-grant: si ya existe el movimiento
   * (P2002) no hace nada y devuelve false.
   *
   * Úsalo para signup_bonus (referenceId = userId), order_bonus
   * (referenceId = orderId) y admin_grant (referenceId = null → repetible).
   *
   * @returns true si otorgó créditos, false si ya estaban otorgados.
   */
  async grant(
    userId: string,
    amount: number,
    reason: CreditReason,
    referenceId: string | null,
    note?: string,
    tx?: PrismaClientLike,
  ): Promise<boolean> {
    const run = async (client: Prisma.TransactionClient): Promise<boolean> => {
      try {
        await client.creditTransaction.create({
          data: { userId, amount, reason, referenceId, note },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Ya otorgado (webhook/registro duplicado): no-op idempotente.
          return false;
        }
        throw error;
      }
      await client.user.update({
        where: { id: userId },
        data: { generationCredits: { increment: amount } },
      });
      return true;
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  /**
   * Revierte `amount` créditos previamente otorgados (reembolso/cancelación de
   * una orden). Fila negativa en el ledger + decremento INCONDICIONAL: el saldo
   * puede quedar < 0 si el usuario ya gastó el bono (el guard de gasto `gte: 1`
   * bloquea generar mientras esté en negativo). Espejo de `grant()`; no reutiliza
   * `grant()` con monto negativo porque su semántica asume un abono.
   *
   * Idempotente por (reason, referenceId): si ya se revirtió (P2002) no hace nada
   * y devuelve false. Úsalo con reason `order_bonus_reversal` /
   * `pack_purchase_reversal` y referenceId = OrderItem.id.
   *
   * @param amount monto positivo a revertir; se persiste como `-amount`.
   * @returns true si revirtió, false si ya estaba revertido.
   */
  async revoke(
    userId: string,
    amount: number,
    reason: CreditReason,
    referenceId: string | null,
    note?: string,
    tx?: PrismaClientLike,
  ): Promise<boolean> {
    const run = async (client: Prisma.TransactionClient): Promise<boolean> => {
      try {
        await client.creditTransaction.create({
          data: { userId, amount: -amount, reason, referenceId, note },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Ya revertido (webhook/reintento duplicado): no-op idempotente.
          return false;
        }
        throw error;
      }
      await client.user.update({
        where: { id: userId },
        data: { generationCredits: { decrement: amount } },
      });
      return true;
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  /**
   * Descuenta 1 crédito por una generación. DEBE llamarse dentro de una
   * transacción existente (recibe `tx`) para que el gasto y la creación de la
   * generación se confirmen o reviertan juntos.
   *
   * El decremento condicional (updateMany con generationCredits >= 1) es el
   * guard contra carreras: dos requests concurrentes con saldo 1 → uno gana,
   * el otro recibe 402.
   */
  async spendForGeneration(
    tx: Prisma.TransactionClient,
    userId: string,
    generationId: string,
  ): Promise<void> {
    const res = await tx.user.updateMany({
      where: { id: userId, generationCredits: { gte: 1 } },
      data: { generationCredits: { decrement: 1 } },
    });

    if (res.count === 0) {
      throw new HttpException(
        "You're out of generation credits. Purchase a product to get more.",
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -1,
        reason: 'generation_spend',
        referenceId: generationId,
      },
    });
  }

  /**
   * Reembolsa el crédito de una generación que falló. Best-effort e idempotente:
   *  - si la generación nunca gastó crédito (admin/exenta) no hace nada;
   *  - si ya se reembolsó (P2002 en generation_refund) no hace nada.
   */
  async refundGeneration(generationId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const spend = await tx.creditTransaction.findUnique({
        where: {
          reason_referenceId: {
            reason: 'generation_spend',
            referenceId: generationId,
          },
        },
        select: { userId: true },
      });

      // Sin gasto previo (generación de admin/exenta): no hay nada que reembolsar.
      if (!spend) return false;

      try {
        await tx.creditTransaction.create({
          data: {
            userId: spend.userId,
            amount: 1,
            reason: 'generation_refund',
            referenceId: generationId,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Ya reembolsado.
          return false;
        }
        throw error;
      }

      await tx.user.update({
        where: { id: spend.userId },
        data: { generationCredits: { increment: 1 } },
      });
      return true;
    });
  }
}
