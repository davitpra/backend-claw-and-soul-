import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FalService } from '../generations/providers/fal/fal.service';
import { EnhanceDto } from './dto/enhance.dto';

/** Target print resolution (dots per inch) we aim for before POD submission. */
const TARGET_DPI = 150;

/** Resolution we re-encode the upscaled master at (px per inch of print size). */
const PRINT_DPI = 300;

/** Hard cap on the longest edge when the item has no known print size (px). */
const MAX_EDGE = 8000;

/** JPEG quality for the re-encoded print master. */
const JPEG_QUALITY = 92;

/** fal.ai upscaler model used for true enlargement. */
const UPSCALE_MODEL = 'fal-ai/clarity-upscaler';

interface PodConfigShape {
  width?: number; // inches
  height?: number; // inches
}

export interface EnhanceInfo {
  isPod: boolean;
  sourceUrl: string | null;
  /** Pixel dimensions of the SOURCE art (enhancement input). */
  sourcePx: { width: number; height: number } | null;
  printInches: { width: number; height: number } | null;
  /** DPI of the SOURCE art at the print size — drives the upscale recommendation. */
  sourceDpi: number | null;
  /**
   * URL of the CURRENT print image (the file POD will ship). The client measures
   * its delivered dimensions to compute the real print DPI — this handles the
   * Cloudinary engine, whose stored asset is the un-transformed base while the
   * upscale lives in the delivery URL (`c_scale,…`), so a server-side probe of the
   * storage key would under-report. Measuring the delivered URL matches PrintProofModal.
   */
  printImageUrl: string | null;
  recommendedUpscale: 0 | 2 | 4;
  alreadyEnhanced: boolean;
}

/** A Cloudinary delivery reference: either an uploaded public_id or a remote URL fetched on the fly. */
interface CldRef {
  type: 'upload' | 'fetch';
  id: string;
}

@Injectable()
export class ImageEnhancementService {
  private readonly logger = new Logger(ImageEnhancementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly falService: FalService,
    private readonly configService: ConfigService,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async getEnhanceInfo(orderId: string, itemId: string): Promise<EnhanceInfo> {
    const item = await this.loadItem(orderId, itemId);
    const original = this.resolveOriginal(item);
    const printInches = this.resolvePrintInches(item);

    const sourcePx = original?.storageKey
      ? await this.probeDimensions(original.storageKey)
      : null;
    const sourceDpi = this.dpiFor(sourcePx, printInches);

    return {
      isPod: item.fulfillmentMethod === 'pod',
      sourceUrl: original?.url ?? null,
      sourcePx,
      printInches,
      sourceDpi,
      // The client measures this delivered URL to get the real print DPI (the same
      // file PrintProofModal renders), so both modals always agree.
      printImageUrl: item.printImageUrl ?? null,
      recommendedUpscale: this.recommendUpscale(sourceDpi),
      // "Enhanced" = the print image differs from the source art (or is a stale
      // value with no source) → revert is meaningful.
      alreadyEnhanced:
        Boolean(item.printImageUrl) &&
        item.printImageUrl !== item.printSourceUrl,
    };
  }

  /** DPI of an image at a given print size (limited by the tighter edge). */
  private dpiFor(
    px: { width: number; height: number } | null,
    inches: { width: number; height: number } | null,
  ): number | null {
    if (!px || !inches) return null;
    return Math.floor(
      Math.min(px.width / inches.width, px.height / inches.height),
    );
  }

  /**
   * Build a non-committed preview (URL for the Cloudinary engine, data URI for
   * the sharp engine). The AI upscale is NEVER run here — preview only reflects
   * the colour/sharpness adjustments.
   */
  async previewEnhance(
    orderId: string,
    itemId: string,
    options: EnhanceDto,
  ): Promise<{ previewUrl: string; willUpscale: boolean }> {
    const item = await this.loadItem(orderId, itemId);
    const original = this.resolveOriginal(item);
    if (!original) {
      throw new BadRequestException(
        'Item has no source image — upload or link an image first',
      );
    }

    const willUpscale = Boolean(options.upscale);
    const engine = options.engine ?? 'sharp';

    if (engine === 'cloudinary') {
      const ref: CldRef = original.storageKey
        ? { type: 'upload', id: original.storageKey }
        : { type: 'fetch', id: original.url };
      const transformation = this.buildCloudinaryTransformation(
        null,
        options,
        false, // no upscale scaling in preview
      );
      return {
        previewUrl: this.cloudinaryUrl(ref, transformation),
        willUpscale,
      };
    }

    // sharp engine — render a small preview and return it inline as a data URI
    const bytes = await this.download(original.url);
    const jpeg = await this.buildSharpJpeg(bytes, null, options, 900);
    const previewUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    return { previewUrl, willUpscale };
  }

  /**
   * Run the enhancement with the selected engine and persist the result as a
   * freshly uploaded Cloudinary asset. Always sourced from the ORIGINAL image
   * (never the prior printImageUrl) so re-running never compounds or breaks.
   */
  async applyEnhance(
    orderId: string,
    itemId: string,
    options: EnhanceDto,
    adminUserId?: string,
  ): Promise<{ printImageUrl: string }> {
    const item = await this.loadItem(orderId, itemId);
    const original = this.resolveOriginal(item);
    if (!original) {
      throw new BadRequestException(
        'Item has no source image — upload or link an image first',
      );
    }

    const printInches = this.resolvePrintInches(item);
    const engine = options.engine ?? 'sharp';
    const key = `orders/${orderId}/items/${itemId}/print/${uuidv4()}`;

    const printImageUrl =
      engine === 'cloudinary'
        ? await this.applyCloudinary(key, original, printInches, options)
        : await this.applySharp(key, original, printInches, options);

    // Replace the previous enhanced asset, but NEVER delete the source art
    // (when printImage still points at the manual-upload source).
    if (
      item.printImageStorageKey &&
      item.printImageStorageKey !== item.printSourceStorageKey
    ) {
      await this.storageService
        .delete(item.printImageStorageKey)
        .catch(() => null);
    }

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { printImageUrl, printImageStorageKey: key },
    });

