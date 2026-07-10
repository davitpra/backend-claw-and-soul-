import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { CreditsService } from './credits.service';
import { PrismaService } from '../prisma/prisma.service';

// El cliente de transacción y el servicio comparten el mismo mock: $transaction
// invoca el callback con el propio mock, de modo que create/update quedan bajo
// las mismas jest.fn que verificamos.
const mockPrisma = {
  creditTransaction: {
    create: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  $transaction: jest.fn(
    (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (c: unknown) => unknown)(mockPrisma)
        : Promise.all(arg as unknown[]),
  ),
};

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('CreditsService', () => {
  let service: CreditsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CreditsService>(CreditsService);
    jest.clearAllMocks();
  });

  describe('revoke', () => {
    it('escribe una fila negativa y decrementa el saldo', async () => {
      mockPrisma.creditTransaction.create.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.revoke(
        'user-1',
        15,
        'order_bonus_reversal',
        'item-1',
        'note',
      );

      expect(result).toBe(true);
      expect(mockPrisma.creditTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          amount: -15,
          reason: 'order_bonus_reversal',
          referenceId: 'item-1',
          note: 'note',
        },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { generationCredits: { decrement: 15 } },
      });
    });

    it('es idempotente: P2002 devuelve false y no toca el saldo', async () => {
      mockPrisma.creditTransaction.create.mockRejectedValue(p2002());

      const result = await service.revoke(
        'user-1',
        15,
        'order_bonus_reversal',
        'item-1',
      );

      expect(result).toBe(false);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('propaga errores que no sean P2002', async () => {
      mockPrisma.creditTransaction.create.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.revoke('user-1', 15, 'order_bonus_reversal', 'item-1'),
      ).rejects.toThrow('db down');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('participa en la transacción provista (tx) sin abrir otra', async () => {
      const tx = {
        creditTransaction: { create: jest.fn().mockResolvedValue({}) },
        user: { update: jest.fn().mockResolvedValue({}) },
      };

      const result = await service.revoke(
        'user-1',
        5,
        'pack_purchase_reversal',
        'item-2',
        undefined,
        tx as unknown as Prisma.TransactionClient,
      );

      expect(result).toBe(true);
      expect(tx.creditTransaction.create).toHaveBeenCalledTimes(1);
      expect(tx.user.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
