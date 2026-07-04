import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Cloudinary (free tier) rejects raster images over 10 MB. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Longest edge the compressed source is downscaled to, if larger. */
const SOURCE_MAX_DIMENSION = 2400;
import {
  createPaginatedResult,
  getPaginationParams,
} from '../common/utils/pagination.util';

/** Uploaded artifacts for a PBN. All optional except the SVG (master). */
export interface PbnUploadFiles {
  source?: Express.Multer.File;
  svg?: Express.Multer.File;
  preview?: Express.Multer.File;
  palette?: Express.Multer.File;
}

export interface CreatePbnInput {
  config: string;
  generationId?: string;
  petId?: string;
  colorCount?: string;
}

@Injectable()
export class PaintByNumbersService {
  private readonly logger = new Logger(PaintByNumbersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Persist a client-rendered PBN: uploads the artifacts to Cloudinary and
   * stores the row. `origin` is 'admin' when saved by an admin user.
   */
  async create(
    userId: string,
    userRole: string,
    files: PbnUploadFiles,
    input: CreatePbnInput,
  ) {
    if (!files.svg) {
      throw new BadRequestException('The outline SVG is required');
    }

    let config: Prisma.InputJsonValue;
    try {
      config = JSON.parse(input.config) as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException('config must be valid JSON');
    }

    // Validate optional relations belong to the user before uploading.
    if (input.generationId) {
      const gen = await this.prisma.generation.findFirst({
        where: { id: input.generationId, userId },
        select: { id: true },
      });
      if (!gen) throw new BadRequestException('Invalid generationId');
    }
    if (input.petId) {
      const pet = await this.prisma.pet.findFirst({
        where: { id: input.petId, userId },
        select: { id: true },
      });
      if (!pet) throw new BadRequestException('Invalid petId');
    }

    // Pre-generate the id so artifact keys can be namespaced by the PBN.
    const pbnId = uuidv4();
    const uploadArtifact = async (
      file: Express.Multer.File | undefined,
      kind: string,
    ): Promise<{ url: string; key: string } | null> => {
      if (!file) return null;
      let buffer = file.buffer;
      let mimetype = file.mimetype;
      // The source is the raw original and can exceed Cloudinary's size cap;
      // downscale/re-encode it so the upload doesn't get rejected.
      if (kind === 'source' && buffer.byteLength > MAX_UPLOAD_BYTES) {
        ({ buffer, mimetype } = await this.compressSource(buffer));
      }
      const key = `paint-by-numbers/${pbnId}/${kind}/${uuidv4()}`;
      const url = await this.storage.upload(key, buffer, mimetype);
      return { url, key };
    };

    const [source, svg, preview, palette] = await Promise.all([
      uploadArtifact(files.source, 'source'),
      uploadArtifact(files.svg, 'svg'),
      uploadArtifact(files.preview, 'preview'),
      uploadArtifact(files.palette, 'palette'),
    ]);

    const colorCount = input.colorCount
      ? Number.parseInt(input.colorCount, 10)
      : null;

    return this.prisma.paintByNumbers.create({
      data: {
        id: pbnId,
        userId,
        generationId: input.generationId ?? null,
        petId: input.petId ?? null,
        config,
        sourceImageUrl: source?.url ?? null,
        sourceImageStorageKey: source?.key ?? null,
        outlineSvgUrl: svg?.url ?? null,
        outlineSvgStorageKey: svg?.key ?? null,
        previewUrl: preview?.url ?? null,
        previewStorageKey: preview?.key ?? null,
        paletteUrl: palette?.url ?? null,
        paletteStorageKey: palette?.key ?? null,
        colorCount: Number.isNaN(colorCount as number) ? null : colorCount,
        origin: userRole === 'admin' ? 'admin' : 'customer',
      },
    });
  }

  /**
   * Downscale and re-encode an oversized source raster to WebP, stepping the
   * quality down until it fits under Cloudinary's upload limit. WebP keeps
   * alpha, so PNG sources with transparency survive.
   */
  private async compressSource(
    input: Buffer,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const base = sharp(input, { failOn: 'none' }).rotate().resize({
      width: SOURCE_MAX_DIMENSION,
      height: SOURCE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });

    for (const quality of [85, 75, 65, 55, 45]) {
      const buffer = await base.clone().webp({ quality }).toBuffer();
      if (buffer.byteLength <= MAX_UPLOAD_BYTES) {
        this.logger.log(
          `Compressed PBN source ${input.byteLength} -> ${buffer.byteLength} bytes (webp q${quality})`,
        );
        return { buffer, mimetype: 'image/webp' };
      }
    }

    throw new BadRequestException(
      'The source image is too large to store even after compression',
    );
  }

  async findUserPbns(userId: string, page: number, limit: number) {
    const { skip, take } = getPaginationParams(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.paintByNumbers.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.paintByNumbers.count({ where: { userId } }),
    ]);
    return createPaginatedResult(items, total, page, limit);
  }

  /** Admin listing across all users, optionally filtered. */
  async findAll(page: number, limit: number, origin?: string) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.PaintByNumbersWhereInput = origin ? { origin } : {};
    const [items, total] = await Promise.all([
      this.prisma.paintByNumbers.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      this.prisma.paintByNumbers.count({ where }),
    ]);
    return createPaginatedResult(items, total, page, limit);
  }

  /** When userId is provided, ownership is enforced. */
  async findOne(id: string, userId?: string) {
    const pbn = await this.prisma.paintByNumbers.findUnique({ where: { id } });
    if (!pbn || (userId && pbn.userId !== userId)) {
      throw new NotFoundException('Paint-by-Numbers not found');
    }
    return pbn;
  }

  async updateFlags(id: string, userId: string, isPublic?: boolean) {
    await this.findOne(id, userId);
    return this.prisma.paintByNumbers.update({
      where: { id },
      data: { ...(isPublic !== undefined ? { isPublic } : {}) },
    });
  }

  /** Deletes the row and best-effort removes the Cloudinary artifacts. */
  async delete(id: string, userId?: string) {
    const pbn = await this.findOne(id, userId);
    const keys = [
      pbn.sourceImageStorageKey,
      pbn.outlineSvgStorageKey,
      pbn.previewStorageKey,
      pbn.paletteStorageKey,
    ].filter((k): k is string => Boolean(k));

    await Promise.all(
      keys.map((key) =>
        this.storage.delete(key).catch((err) => {
          this.logger.warn(
            `Failed to delete PBN artifact ${key}: ${(err as Error).message}`,
          );
        }),
      ),
    );

    await this.prisma.paintByNumbers.delete({ where: { id } });
    return { success: true };
  }
}
