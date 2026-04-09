import { Test, TestingModule } from '@nestjs/testing';
import { CompatService } from './compat.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  styleFormatProductCompat: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  productFormatVariant: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

const mockFormat = {
  id: 'fmt-1',
  name: 'portrait_8x10',
  displayName: '8x10 Retrato',
  aspectRatio: '4:5',
  width: 1024,
  height: 1280,
  shopifyVariantOption: '8x10',
  isActive: true,
};

describe('CompatService', () => {
  let service: CompatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompatService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CompatService>(CompatService);
    jest.clearAllMocks();
  });

  describe('getFormatsByProduct', () => {
    it('returns formats enriched with shopifyVariantId when variant exists', async () => {
      mockPrisma.styleFormatProductCompat.findMany.mockResolvedValue([
        { format: mockFormat, formatId: 'fmt-1' },
      ]);
      mockPrisma.productFormatVariant.findMany.mockResolvedValue([
        { formatId: 'fmt-1', shopifyVariantId: 'gid://shopify/ProductVariant/12345' },
      ]);

      const result = await service.getFormatsByProduct('ref-1');

      expect(result).toEqual([
        {
          ...mockFormat,
          shopifyVariantId: 'gid://shopify/ProductVariant/12345',
          shopifyVariantOption: '8x10',
        },
      ]);
      expect(mockPrisma.productFormatVariant.findMany).toHaveBeenCalledWith({
        where: { productRefId: 'ref-1', formatId: { in: ['fmt-1'] }, isActive: true },
        select: { formatId: true, shopifyVariantId: true },
      });
    });

    it('returns shopifyVariantId as null when no active variant exists', async () => {
      mockPrisma.styleFormatProductCompat.findMany.mockResolvedValue([
        { format: mockFormat, formatId: 'fmt-1' },
      ]);
      mockPrisma.productFormatVariant.findMany.mockResolvedValue([]);

      const result = await service.getFormatsByProduct('ref-1');

      expect(result[0].shopifyVariantId).toBeNull();
    });

    it('returns empty array when no compat rules exist', async () => {
      mockPrisma.styleFormatProductCompat.findMany.mockResolvedValue([]);
      mockPrisma.productFormatVariant.findMany.mockResolvedValue([]);

      const result = await service.getFormatsByProduct('ref-1');

      expect(result).toEqual([]);
      expect(mockPrisma.productFormatVariant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('checkCompat', () => {
    it('returns compatible true with format and shopifyVariantId when rule and variant exist', async () => {
      mockPrisma.styleFormatProductCompat.findUnique.mockResolvedValue({
        isActive: true,
        format: mockFormat,
        constraints: { maxPets: 1 },
      });
      mockPrisma.productFormatVariant.findUnique.mockResolvedValue({
        shopifyVariantId: 'gid://shopify/ProductVariant/12345',
        isActive: true,
      });

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toEqual({
        compatible: true,
        format: mockFormat,
        shopifyVariantId: 'gid://shopify/ProductVariant/12345',
        constraints: { maxPets: 1 },
      });
    });

    it('returns shopifyVariantId null when variant is inactive', async () => {
      mockPrisma.styleFormatProductCompat.findUnique.mockResolvedValue({
        isActive: true,
        format: mockFormat,
        constraints: null,
      });
      mockPrisma.productFormatVariant.findUnique.mockResolvedValue({
        shopifyVariantId: 'gid://shopify/ProductVariant/12345',
        isActive: false,
      });

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toMatchObject({ compatible: true, shopifyVariantId: null });
    });

    it('returns shopifyVariantId null when no variant record exists', async () => {
      mockPrisma.styleFormatProductCompat.findUnique.mockResolvedValue({
        isActive: true,
        format: mockFormat,
        constraints: null,
      });
      mockPrisma.productFormatVariant.findUnique.mockResolvedValue(null);

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toMatchObject({ compatible: true, shopifyVariantId: null });
    });

    it('returns compatible false when rule does not exist', async () => {
      mockPrisma.styleFormatProductCompat.findUnique.mockResolvedValue(null);

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toEqual({ compatible: false });
      expect(mockPrisma.productFormatVariant.findUnique).not.toHaveBeenCalled();
    });

    it('returns compatible false when rule is inactive', async () => {
      mockPrisma.styleFormatProductCompat.findUnique.mockResolvedValue({
        isActive: false,
        format: mockFormat,
        constraints: null,
      });

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toEqual({ compatible: false });
    });
  });
});