    await this.recordEvent(
      orderId,
      itemId,
      'print_image_enhanced',
      adminUserId,
      {
        engine,
        options: options as unknown as Record<string, unknown>,
        printImageUrl,
      },
    );

    return { printImageUrl };
  }

  /** Motor A — store the original as a Cloudinary asset and deliver it with Cloudinary effects. */
  private async applyCloudinary(
    key: string,
    original: { url: string; storageKey: string | null },
    printInches: { width: number; height: number } | null,
    options: EnhanceDto,
  ): Promise<string> {
    await cloudinary.uploader.upload(original.url, {
      public_id: key,
      resource_type: 'image',
      overwrite: true,
    });
    const transformation = this.buildCloudinaryTransformation(
      printInches,
      options,
      true,
    );
    const url = this.cloudinaryUrl({ type: 'upload', id: key }, transformation);
    this.logger.log(`Enhanced item via Cloudinary engine → ${key}`);
    return url;
  }

  /** Motor B — fal.ai upscale (optional) + sharp adjustments, stored as a flat JPEG. */
  private async applySharp(
    key: string,
    original: { url: string; storageKey: string | null },
    printInches: { width: number; height: number } | null,
    options: EnhanceDto,
  ): Promise<string> {
    const mock = this.configService.get<boolean>('ai.mock');
    let bytes: Buffer;
    if (options.upscale && !mock) {
      const result = await this.falService.generate({
        model: UPSCALE_MODEL,
        prompt: '',
        // clarity-upscaler returns a lossless PNG (no output_format support); we
        // re-encode to JPEG below to stay under Cloudinary's upload size limit.
        params: { image_url: original.url, upscale_factor: options.upscale },
      });
      bytes = result.imageBuffer;
      this.logger.log(
        `Upscaled item x${options.upscale} (req ${result.requestId})`,
      );
    } else {
      if (options.upscale && mock) {
        this.logger.warn(
          'MOCK_AI=true — skipping fal upscale, adjustments only',
        );
      }
      bytes = await this.download(original.url);
    }

    const jpeg = await this.buildSharpJpeg(bytes, printInches, options);
    const url = await this.storageService.upload(key, jpeg, 'image/jpeg');
    this.logger.log(
      `Enhanced item via sharp engine → ${key} (${jpeg.byteLength} bytes)`,
    );
    return url;
  }

  /**
   * Drop the enhanced print image. Restores the manual-upload source art when
   * present (so POD still ships it); otherwise clears it to fall back to the
   * generation/Shopify image.
   */
  async revertEnhance(
    orderId: string,
    itemId: string,
    adminUserId?: string,
  ): Promise<{ printImageUrl: string | null }> {
    const item = await this.loadItem(orderId, itemId);

    // Delete the enhanced output asset, but keep the source art intact.
    if (
      item.printImageStorageKey &&
      item.printImageStorageKey !== item.printSourceStorageKey
    ) {
      await this.storageService
        .delete(item.printImageStorageKey)
        .catch(() => null);
    }

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        printImageUrl: item.printSourceUrl,
        printImageStorageKey: item.printSourceStorageKey,
      },
    });

    await this.recordEvent(
      orderId,
      itemId,
      'print_image_reverted',
      adminUserId,
      {},
    );

    return { printImageUrl: item.printSourceUrl };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async loadItem(orderId: string, itemId: string) {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
      include: {
        generation: { select: { resultUrl: true, resultStorageKey: true } },
        productVariant: { select: { podConfig: true } },
      },
    });
    if (!item) throw new NotFoundException('Order item not found');
    return item;
  }

  /**
   * Resolve the enhancement SOURCE (input) and its Cloudinary key when known.
   * Priority: admin-uploaded source art → AI generation result → Shopify image.
   * NEVER the already-enhanced `printImageUrl` (which is the OUTPUT) — sourcing
   * from it would compound transformations and lose the original. If none exist,
   * the item simply has no enhanceable source.
   */
  private resolveOriginal(item: {
    imageUrl: string | null;
    printSourceUrl: string | null;
    printSourceStorageKey: string | null;
    generation: {
      resultUrl: string | null;
      resultStorageKey: string | null;
    } | null;
  }): { url: string; storageKey: string | null } | null {
    if (item.printSourceUrl) {
      return {
        url: item.printSourceUrl,
        storageKey: item.printSourceStorageKey,
      };
    }
    if (item.generation?.resultUrl) {
      return {
        url: item.generation.resultUrl,
        storageKey: item.generation.resultStorageKey,
      };
    }
    if (item.imageUrl) return { url: item.imageUrl, storageKey: null };
    return null;
  }

  private resolvePrintInches(item: {
    productVariant: { podConfig: Prisma.JsonValue | null } | null;
  }): { width: number; height: number } | null {
    const cfg = item.productVariant?.podConfig as PodConfigShape | null;
    if (
      cfg &&
      typeof cfg.width === 'number' &&
      typeof cfg.height === 'number'
    ) {
      return { width: cfg.width, height: cfg.height };
    }
    return null;
  }

  /**
   * Re-encode a buffer to a print-ready JPEG (Motor B), applying the sharp
   * adjustments. Caps resolution to the print size at PRINT_DPI (or MAX_EDGE
   * when unknown, or `capEdge` for previews). Only ever shrinks.
   */
  private async buildSharpJpeg(
    buffer: Buffer,
    printInches: { width: number; height: number } | null,
    options: EnhanceDto,
    capEdge?: number,
  ): Promise<Buffer> {
    let resizeOpts: sharp.ResizeOptions;
    if (options.fitToFormat && printInches && !capEdge) {
      // Crop to the EXACT print aspect ratio (centered) so Pictorem never crops.
      // Cap to the print size at PRINT_DPI without enlarging beyond the source.
      resizeOpts = await this.coverResizeToFormat(buffer, printInches);
    } else {
      const maxWidth =
        capEdge ??
        (printInches ? Math.round(printInches.width * PRINT_DPI) : MAX_EDGE);
      const maxHeight =
        capEdge ??
        (printInches ? Math.round(printInches.height * PRINT_DPI) : MAX_EDGE);
      resizeOpts = {
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      };
    }

    let pipe = sharp(buffer).resize(resizeOpts);

    // Auto-levels approximates Cloudinary's improve / auto_color.
    if (options.improve || options.autoColor) pipe = pipe.normalise();

    const brightness =
      options.brightness != null ? 1 + options.brightness / 100 : undefined;
    const saturation =
      options.saturation != null ? 1 + options.saturation / 100 : undefined;
    if (brightness != null || saturation != null) {
      pipe = pipe.modulate({ brightness, saturation });
    }

    if (options.contrast) {
      const a = 1 + options.contrast / 100;
      pipe = pipe.linear(a, 128 * (1 - a)); // contrast around mid-grey
    }

    if (options.sharpen) {
      pipe = pipe.sharpen({ sigma: 1 + options.sharpen / 100 });
    }

    return pipe.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  }

  /**
   * Cover-crop options that match the print aspect ratio exactly, centered,
   * sized to PRINT_DPI but never enlarged beyond the source resolution.
   */
  private async coverResizeToFormat(
    buffer: Buffer,
    printInches: { width: number; height: number },
  ): Promise<sharp.ResizeOptions> {
    const targetW = Math.round(printInches.width * PRINT_DPI);
    const targetH = Math.round(printInches.height * PRINT_DPI);

    const meta = await sharp(buffer).metadata();
    let width = targetW;
    let height = targetH;
    if (meta.width && meta.height) {
      const factor = Math.min(1, meta.width / targetW, meta.height / targetH);
      width = Math.max(1, Math.round(targetW * factor));
      height = Math.max(1, Math.round(targetH * factor));
    }

    return { width, height, fit: 'cover', position: 'centre' };
  }

  /** Download a remote image into a Buffer. */
  private async download(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new BadRequestException(
        `Failed to download source image (${res.status})`,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async probeDimensions(
    publicId: string,
  ): Promise<{ width: number; height: number } | null> {
    try {
      const res = (await cloudinary.api.resource(publicId)) as {
        width?: number;
        height?: number;
      };
      if (res.width && res.height) {
        return { width: res.width, height: res.height };
      }
    } catch (err) {
      this.logger.warn(
        `probeDimensions failed for ${publicId}: ${(err as Error).message}`,
      );
    }
    return null;
  }

  private recommendUpscale(sourceDpi: number | null): 0 | 2 | 4 {
    if (sourceDpi === null) return 2; // unknown resolution — suggest a safe upscale
    if (sourceDpi >= TARGET_DPI) return 0;
    const factor = Math.ceil(TARGET_DPI / sourceDpi);
    return factor <= 1 ? 0 : factor <= 2 ? 2 : 4;
  }

  /** Build the Cloudinary transformation chain (Motor A) for the given options. */
  private buildCloudinaryTransformation(
    printInches: { width: number; height: number } | null,
    options: EnhanceDto,
    includeScale: boolean,
  ): Record<string, string | number>[] {
    const t: Record<string, string | number>[] = [];
    if (includeScale && options.fitToFormat && printInches) {
      // Crop to the exact print aspect ratio (centered) — Pictorem won't crop.
      t.push({
        width: Math.min(Math.round(printInches.width * PRINT_DPI), MAX_EDGE),
        height: Math.min(Math.round(printInches.height * PRINT_DPI), MAX_EDGE),
        crop: 'fill',
        gravity: 'center',
      });
    } else if (includeScale && options.upscale && printInches) {
      const width = Math.min(
        Math.round(printInches.width * PRINT_DPI),
        MAX_EDGE,
      );
      t.push({ width, crop: 'scale' });
    }
    if (options.improve) t.push({ effect: 'improve' });
    if (options.autoColor) t.push({ effect: 'auto_color' });
    if (options.contrast) t.push({ effect: `contrast:${options.contrast}` });
    if (options.brightness)
      t.push({ effect: `brightness:${options.brightness}` });
    if (options.saturation)
      t.push({ effect: `saturation:${options.saturation}` });
    if (options.sharpen) t.push({ effect: `sharpen:${options.sharpen}` });
    t.push({ fetch_format: 'jpg' });
    t.push({ quality: 'auto:best' });
    return t;
  }

  /** Build a Cloudinary delivery URL for an upload public_id or a remote fetch source. */
  private cloudinaryUrl(
    ref: CldRef,
    transformation: Record<string, string | number>[],
  ): string {
    return cloudinary.url(ref.id, {
      type: ref.type,
      resource_type: 'image',
      secure: true,
      transformation,
    });
  }

  private async recordEvent(
    orderId: string,
    orderItemId: string,
    eventType: string,
    adminUserId: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.orderEvent.create({
      data: {
        orderId,
        orderItemId,
        eventType,
        source: 'admin',
        userId: adminUserId ?? null,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
