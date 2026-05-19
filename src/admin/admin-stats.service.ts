import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminStatsService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      totalPets,
      totalGenerations,
      totalStyles,
      totalFormats,
      totalProducts,
      usersByRole,
      generationsByStatus,
      generationsByType,
      petsBySpecies,
      topStyles,
      recentSyncs,
      timeline,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.pet.count({ where: { isActive: true } }),
      this.prisma.generation.count(),
      this.prisma.style.count({ where: { isActive: true } }),
      this.prisma.format.count({ where: { isActive: true } }),
      this.prisma.productReference.count({ where: { isActive: true } }),

      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.generation.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.generation.groupBy({ by: ['type'], _count: { _all: true } }),
      this.prisma.pet.groupBy({ by: ['species'], _count: { _all: true } }),

      this.prisma.generation
        .groupBy({
          by: ['styleId'],
          _count: { _all: true },
          orderBy: { _count: { styleId: 'desc' } },
          take: 8,
        })
        .then(async (rows) => {
          if (rows.length === 0) return [];
          const styleIds = rows.map((r) => r.styleId);
          const styles = await this.prisma.style.findMany({
            where: { id: { in: styleIds } },
            select: { id: true, displayName: true },
          });
          const nameMap = new Map(styles.map((s) => [s.id, s.displayName]));
          return rows.map((r) => ({
            styleId: r.styleId,
            displayName: nameMap.get(r.styleId) ?? r.styleId,
            count: r._count._all,
          }));
        }),

      this.prisma.syncLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5,
      }),

      this.prisma.$queryRaw<{ day: Date; count: number }[]>`
        SELECT
          DATE_TRUNC('day', created_at)::date AS day,
          COUNT(*)::int AS count
        FROM generations
        WHERE created_at >= ${thirtyDaysAgo}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    return {
      totals: {
        users: totalUsers,
        pets: totalPets,
        generations: totalGenerations,
        styles: totalStyles,
        formats: totalFormats,
        products: totalProducts,
      },
      usersByRole: Object.fromEntries(
        usersByRole.map((r) => [r.role, r._count._all]),
      ),
      generationsByStatus: Object.fromEntries(
        generationsByStatus.map((r) => [r.status, r._count._all]),
      ),
      generationsByType: Object.fromEntries(
        generationsByType.map((r) => [r.type, r._count._all]),
      ),
      petsBySpecies: Object.fromEntries(
        petsBySpecies.map((r) => [r.species, r._count._all]),
      ),
      topStyles,
      recentSyncs,
      timeline: timeline.map((r) => ({
        day: r.day.toISOString().split('T')[0],
        count: Number(r.count),
      })),
    };
  }
}
