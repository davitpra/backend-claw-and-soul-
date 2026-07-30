import {
  BadRequestException,
  ConflictException,
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
/**
 * Obras guardadas (no compradas) que puede acumular una cuenta. Cada PBN arrastra
 * cuatro artefactos en Cloudinary, así que sin tope una cuenta puede inflar el
 * storage indefinidamente sin comprar nada.
 */
const MAX_PBN_PER_USER = 10;
import {
  createPaginatedResult,
  getPaginationParams,
} from '../common/utils/pagination.util';

/**
 * Whitelist de lo que ve el dueño de un PBN en `GET /paint-by-numbers/:id`.
 * Explícita a propósito (mismo criterio que `USER_GENERATION_SELECT`): una
 * columna nueva no se filtra sola al cliente.
 */
const USER_PBN_SELECT = {
  id: true,
  generationId: true,
  petId: true,
  sourceImageUrl: true,
  outlineSvgUrl: true,
  previewUrl: true,
  paletteUrl: true,
  config: true,
  colorCount: true,
  origin: true,
  status: true,
  isPublic: true,
  createdAt: true,
  pet: { select: { id: true, name: true } },
  generation: {
    select: {
      id: true,
      pet: { select: { id: true, name: true } },
      style: { select: { displayName: true, category: true } },
    },
  },
} satisfies Prisma.PaintByNumbersSelect;

/**
 * Whitelist del listado `GET /paint-by-numbers`. Subconjunto del detalle: sin
 * `config` (pesado, solo hace falta en la ficha) y sin las claves de storage.
 * Incluye `pet` y `generation.style` porque la galería titula cada card con el
 * nombre de la mascota y su estilo. La mascota viaja también dentro de
 * `generation`: al guardar un PBN no se manda `petId` (ver `useSavePbn` en el
 * front), así que el `pet` directo es null y el nombre solo se puede resolver a
 * través de la generación de origen.
 */
const USER_PBN_LIST_SELECT = {
  id: true,
  sourceImageUrl: true,
  previewUrl: true,
  outlineSvgUrl: true,
  paletteUrl: true,
  colorCount: true,
  status: true,
  // `origin` distingue el PBN que guardó el cliente del que montó un admin desde
  // el estudio de un pedido; lo pinta la pestaña PBN de la ficha de usuario.
  origin: true,
  createdAt: true,
  pet: { select: { id: true, name: true } },
  generation: {
    select: {
      id: true,
      pet: { select: { id: true, name: true } },
      style: { select: { displayName: true, category: true } },
    },
  },
} satisfies Prisma.PaintByNumbersSelect;

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
    await this.assertCanSave(userId, userRole);
    const config = this.parseConfig(input.config);

    // Validate optional relations belong to the user before uploading.
    let petId = input.petId ?? null;
    if (input.generationId) {
      const gen = await this.prisma.generation.findFirst({
        where: { id: input.generationId, userId },
        select: { id: true, petId: true },
      });
      if (!gen) throw new BadRequestException('Invalid generationId');
      // El cliente no manda `petId` (el studio solo conoce la generación), así
      // que lo heredamos de ella: sin esto el PBN queda huérfano de mascota y la
      // galería no puede titular la obra con su nombre.
      petId = petId ?? gen.petId;
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
    const { source, svg, preview, palette } = await this.uploadArtifacts(
      pbnId,
      files,
    );

    return this.prisma.paintByNumbers.create({
      data: {
        id: pbnId,
        userId,
        generationId: input.generationId ?? null,
        petId,
        config,
        sourceImageUrl: source?.url ?? null,
        sourceImageStorageKey: source?.key ?? null,
        outlineSvgUrl: svg?.url ?? null,
        outlineSvgStorageKey: svg?.key ?? null,
        previewUrl: preview?.url ?? null,
        previewStorageKey: preview?.key ?? null,
        paletteUrl: palette?.url ?? null,
        paletteStorageKey: palette?.key ?? null,
        colorCount: this.parseColorCount(input.colorCount),
        origin: userRole === 'admin' ? 'admin' : 'customer',
      },
    });
  }

  /**
   * Tope de obras guardadas por cuenta. Los PBN ya comprados (`status: 'ordered'`)
   * no consumen cupo: comprar libera espacio. Los admin están exentos, mismo
   * criterio que en créditos.
   *
   * Se llama al principio de `create()`, antes de `uploadArtifacts`: si el
   * rechazo llegase después habríamos subido cuatro ficheros a Cloudinary que
   * ninguna fila referencia. El borrado de PBN es duro (ver `delete`), así que
   * el conteo es exacto sin filtrar nada más.
   */
  private async assertCanSave(userId: string, userRole: string): Promise<void> {
    if (userRole === 'admin') return;

    const count = await this.prisma.paintByNumbers.count({
      where: { userId, status: { not: 'ordered' } },
    });
    if (count >= MAX_PBN_PER_USER) {
      throw new ConflictException(
        `You've reached the limit of ${MAX_PBN_PER_USER} saved paintings. Delete one from your gallery to save a new one.`,
      );
    }
  }

  /**
   * Reemplaza el contenido de un PBN existente con lo que acaba de renderizar el
   * estudio: sube los artefactos nuevos, pisa `config`/`colorCount` y borra de
   * storage los que quedaron huérfanos. Es lo que evita que reeditar una obra
   * desde `/studio?pbnId=…` acabe creando una copia con el mismo source.
   *
   * La obra en sí no cambia de dueño ni de origen, así que `userId`,
   * `generationId`, `petId`, `origin`, `status` e `isPublic` se conservan.
   *
   * Excepción: si el PBN ya fue comprado (`status: 'ordered'`) no se toca —
   * sería alterar el diseño que el cliente pagó y que producción debe imprimir.
   * En ese caso se guarda una copia nueva y se devuelve esa; el cliente adopta
   * el id que reciba, así que la regla vive aquí y no en el front.
   */
  async replaceArtifacts(
    id: string,
    userId: string,
    userRole: string,
    files: PbnUploadFiles,
    input: CreatePbnInput,
  ) {
    const existing = await this.findOne(id, userId);

    if (existing.status === 'ordered') {
      return this.create(userId, userRole, files, {
        ...input,
        // La copia cuelga de la misma generación/mascota que el original.
        generationId: existing.generationId ?? undefined,
        petId: existing.petId ?? undefined,
      });
    }

    if (!files.svg) {
      throw new BadRequestException('The outline SVG is required');
    }
    const config = this.parseConfig(input.config);

    const { source, svg, preview, palette } = await this.uploadArtifacts(
      id,
      files,
    );

    const updated = await this.prisma.paintByNumbers.update({
      where: { id },
      data: {
        config,
        colorCount: this.parseColorCount(input.colorCount),
        // Sólo se pisa lo que llegó: un artefacto opcional ausente (p. ej. la
        // guía de mezcla, que es best-effort) conserva el que ya había.
        ...(source
          ? { sourceImageUrl: source.url, sourceImageStorageKey: source.key }
          : {}),
        ...(svg
          ? { outlineSvgUrl: svg.url, outlineSvgStorageKey: svg.key }
          : {}),
        ...(preview
          ? { previewUrl: preview.url, previewStorageKey: preview.key }
          : {}),
        ...(palette
          ? { paletteUrl: palette.url, paletteStorageKey: palette.key }
          : {}),
      },
    });

    // Ya persistido lo nuevo: los assets sustituidos sobran. Best-effort, igual
    // que en `delete` — un fallo aquí sólo deja basura en Cloudinary.
    await this.deleteArtifacts([
      source ? existing.sourceImageStorageKey : null,
      svg ? existing.outlineSvgStorageKey : null,
      preview ? existing.previewStorageKey : null,
      palette ? existing.paletteStorageKey : null,
    ]);

    return updated;
  }

  /** `config` viaja como string en el multipart: se valida al parsear. */
  private parseConfig(raw: string): Prisma.InputJsonValue {
    try {
      return JSON.parse(raw) as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException('config must be valid JSON');
    }
  }

  private parseColorCount(raw?: string): number | null {
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Sube los artefactos que lleguen bajo `paint-by-numbers/<pbnId>/<kind>/`. La
   * clave lleva un uuid propio, así que al reemplazar nunca pisa la anterior
   * (que se borra aparte, ya con la fila actualizada).
   */
  private async uploadArtifacts(pbnId: string, files: PbnUploadFiles) {
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

    return { source, svg, preview, palette };
  }

  /** Borrado best-effort de claves de storage: nunca hace fallar al llamante. */
  private async deleteArtifacts(keys: (string | null)[]) {
    await Promise.all(
      keys
        .filter((k): k is string => Boolean(k))
        .map((key) =>
          this.storage.delete(key).catch((err) => {
            this.logger.warn(
              `Failed to delete PBN artifact ${key}: ${(err as Error).message}`,
            );
          }),
        ),
    );
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
        select: USER_PBN_LIST_SELECT,
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

  /**
   * When userId is provided, ownership is enforced. Devuelve la fila completa
   * (incluidas las storage keys que necesita `delete`), así que es de uso
   * interno y de las rutas admin: para el cliente, `findOneForUser`.
   */
  async findOne(id: string, userId?: string) {
    const pbn = await this.prisma.paintByNumbers.findUnique({ where: { id } });
    if (!pbn || (userId && pbn.userId !== userId)) {
      throw new NotFoundException('Paint-by-Numbers not found');
    }
    return pbn;
  }

  /**
   * Detalle proyectado para el dueño del PBN: fuera `userId` y las storage
   * keys, y dentro pet + generación de origen (sólo el estilo — el prompt
   * engineering es IP y no sale de las rutas admin).
   */
  async findOneForUser(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.prisma.paintByNumbers.findUniqueOrThrow({
      where: { id },
      select: USER_PBN_SELECT,
    });
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
    await this.deleteArtifacts([
      pbn.sourceImageStorageKey,
      pbn.outlineSvgStorageKey,
      pbn.previewStorageKey,
      pbn.paletteStorageKey,
    ]);

    await this.prisma.paintByNumbers.delete({ where: { id } });
    return { success: true };
  }
}
