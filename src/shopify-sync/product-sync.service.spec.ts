import { Test, TestingModule } from '@nestjs/testing';
import { ProductSyncService } from './product-sync.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  productReference: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  format: {
    findFirst: jest.fn(),
  },
  productFormatVariant: {
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  styleFormatProductCompat: {
    updateMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

describe('ProductSyncService', () => {
  let service: ProductSyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductSyncService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductSyncService>(ProductSyncService);
    jest.clearAllMocks();
  });

  describe('upsertProduct', () => {
    it('creates a new product and maps shopifyHandle', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue(null);
      mockPrisma.productReference.create.mockResolvedValue({ id: 'ref-1' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.upsertProduct({
        id: 123,
        handle: 'my-poster',
        title: 'My Poster',
        body_html: '<p>desc</p>',
        status: 'active',
        variants: [],
      });

      expect(result).toEqual({ action: 'created', id: 'ref-1' });
      expect(mockPrisma.productReference.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            shopifyHandle: 'my-poster',
            name: 'my-poster',
            displayName: 'My Poster',
            description: 'desc',
            isActive: true,
          }),
        }),
      );
    });

    it('updates an existing product', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({ id: 'ref-1', isActive: true });
      mockPrisma.productReference.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.upsertProduct({
        id: 123,
        handle: 'my-poster',
        title: 'My Poster Updated',
        body_html: '',
        status: 'active',
        variants: [],
      });

      expect(result).toEqual({ action: 'updated', id: 'ref-1' });
    });
  });

  describe('syncVariants', () => {
    it('upserts variant when matching format exists', async () => {
      mockPrisma.format.findFirst.mockResolvedValue({ id: 'fmt-1' });
      mockPrisma.productFormatVariant.upsert.mockResolvedValue({});
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants(
        'ref-1',
        [{ id: 999, title: '8x10', option1: '8x10', option2: null, option3: null }],
        'my-poster',
      );

      expect(result).toEqual({ synced: 1, skipped: 0 });
      expect(mockPrisma.productFormatVariant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productRefId_formatId: { productRefId: 'ref-1', formatId: 'fmt-1' } },
          create: expect.objectContaining({
            shopifyVariantId: '999',
            shopifyVariantTitle: '8x10',
            isActive: true,
          }),
        }),
      );
    });

    it('skips variant when no matching format exists and logs warning', async () => {
      mockPrisma.format.findFirst.mockResolvedValue(null);
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants(
        'ref-1',
        [{ id: 999, title: '12x16', option1: '12x16', option2: null, option3: null }],
        'my-poster',
      );

      expect(result).toEqual({ synced: 0, skipped: 1 });
      expect(mockPrisma.productFormatVariant.upsert).not.toHaveBeenCalled();
    });

    it('skips variant with no size option and logs warning', async () => {
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants(
        'ref-1',
        [{ id: 999, title: 'Default Title', option1: null, option2: null, option3: null }],
        'my-poster',
      );

      expect(result).toEqual({ synced: 0, skipped: 1 });
      expect(mockPrisma.format.findFirst).not.toHaveBeenCalled();
    });

    it('deactivates variants no longer present in Shopify', async () => {
      mockPrisma.format.findFirst.mockResolvedValue({ id: 'fmt-1' });
      mockPrisma.productFormatVariant.upsert.mockResolvedValue({});
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      await service.syncVariants(
        'ref-1',
        [{ id: 100, title: '8x10', option1: '8x10', option2: null, option3: null }],
        'my-poster',
      );

      expect(mockPrisma.productFormatVariant.updateMany).toHaveBeenCalledWith({
        where: {
          productRefId: 'ref-1',
          shopifyVariantId: { notIn: ['100'] },
          isActive: true,
        },
        data: { isActive: false },
      });
    });

    it('handles product with no variants without failing', async () => {
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants('ref-1', [], 'my-poster');

      expect(result).toEqual({ synced: 0, skipped: 0 });
      expect(mockPrisma.productFormatVariant.upsert).not.toHaveBeenCalled();
    });
  });
});
