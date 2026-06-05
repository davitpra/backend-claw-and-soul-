import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProviderRateService implements OnModuleInit {
  private readonly logger = new Logger(ProviderRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seed();
  }

  async list() {
    const rates = await this.prisma.providerRate.findMany({
      orderBy: [{ provider: 'asc' }, { model: 'asc' }],
    });
    return rates.map((r) => ({ ...r, amount: r.amount.toNumber() }));
  }

  async getRate(
    provider: string,
    model: string,
  ): Promise<{ unit: string; amount: number; currency: string } | null> {
    const rate = await this.prisma.providerRate.findUnique({
      where: { provider_model: { provider, model } },
    });
    if (!rate || !rate.isActive) return null;
    return {
      unit: rate.unit,
      amount: rate.amount.toNumber(),
      currency: rate.currency,
    };
  }

  async upsert(
    provider: string,
    model: string,
    data: { unit?: string; amount?: number; currency?: string },
    adminId?: string,
  ) {
    const existing = await this.prisma.providerRate.findUnique({
      where: { provider_model: { provider, model } },
    });

    if (!existing)
      throw new NotFoundException(`No rate found for ${provider}/${model}`);

    const updated = await this.prisma.providerRate.update({
      where: { provider_model: { provider, model } },
      data: {
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        updatedBy: adminId ?? null,
      },
    });
    return { ...updated, amount: updated.amount.toNumber() };
  }

  async upsertById(
    id: string,
    data: { unit?: string; amount?: number; currency?: string },
    adminId?: string,
  ) {
    const existing = await this.prisma.providerRate.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`No rate found with id ${id}`);

    const updated = await this.prisma.providerRate.update({
      where: { id },
      data: {
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        updatedBy: adminId ?? null,
      },
    });
    return { ...updated, amount: updated.amount.toNumber() };
  }

  async ensureRate(
    provider: string,
    model: string,
    defaultUnit = 'per_image',
  ): Promise<{ unit: string; amount: number; currency: string }> {
    const rate = await this.prisma.providerRate.upsert({
      where: { provider_model: { provider, model } },
      create: {
        provider,
        model,
        unit: defaultUnit,
        amount: 0,
        currency: 'USD',
        isActive: true,
      },
      update: {},
    });
    return {
      unit: rate.unit,
      amount: rate.amount.toNumber(),
      currency: rate.currency,
    };
  }

  async getRateOrEnsure(
    provider: string,
    model: string,
    defaultUnit = 'per_image',
  ): Promise<{ unit: string; amount: number; currency: string }> {
    const existing = await this.getRate(provider, model);
    if (existing) return existing;
    this.logger.warn(
      `No rate for ${provider}/${model} — auto-registering at $0. Configure it at /admin/expenses.`,
    );
    return this.ensureRate(provider, model, defaultUnit);
  }

  async seed() {
    const defaults = [
      {
        provider: 'fal',
        model: 'fal-ai/flux/dev',
        unit: 'per_image',
        amount: 0.025,
        currency: 'USD',
      },
      {
        provider: 'fal',
        model: 'fal-ai/nano-banana-2/edit',
        unit: 'per_image',
        amount: 0.08,
        currency: 'USD',
      },
      {
        provider: 'fal',
        model: 'fal-ai/seedvr/upscale/image',
        unit: 'per_megapixel',
        amount: 0.00005,
        currency: 'USD',
      },
    ];
    for (const d of defaults) {
      await this.prisma.providerRate.upsert({
        where: { provider_model: { provider: d.provider, model: d.model } },
        create: d,
        update: {},
      });
    }
  }
}
