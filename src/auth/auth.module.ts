import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthCleanupService } from './auth-cleanup.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({}), // Configuration is done in the service using ConfigService
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
