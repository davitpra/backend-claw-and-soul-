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

  /**
   * Comprueba que quien pide la baja es realmente el titular.
   *
   * Se exige escribir el email siempre, y la contraseña además cuando la cuenta
   * tiene una: las creadas con Google no la tienen, y pedirla las dejaría sin
   * forma de darse de baja.
   */
  async assertCanDeleteAccount(
    userId: string,
    input: { confirmEmail: string; password?: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      user.email.trim().toLowerCase() !==
      input.confirmEmail.trim().toLowerCase()
    ) {
      throw new UnauthorizedException('The email does not match this account');
    }

    if (user.passwordHash) {
      if (!input.password) {
        throw new UnauthorizedException('Password is required');
      }

      const isPasswordValid = await bcrypt.compare(
        input.password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Password is incorrect');
      }
    }
  }

  async updateLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Quita el hash de la contraseña y deja en su lugar `hasPassword`: el
   * storefront necesita saber si la cuenta tiene contraseña (las de Google no)
   * para decidir si pedirla al confirmar acciones sensibles.
   */
  private sanitizeUser(
    user: User,
  ): Omit<User, 'passwordHash'> & { hasPassword: boolean } {
    const { passwordHash, ...result } = user;
    return { ...result, hasPassword: Boolean(passwordHash) };
  }
}
