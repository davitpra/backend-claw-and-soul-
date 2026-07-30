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
    findMany: jest.fn(),
  },
  productFormatVariant: {
    upsert: jest.fn(),
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
          }) as unknown,
        }),
      );
    });

    it('updates an existing product', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({
        id: 'ref-1',
        isActive: true,
      });
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

    // El eje de contenido vive en el metafield custom.art_kind. Los tres
    // estados del parámetro tienen semánticas distintas y no intercambiables.
    describe('artKind', () => {
      const payload = {
        id: 123,
        handle: 'my-poster',
        title: 'My Poster',
        body_html: '',
        status: 'active',
        variants: [],
      };

      beforeEach(() => {
        mockPrisma.productReference.findUnique.mockResolvedValue({
          id: 'ref-1',
          isActive: true,
        });
        mockPrisma.productReference.update.mockResolvedValue({});
        mockPrisma.auditLog.create.mockResolvedValue({});
      });

      const dataOfLastUpdate = (): Record<string, unknown> => {
        const calls = mockPrisma.productReference.update.mock.calls as Array<
          [{ data: Record<string, unknown> }]
        >;
        return calls[0][0].data;
      };

      it('leaves the columns untouched when the metafield could not be fetched', async () => {
        await service.upsertProduct(payload);

        expect(dataOfLastUpdate()).not.toHaveProperty('artKind');
        expect(dataOfLastUpdate()).not.toHaveProperty('isAccessory');
      });

      it('clears the columns when Shopify has no metafield', async () => {
        await service.upsertProduct(payload, null);

        expect(dataOfLastUpdate()).toMatchObject({
          artKind: null,
          isAccessory: false,
        });
      });

      // Shopify guarda la etiqueta visible de la definición ("PBN", "Print art"),
      // no el valor canónico: ambas tienen que aterrizar en pbn/print.
      it.each([
        ['  PBN ', 'pbn'],
        ['Paint by Numbers', 'pbn'],
        ['Print art', 'print'],
        ['print', 'print'],
      ])('writes the normalized value for %p', async (raw, expected) => {
        await service.upsertProduct(payload, raw);

        expect(dataOfLastUpdate()).toMatchObject({
          artKind: expected,
          isAccessory: false,
        });
      });

      it('stores null for an unknown metafield value', async () => {
        await service.upsertProduct(payload, 'watercolor');

        expect(dataOfLastUpdate()).toMatchObject({
          artKind: null,
          isAccessory: false,
        });
      });

      // "Accessory" es el otro valor del mismo metafield, pero no es un contenido
      // de obra: marca la familia de producto y va a su propia columna.
      it.each([['Accessory'], ['accesorio'], [' Accessories ']])(
        'flags the product as accessory for %p without touching artKind',
        async (raw) => {
          await service.upsertProduct(payload, raw);

          expect(dataOfLastUpdate()).toMatchObject({
            artKind: null,
            isAccessory: true,
          });
        },
      );
    });
  });

  describe('syncVariants', () => {
    it('upserts variant when matching format exists', async () => {
      mockPrisma.format.findMany.mockResolvedValue([
        { id: 'fmt-1', shopifyVariantOption: '8x10' },
      ]);
      mockPrisma.productFormatVariant.upsert.mockResolvedValue({});
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants(
        'ref-1',
        [
          {
            id: 999,
            title: '8x10',
            option1: '8x10',
            option2: null,
            option3: null,
          },
        ],
        'my-poster',
      );

      expect(result).toEqual({ synced: 1, skipped: 0 });
      expect(mockPrisma.productFormatVariant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productRefId_shopifyVariantId: {
              productRefId: 'ref-1',
              shopifyVariantId: '999',
            },
          },
          create: expect.objectContaining({
            shopifyVariantId: '999',
            shopifyVariantTitle: '8x10',
            isActive: true,
          }) as unknown,
        }),
      );
    });

    it('skips variant when no matching format exists and logs warning', async () => {
      mockPrisma.format.findMany.mockResolvedValue([]);
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants(
        'ref-1',
        [
          {
            id: 999,
            title: '12x16',
            option1: '12x16',
            option2: null,
            option3: null,
          },
        ],
        'my-poster',
      );

      expect(result).toEqual({ synced: 0, skipped: 1 });
      expect(mockPrisma.productFormatVariant.upsert).not.toHaveBeenCalled();
    });

    it('skips variant with no size option and logs warning', async () => {
      mockPrisma.format.findMany.mockResolvedValue([]);
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants(
        'ref-1',
        [
          {
            id: 999,
            title: 'Default Title',
            option1: null,
            option2: null,
            option3: null,
          },
        ],
        'my-poster',
      );

      expect(result).toEqual({ synced: 0, skipped: 1 });
      expect(mockPrisma.productFormatVariant.upsert).not.toHaveBeenCalled();
    });

    it('deactivates variants no longer present in Shopify', async () => {
      mockPrisma.format.findMany.mockResolvedValue([
        { id: 'fmt-1', shopifyVariantOption: '8x10' },
      ]);
      mockPrisma.productFormatVariant.upsert.mockResolvedValue({});
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      await service.syncVariants(
        'ref-1',
        [
          {
            id: 100,
            title: '8x10',
            option1: '8x10',
            option2: null,
            option3: null,
          },
        ],
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
      mockPrisma.format.findMany.mockResolvedValue([]);
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants('ref-1', [], 'my-poster');

      expect(result).toEqual({ synced: 0, skipped: 0 });
      expect(mockPrisma.productFormatVariant.upsert).not.toHaveBeenCalled();
    });

    it('stores every variant of the same size as its own row', async () => {
      mockPrisma.format.findMany.mockResolvedValue([
        { id: 'fmt-1', shopifyVariantOption: '8x10' },
      ]);
      mockPrisma.productFormatVariant.upsert.mockResolvedValue({});
      mockPrisma.productFormatVariant.updateMany.mockResolvedValue({});

      const result = await service.syncVariants(
        'ref-1',
        [
          {
            id: 1,
            title: '8x10 / Black',
            option1: '8x10',
            option2: 'Black',
            option3: null,
          },
          {
            id: 2,
            title: '8x10 / White',
            option1: '8x10',
            option2: 'White',
            option3: null,
          },
          {
            id: 3,
            title: '8x10 / Oak',
            option1: '8x10',
            option2: 'Oak',
            option3: null,
          },
        ],
        'my-poster',
      );

      expect(result).toEqual({ synced: 3, skipped: 0 });
      expect(mockPrisma.productFormatVariant.upsert).toHaveBeenCalledTimes(3);
      expect(mockPrisma.format.findMany).toHaveBeenCalledTimes(1);

      expect(mockPrisma.productFormatVariant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productRefId_shopifyVariantId: {
              productRefId: 'ref-1',
              shopifyVariantId: '1',
            },
          },
          create: expect.objectContaining({
            shopifyVariantId: '1',
            formatId: 'fmt-1',
          }) as unknown,
        }),
      );
      expect(mockPrisma.productFormatVariant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productRefId_shopifyVariantId: {
              productRefId: 'ref-1',
              shopifyVariantId: '2',
            },
          },
        }),
      );
      expect(mockPrisma.productFormatVariant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            productRefId_shopifyVariantId: {
              productRefId: 'ref-1',
              shopifyVariantId: '3',
            },
          },
        }),
      );
    });
  });
});
