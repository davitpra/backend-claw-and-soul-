// `uuid` se publica como ESM puro y el preset de Jest no transforma node_modules:
// sin este mock el import del service revienta al cargar el módulo.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { PaintByNumbersService } from './paint-by-numbers.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const mockPrisma = {
  paintByNumbers: {
    count: jest.fn(),
    create: jest.fn(),
  },
};

const mockStorage = {
  upload: jest.fn(),
  delete: jest.fn(),
};

/** SVG mínimo: `create` lo exige antes de cualquier otra validación. */
const svgFile = {
  buffer: Buffer.from('<svg/>'),
  mimetype: 'image/svg+xml',
} as Express.Multer.File;

const input = { config: '{}' };

describe('PaintByNumbersService', () => {
  let service: PaintByNumbersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaintByNumbersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<PaintByNumbersService>(PaintByNumbersService);
    jest.clearAllMocks();
    mockStorage.upload.mockResolvedValue('https://cdn.test/asset');
    mockPrisma.paintByNumbers.create.mockResolvedValue({ id: 'pbn-1' });
  });

  describe('create — cuota por usuario', () => {
    it('rechaza con 409 al llegar al tope y no sube nada a storage', async () => {
      mockPrisma.paintByNumbers.count.mockResolvedValue(10);

      await expect(
        service.create('user-1', 'user', { svg: svgFile }, input),
      ).rejects.toBeInstanceOf(ConflictException);

      // Lo importante del orden: la guarda va antes de `uploadArtifacts`, así que
      // un rechazo no deja artefactos huérfanos en Cloudinary.
      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(mockPrisma.paintByNumbers.create).not.toHaveBeenCalled();
    });

    it('no cuenta los PBN ya comprados', async () => {
      mockPrisma.paintByNumbers.count.mockResolvedValue(9);

      await service.create('user-1', 'user', { svg: svgFile }, input);

      expect(mockPrisma.paintByNumbers.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: { not: 'ordered' } },
      });
      expect(mockPrisma.paintByNumbers.create).toHaveBeenCalled();
    });

    it('deja pasar a los admin sin contar', async () => {
      await service.create('admin-1', 'admin', { svg: svgFile }, input);

      expect(mockPrisma.paintByNumbers.count).not.toHaveBeenCalled();
      expect(mockPrisma.paintByNumbers.create).toHaveBeenCalled();
    });
  });
});
