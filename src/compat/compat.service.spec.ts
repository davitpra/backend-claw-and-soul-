import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompatService } from './compat.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  productFormatVariant: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  productReference: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
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

const mockStyle = {
  id: 'style-1',
  name: 'watercolor_portrait',
  displayName: 'Acuarela',
  sortOrder: 1,
  images: [],
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
    it('returns formats enriched with shopifyVariantId', async () => {
      mockPrisma.productFormatVariant.findMany.mockResolvedValue([
        {
          format: mockFormat,
          shopifyVariantId: 'gid://shopify/ProductVariant/12345',
          shopifyVariantTitle: '8x10 / Matte',
          constraints: null,
        },
      ]);

      const result = await service.getFormatsByProduct('ref-1');

      expect(result).toEqual([
        {
          ...mockFormat,
          shopifyVariantId: 'gid://shopify/ProductVariant/12345',
          shopifyVariantTitle: '8x10 / Matte',
          constraints: null,
        },
      ]);
      expect(mockPrisma.productFormatVariant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productRefId: 'ref-1', isActive: true },
          distinct: ['formatId'],
        }),
      );
    });

    it('returns empty array when no active variants exist', async () => {
      mockPrisma.productFormatVariant.findMany.mockResolvedValue([]);

      const result = await service.getFormatsByProduct('ref-1');

      expect(result).toEqual([]);
    });
  });

  describe('getStylesByProductAndFormat', () => {
    it('returns the single style fixed to the product', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({
        id: 'ref-1',
        styleId: 'style-1',
        style: mockStyle,
      });

      const result = await service.getStylesByProductAndFormat('ref-1', 'fmt-1');

      expect(result).toEqual([mockStyle]);
    });

    it('returns empty array when product has no style assigned', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({
        id: 'ref-1',
        styleId: null,
        style: null,
      });

      const result = await service.getStylesByProductAndFormat('ref-1', 'fmt-1');

      expect(result).toEqual([]);
    });

    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue(null);

      await expect(
        service.getStylesByProductAndFormat('nonexistent', 'fmt-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkCompat', () => {
    it('returns compatible true when product has given styleId and format variant exists', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({
        id: 'ref-1',
        isActive: true,
        styleId: 'style-1',
        style: mockStyle,
      });
      mockPrisma.productFormatVariant.findFirst.mockResolvedValue({
        format: mockFormat,
        shopifyVariantId: 'gid://shopify/ProductVariant/12345',
        constraints: { maxPets: 1 },
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

    it('returns compatible false when product styleId does not match', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({
        id: 'ref-1',
        isActive: true,
        styleId: 'other-style',
        style: null,
      });

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toEqual({ compatible: false });
      expect(mockPrisma.productFormatVariant.findFirst).not.toHaveBeenCalled();
    });

    it('returns compatible false when product is inactive', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({
        id: 'ref-1',
        isActive: false,
        styleId: 'style-1',
      });

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toEqual({ compatible: false });
    });

    it('returns compatible false when product not found', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue(null);

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toEqual({ compatible: false });
    });

    it('returns compatible false when format variant is inactive', async () => {
      mockPrisma.productReference.findUnique.mockResolvedValue({
        id: 'ref-1',
        isActive: true,
        styleId: 'style-1',
        style: mockStyle,
      });
      mockPrisma.productFormatVariant.findFirst.mockResolvedValue(null);

      const result = await service.checkCompat('style-1', 'fmt-1', 'ref-1');

      expect(result).toEqual({ compatible: false });
    });
  });
});
