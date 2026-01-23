import { Module, Global } from '@nestjs/common';
import { PrismaService } from '@eccomerce/backend/prisma-client';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
