import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountStatusService } from './account-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/**
 * `$transaction` recibe un callback: se le pasa el propio mock como cliente de
 * transacción, que es lo que hace el servicio con `tx.user.update` etc.
 */
const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  pet: { updateMany: jest.fn() },
  petPhoto: { findMany: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockStorage = { delete: jest.fn() };

const activeUser = {
  id: 'user-1',
  email: 'ana@correo.com',
  role: 'user',
  status: 'active',
  deletedAt: null,
  anonymizedAt: null,
};

/** Fila que devuelve `user.update`; el servicio la proyecta antes de responder. */
const updatedRow = {
  ...activeUser,
  passwordHash: 'hash-que-no-debe-salir',
  isActive: false,
  status: 'banned',
  statusReason: 'spam',
  statusChangedAt: new Date(),
  statusChangedBy: 'admin-1',
};

describe('AccountStatusService', () => {
  let service: AccountStatusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountStatusService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get(AccountStatusService);
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(mockPrisma),
    );
    mockPrisma.user.update.mockResolvedValue(updatedRow);
    mockStorage.delete.mockResolvedValue(undefined);
  });

  describe('setStatus', () => {
    it('suspends the account, revokes its sessions and writes an audit log', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.setStatus('user-1', 'banned', {
        reason: 'spam',
        actorId: 'admin-1',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            status: 'banned',
            isActive: false,
            statusReason: 'spam',
            statusChangedBy: 'admin-1',
          }),
        }),
      );
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'user.banned',
            entityType: 'User',
            entityId: 'user-1',
            userId: 'admin-1',
          }),
        }),
      );
    });

    it('never returns the password hash', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      const result = await service.setStatus('user-1', 'banned', {
        reason: 'spam',
        actorId: 'admin-1',
      });

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('keeps the sessions alive when reactivating', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'banned',
      });

      await service.setStatus('user-1', 'active', { actorId: 'admin-1' });

      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('requires a reason to suspend', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.setStatus('user-1', 'banned', { actorId: 'admin-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to act on the acting admin own account', async () => {
      await expect(
        service.setStatus('admin-1', 'banned', {
          reason: 'x',
          actorId: 'admin-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('refuses to change the status of a deleted account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'deleted',
      });

      await expect(
        service.setStatus('user-1', 'banned', {
          reason: 'x',
          actorId: 'admin-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a no-op transition', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.setStatus('user-1', 'active', { actorId: 'admin-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.setStatus('ghost', 'banned', {
          reason: 'x',
          actorId: 'admin-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('stamps deletedAt and allows the user to delete their own account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await service.softDelete('user-1', { actor: 'self' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'deleted',
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('requires a reason when an admin deletes the account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.softDelete('user-1', { actor: 'admin', actorId: 'admin-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('restore', () => {
    it('refuses to restore an already anonymized account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'deleted',
        anonymizedAt: new Date(),
      });

      await expect(service.restore('user-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to restore an account that is not deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(service.restore('user-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('anonymize', () => {
    it('erases the PII and its storage objects, but not orders or generations', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'deleted',
        avatarStorageKey: 'users/user-1/avatar/abc',
      });
      mockPrisma.petPhoto.findMany.mockResolvedValue([
        { id: 'photo-1', photoStorageKey: 'pets/photo-1' },
      ]);

      await service.anonymize('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'deleted-user-1@deleted.clawandsoul.local',
            fullName: null,
            googleId: null,
            passwordHash: null,
            anonymizedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockPrisma.petPhoto.deleteMany).toHaveBeenCalled();
      expect(mockStorage.delete).toHaveBeenCalledWith(
        'users/user-1/avatar/abc',
      );
      expect(mockStorage.delete).toHaveBeenCalledWith('pets/photo-1');
    });

    it('is a no-op when the account was already anonymized', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'deleted',
        anonymizedAt: new Date(),
      });

      await service.anonymize('user-1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to anonymize an account that is not deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(service.anonymize('user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
