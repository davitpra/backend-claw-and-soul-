import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ImageEnhancementService } from './image-enhancement.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FalService } from '../generations/providers/fal/fal.service';

jest.mock('cloudinary', () => ({
  v2: {
    url: jest.fn(
      (id: string, opts: { type?: string }) =>
        `https://cdn.test/${opts?.type ?? 'upload'}/${id}`,
    ),
    uploader: { upload: jest.fn() },
    api: { resource: jest.fn() },
  },
}));

jest.mock('uuid', () => ({ v4: () => 'fixed-uuid' }));

const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  normalise: jest.fn().mockReturnThis(),
  modulate: jest.fn().mockReturnThis(),
  linear: jest.fn().mockReturnThis(),
  sharpen: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('jpeg-bytes')),
};
jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(() => mockSharpInstance),
}));

const mockPrisma = {
  orderItem: { findFirst: jest.fn(), update: jest.fn() },
  orderEvent: { create: jest.fn() },
};
const mockStorage = { upload: jest.fn(), delete: jest.fn() };
const mockFal = { generate: jest.fn() };
const mockConfig = { get: jest.fn() };

const cldUrl = cloudinary.url as jest.Mock;
const cldUpload = cloudinary.uploader.upload as jest.Mock;
const cldResource = cloudinary.api.resource as jest.Mock;

const KEY = 'orders/order-1/items/item-1/print/fixed-uuid';
const GEN_URL = 'https://res.cloudinary.com/x/image/upload/gen-key.png';

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    orderId: 'order-1',
    fulfillmentMethod: 'pod',
    imageUrl: 'https://shopify.test/raw.jpg',
    printImageUrl: null,
    printImageStorageKey: null,
    printSourceUrl: null,
    printSourceStorageKey: null,
    generation: { resultUrl: GEN_URL, resultStorageKey: 'gen-key' },
    productVariant: { podConfig: { width: 20, height: 20 } },
    ...overrides,
  };
}

