import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async updateProfile(userId: string, data: { fullName?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return this.sanitizeUser(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Accounts created via Google sign-in have no password to change
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google sign-in and has no password',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password updated successfully' };
  }

  async updateAvatar(
    userId: string,
    avatarUrl: string,
    avatarStorageKey: string,
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl, avatarStorageKey },
    });

    return this.sanitizeUser(user);
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null, avatarStorageKey: null },
    });

    return this.sanitizeUser(user);
  }

  async updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...result } = user;
    void passwordHash;
    return result;
  }
}
