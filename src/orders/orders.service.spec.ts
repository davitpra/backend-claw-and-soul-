// uuid v13 es ESM-only y jest no transforma node_modules; lo mockeamos para
// evitar el parse (OrdersService lo importa aunque este spec no lo ejercite).
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ShopifyApiService } from '../shopify-sync/shopify-api.service';
import { PaintByNumbersService } from '../paint-by-numbers/paint-by-numbers.service';
import { CreditsService } from '../credits/credits.service';

const mockPrisma = {
  creditTransaction: {
    findUnique: jest.fn(),
  },
  orderItem: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
  },
  creditPackVariant: {
    findMany: jest.fn(),
  },
  orderEvent: {
    create: jest.fn(),
  },
};

const mockCredits = {
  grant: jest.fn().mockResolvedValue(true),
  revoke: jest.fn().mockResolvedValue(true),
};

// findUnique del ledger enruta por reason (order_bonus / pack_purchase).
function stubGrants(opts: {
  bonusUserId?: string | null;
  packUserId?: string | null;
}) {
  mockPrisma.creditTransaction.findUnique.mockImplementation(
    (args: { where: { reason_referenceId: { reason: string } } }) => {
      const reason = args.where.reason_referenceId.reason;
      if (reason === 'order_bonus') {
        return Promise.resolve(
          opts.bonusUserId ? { userId: opts.bonusUserId } : null,
        );
      }
      if (reason === 'pack_purchase') {
        return Promise.resolve(
          opts.packUserId ? { userId: opts.packUserId } : null,
        );
      }
      return Promise.resolve(null);
    },
  );
}

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: {} },
        { provide: ShopifyApiService, useValue: {} },
        { provide: PaintByNumbersService, useValue: {} },
        { provide: CreditsService, useValue: mockCredits },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
    mockPrisma.order.findUnique.mockResolvedValue({ orderNumber: '#1042' });
    mockPrisma.creditPackVariant.findMany.mockResolvedValue([]);
  });

  // Acceso al método privado sin exponerlo en la API pública.
  const reverse = (orderId: string, itemIds: string[]) =>
    (
      service as unknown as {
        reverseCreditsForItems: (o: string, i: string[]) => Promise<void>;
      }
    ).reverseCreditsForItems(orderId, itemIds);

  describe('reverseCreditsForItems', () => {
    it('no hace nada si la orden nunca recibió grants', async () => {
      stubGrants({ bonusUserId: null, packUserId: null });
      mockPrisma.orderItem.findMany.mockResolvedValue([
        { id: 'item-1', shopifyVariantId: 'v1', quantity: 1 },
      ]);

      await reverse('order-1', ['item-1']);

      expect(mockCredits.revoke).not.toHaveBeenCalled();
    });

    it('no-op si itemIds está vacío (no consulta grants)', async () => {
      await reverse('order-1', []);
      expect(mockPrisma.creditTransaction.findUnique).not.toHaveBeenCalled();
      expect(mockCredits.revoke).not.toHaveBeenCalled();
    });

    it('separa líneas regulares (3/unidad) de packs (creditAmount*qty)', async () => {
      stubGrants({ bonusUserId: 'user-bonus', packUserId: 'user-pack' });
      mockPrisma.orderItem.findMany.mockResolvedValue([
        { id: 'reg-1', shopifyVariantId: 'v-reg', quantity: 3 },
        { id: 'pack-1', shopifyVariantId: 'v-pack', quantity: 2 },
      ]);
      mockPrisma.creditPackVariant.findMany.mockResolvedValue([
        { shopifyVariantId: 'v-pack', creditAmount: 100 },
      ]);

      await reverse('order-1', ['reg-1', 'pack-1']);

      expect(mockCredits.revoke).toHaveBeenCalledTimes(2);
      // Regular: 3 * 3 = 9, userId del grant order_bonus.
      expect(mockCredits.revoke).toHaveBeenCalledWith(
        'user-bonus',
        9,
        'order_bonus_reversal',
        'reg-1',
        expect.any(String),
      );
      // Pack: 100 * 2 = 200, userId del grant pack_purchase.
      expect(mockCredits.revoke).toHaveBeenCalledWith(
        'user-pack',
        200,
        'pack_purchase_reversal',
        'pack-1',
        expect.any(String),
      );
    });

    // LIMITACIÓN CONOCIDA (refund parcial por cantidad): reverseCreditsForItems
    // decide el monto con la cantidad TOTAL del OrderItem (it.quantity), no con la
    // cantidad realmente reembolsada. El webhook además descarta
    // refunds[].refund_line_items[].quantity (orders.service.ts:228-230), pasando
    // solo el line_item_id. Por eso el primer refund parcial de una línea de pack
    // revierte la LÍNEA COMPLETA, y —por la idempotencia (reason, OrderItem.id)—
    // un segundo refund de esa misma línea es no-op. Este test fija ese
    // comportamiento actual (sobre-reversión a nivel de línea), no la exactitud por
    // unidad. Si algún día se corrige, este test debe actualizarse.
    it('refund parcial de un pack revierte la línea COMPLETA (creditAmount*qty total)', async () => {
      stubGrants({ bonusUserId: null, packUserId: 'user-pack' });
      // OrderItem con 3 unidades; el cliente solo reembolsó 1 (info que no llega
      // hasta aquí). La reversión usa las 3 unidades igualmente.
      mockPrisma.orderItem.findMany.mockResolvedValue([
        { id: 'pack-1', shopifyVariantId: 'v-pack', quantity: 3 },
      ]);
      mockPrisma.creditPackVariant.findMany.mockResolvedValue([
        { shopifyVariantId: 'v-pack', creditAmount: 100 },
      ]);

      await reverse('order-1', ['pack-1']);

      // 100 * 3 = 300 (línea completa), no 100 * 1 = 100 (unidad reembolsada).
      expect(mockCredits.revoke).toHaveBeenCalledTimes(1);
      expect(mockCredits.revoke).toHaveBeenCalledWith(
        'user-pack',
        300,
        'pack_purchase_reversal',
        'pack-1',
        expect.any(String),
      );
    });

    it('salta líneas Digital/PBN: nunca recibieron bono, no revierte nada', async () => {
      stubGrants({ bonusUserId: 'user-bonus', packUserId: null });
      mockPrisma.orderItem.findMany.mockResolvedValue([
        {
          id: 'reg-1',
          shopifyVariantId: 'v-reg',
          quantity: 1,
          productRef: { template: 'Canvas' },
        },
        {
          id: 'dig-1',
          shopifyVariantId: 'v-dig',
          quantity: 2,
          productRef: { template: 'Digital' },
        },
        {
          id: 'pbn-1',
          shopifyVariantId: 'v-pbn',
          quantity: 1,
          productRef: { template: 'PBN' },
        },
      ]);

      await reverse('order-1', ['reg-1', 'dig-1', 'pbn-1']);

      expect(mockCredits.revoke).toHaveBeenCalledTimes(1);
      expect(mockCredits.revoke).toHaveBeenCalledWith(
        'user-bonus',
        3,
        'order_bonus_reversal',
        'reg-1',
        expect.any(String),
      );
    });

    it('omite líneas de pack cuando no existe grant pack_purchase', async () => {
      stubGrants({ bonusUserId: 'user-bonus', packUserId: null });
      mockPrisma.orderItem.findMany.mockResolvedValue([
        { id: 'reg-1', shopifyVariantId: 'v-reg', quantity: 1 },
        { id: 'pack-1', shopifyVariantId: 'v-pack', quantity: 2 },
      ]);
      mockPrisma.creditPackVariant.findMany.mockResolvedValue([
        { shopifyVariantId: 'v-pack', creditAmount: 100 },
      ]);

      await reverse('order-1', ['reg-1', 'pack-1']);

      expect(mockCredits.revoke).toHaveBeenCalledTimes(1);
      expect(mockCredits.revoke).toHaveBeenCalledWith(
        'user-bonus',
        3,
        'order_bonus_reversal',
        'reg-1',
        expect.any(String),
      );
    });
  });

  // Acceso al método privado sin exponerlo en la API pública.
  const grant = (order: {
    id: string;
    userId: string;
    orderNumber: string | null;
  }) =>
    (
      service as unknown as {
        grantOrderCredits: (o: typeof order) => Promise<void>;
      }
    ).grantOrderCredits(order);

  describe('grantOrderCredits', () => {
    it('excluye líneas Digital/PBN del order_bonus (+3/unidad)', async () => {
      mockPrisma.orderItem.findMany.mockResolvedValue([
        {
          shopifyVariantId: 'v-reg',
          quantity: 2,
          productRef: { template: 'Canvas' },
        },
        {
          shopifyVariantId: 'v-dig',
          quantity: 3,
          productRef: { template: 'Digital' },
        },
        {
          shopifyVariantId: 'v-pbn',
          quantity: 1,
          productRef: { template: 'PBN' },
        },
      ]);

      await grant({ id: 'order-1', userId: 'user-1', orderNumber: '#1042' });

      // Solo la línea Canvas suma: 2 * 3 = 6.
      expect(mockCredits.grant).toHaveBeenCalledTimes(1);
      expect(mockCredits.grant).toHaveBeenCalledWith(
        'user-1',
        6,
        'order_bonus',
        'order-1',
        expect.any(String),
      );
    });

    it('no otorga nada si la orden solo tiene líneas Digital', async () => {
      mockPrisma.orderItem.findMany.mockResolvedValue([
        {
          shopifyVariantId: 'v-dig',
          quantity: 1,
          productRef: { template: 'Digital' },
        },
      ]);

      await grant({ id: 'order-1', userId: 'user-1', orderNumber: '#1042' });

      expect(mockCredits.grant).not.toHaveBeenCalled();
    });
  });

  describe('transitionItemStatus clawback hook', () => {
    it('revierte créditos al pasar un item a un estado de clawback', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue({
        id: 'item-1',
        productionStatus: 'draft',
        notes: null,
        shippedAt: null,
        deliveredAt: null,
      });
      mockPrisma.orderItem.update.mockResolvedValue({});
      mockPrisma.orderEvent.create.mockResolvedValue({});
      stubGrants({ bonusUserId: 'user-bonus', packUserId: null });
      mockPrisma.orderItem.findMany.mockResolvedValue([
        { id: 'item-1', shopifyVariantId: 'v-reg', quantity: 1 },
      ]);

      await service.transitionItemStatus('order-1', 'item-1', 'refunded');

      expect(mockCredits.revoke).toHaveBeenCalledWith(
        'user-bonus',
        3,
        'order_bonus_reversal',
        'item-1',
        expect.any(String),
      );
    });

    it('no revierte en transiciones que no son de clawback', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue({
        id: 'item-1',
        productionStatus: 'draft',
        notes: null,
        shippedAt: null,
        deliveredAt: null,
      });
      mockPrisma.orderItem.update.mockResolvedValue({});
      mockPrisma.orderEvent.create.mockResolvedValue({});

      await service.transitionItemStatus('order-1', 'item-1', 'pre_production');

      expect(mockCredits.revoke).not.toHaveBeenCalled();
    });
  });
});