describe('ImageEnhancementService', () => {
  let service: ImageEnhancementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageEnhancementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: FalService, useValue: mockFal },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ImageEnhancementService>(ImageEnhancementService);
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue(false); // ai.mock = false by default
    mockStorage.delete.mockResolvedValue(undefined);
    mockStorage.upload.mockResolvedValue('https://cdn.test/uploaded');
    mockPrisma.orderItem.update.mockResolvedValue({});
    mockPrisma.orderEvent.create.mockResolvedValue({});
    cldUpload.mockResolvedValue({ public_id: KEY });
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }) as unknown as typeof fetch;
  });

  describe('getEnhanceInfo', () => {
    it('computes DPI and recommends no upscale when resolution is sufficient', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(makeItem());
      cldResource.mockResolvedValue({ width: 3000, height: 3000 }); // 3000/20 = 150 DPI

      const info = await service.getEnhanceInfo('order-1', 'item-1');

      expect(cldResource).toHaveBeenCalledWith('gen-key');
      expect(info.currentDpi).toBe(150);
      expect(info.recommendedUpscale).toBe(0);
      expect(info.printInches).toEqual({ width: 20, height: 20 });
      expect(info.sourceUrl).toBe(GEN_URL);
      expect(info.alreadyEnhanced).toBe(false);
    });

    it('returns unknown DPI and a safe upscale when source is not on Cloudinary', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(
        makeItem({ generation: null }), // falls back to Shopify imageUrl
      );

      const info = await service.getEnhanceInfo('order-1', 'item-1');

      expect(cldResource).not.toHaveBeenCalled();
      expect(info.currentDpi).toBeNull();
      expect(info.recommendedUpscale).toBe(2);
      expect(info.sourceUrl).toBe('https://shopify.test/raw.jpg');
    });

    it('returns sourceUrl null when there is no generation and no Shopify image', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(
        makeItem({
          generation: null,
          imageUrl: null,
          printImageUrl: 'https://cdn/broken.png',
        }),
      );

      const info = await service.getEnhanceInfo('order-1', 'item-1');

      // never sources from printImageUrl
      expect(info.sourceUrl).toBeNull();
      expect(info.alreadyEnhanced).toBe(true);
    });

    it('throws NotFoundException when the item does not exist', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(null);
      await expect(
        service.getEnhanceInfo('order-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('applyEnhance — Motor B (sharp + fal)', () => {
    it('upscales via fal from the ORIGINAL, re-encodes with sharp, and stores a flat JPEG', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(
        makeItem({
          printImageUrl: 'https://cdn/old-enhanced.png',
          printImageStorageKey: 'old-key',
        }),
      );
      mockFal.generate.mockResolvedValue({
        requestId: 'req-1',
        imageBuffer: Buffer.from('img'),
        contentType: 'image/png',
      });

      const res = await service.applyEnhance(
        'order-1',
        'item-1',
        { upscale: 2, sharpen: 60, improve: true },
        'admin-9',
      );

      // fal fed the original generation result, never the prior printImageUrl
      expect(mockFal.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'fal-ai/clarity-upscaler',
          params: { image_url: GEN_URL, upscale_factor: 2 },
        }),
      );
      // sharp re-encode capped to print size (20in × 300dpi = 6000px) → JPEG
      expect(mockSharpInstance.resize).toHaveBeenCalledWith({
        width: 6000,
        height: 6000,
        fit: 'inside',
        withoutEnlargement: true,
      });
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 92 }),
      );
      // stored as a flat upload asset (no Cloudinary transform URL)
      expect(mockStorage.upload).toHaveBeenCalledWith(
        KEY,
        Buffer.from('jpeg-bytes'),
        'image/jpeg',
      );
      expect(mockStorage.delete).toHaveBeenCalledWith('old-key');
      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          printImageUrl: 'https://cdn.test/uploaded',
          printImageStorageKey: KEY,
        },
      });
      expect(mockPrisma.orderEvent.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          orderItemId: 'item-1',
          eventType: 'print_image_enhanced',
          source: 'admin',
          userId: 'admin-9',
          payload: {
            engine: 'sharp',
            options: { upscale: 2, sharpen: 60, improve: true },
            printImageUrl: 'https://cdn.test/uploaded',
          },
        },
      });
      expect(res.printImageUrl).toBe('https://cdn.test/uploaded');
    });

    it('downloads the original (no fal) when no upscale is requested', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(makeItem());

      await service.applyEnhance('order-1', 'item-1', { sharpen: 40 });

      expect(mockFal.generate).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledWith(GEN_URL);
      expect(mockStorage.upload).toHaveBeenCalledWith(
        KEY,
        Buffer.from('jpeg-bytes'),
        'image/jpeg',
      );
      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          printImageUrl: 'https://cdn.test/uploaded',
          printImageStorageKey: KEY,
        },
      });
    });

    it('skips fal upscale when MOCK_AI is enabled but still produces a stored asset', async () => {
      mockConfig.get.mockReturnValue(true);
      mockPrisma.orderItem.findFirst.mockResolvedValue(makeItem());

      await service.applyEnhance('order-1', 'item-1', { upscale: 2 });

      expect(mockFal.generate).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledWith(GEN_URL);
      expect(mockStorage.upload).toHaveBeenCalled();
    });

    it('enhances a manual-upload source without deleting the original art', async () => {
      // un-enhanced manual upload: printImage == printSource (same asset)
      mockPrisma.orderItem.findFirst.mockResolvedValue(
        makeItem({
          generation: null,
          imageUrl: null,
          printSourceUrl: 'https://cdn/src.png',
          printSourceStorageKey: 'src-key',
          printImageUrl: 'https://cdn/src.png',
          printImageStorageKey: 'src-key',
        }),
      );

      await service.applyEnhance('order-1', 'item-1', { sharpen: 40 });

      // sources from the uploaded art, not the (equal) printImageUrl
      expect(globalThis.fetch).toHaveBeenCalledWith('https://cdn/src.png');
      // never deletes the source asset
      expect(mockStorage.delete).not.toHaveBeenCalled();
      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          printImageUrl: 'https://cdn.test/uploaded',
          printImageStorageKey: KEY,
        },
      });
    });
  });

  describe('applyEnhance — Motor A (cloudinary)', () => {
    it('uploads the original to Cloudinary and delivers it with a transform URL', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(makeItem());

      const res = await service.applyEnhance(
        'order-1',
        'item-1',
        { engine: 'cloudinary', upscale: 2, improve: true, sharpen: 60 },
        'admin-9',
      );

      expect(cldUpload).toHaveBeenCalledWith(GEN_URL, {
        public_id: KEY,
        resource_type: 'image',
        overwrite: true,
      });
      // Motor A does not run fal nor the sharp/storage upload path
      expect(mockFal.generate).not.toHaveBeenCalled();
      expect(mockStorage.upload).not.toHaveBeenCalled();
      // delivered as an upload-type transform URL (no nested fetch)
      expect(res.printImageUrl).toBe(`https://cdn.test/upload/${KEY}`);
      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          printImageUrl: `https://cdn.test/upload/${KEY}`,
          printImageStorageKey: KEY,
        },
      });
      const eventCall = mockPrisma.orderEvent.create.mock.calls[0] as [
        { data: { payload: { engine: string } } },
      ];
      expect(eventCall[0].data.payload.engine).toBe('cloudinary');
    });
  });

  describe('applyEnhance — no source', () => {
    it('throws BadRequestException when the item has no generation/Shopify image', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(
        makeItem({
          generation: null,
          imageUrl: null,
          printImageUrl: 'https://cdn/broken.png',
        }),
      );

      await expect(
        service.applyEnhance('order-1', 'item-1', { upscale: 2 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockFal.generate).not.toHaveBeenCalled();
    });
  });

  describe('revertEnhance', () => {
    it('deletes the enhanced asset and restores the manual-upload source art', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(
        makeItem({
          printSourceUrl: 'https://cdn/src.png',
          printSourceStorageKey: 'src-key',
          printImageUrl: 'https://cdn/enhanced.png',
          printImageStorageKey: 'enh-key',
        }),
      );

      const res = await service.revertEnhance('order-1', 'item-1', 'admin-9');

      expect(mockStorage.delete).toHaveBeenCalledWith('enh-key');
      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: {
          printImageUrl: 'https://cdn/src.png',
          printImageStorageKey: 'src-key',
        },
      });
      expect(mockPrisma.orderEvent.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          orderItemId: 'item-1',
          eventType: 'print_image_reverted',
          source: 'admin',
          userId: 'admin-9',
          payload: {},
        },
      });
      expect(res).toEqual({ printImageUrl: 'https://cdn/src.png' });
    });

    it('clears the print image when there is no source art', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(
        makeItem({
          printImageUrl: 'https://cdn/enhanced.png',
          printImageStorageKey: 'enh-key',
        }),
      );

      const res = await service.revertEnhance('order-1', 'item-1');

      expect(mockStorage.delete).toHaveBeenCalledWith('enh-key');
      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { printImageUrl: null, printImageStorageKey: null },
      });
      expect(res).toEqual({ printImageUrl: null });
    });
  });

  describe('previewEnhance', () => {
    it('returns an inline data URI for the sharp engine without running fal', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(makeItem());

      const res = await service.previewEnhance('order-1', 'item-1', {
        upscale: 4,
        contrast: 10,
      });

      expect(mockFal.generate).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledWith(GEN_URL);
      expect(res.willUpscale).toBe(true);
      expect(res.previewUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    });

    it('returns an upload-type Cloudinary URL for the cloudinary engine', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(makeItem());

      const res = await service.previewEnhance('order-1', 'item-1', {
        engine: 'cloudinary',
        contrast: 10,
      });

      // original has resultStorageKey 'gen-key' → delivered over the upload asset
      expect(res.previewUrl).toBe('https://cdn.test/upload/gen-key');
      expect(cldUrl).toHaveBeenCalledWith(
        'gen-key',
        expect.objectContaining({ type: 'upload' }),
      );
    });
  });
});
