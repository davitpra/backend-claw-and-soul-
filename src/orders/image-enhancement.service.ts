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
import { ExpensesService } from '../expenses/expenses.service';

/** Target print resolution (dots per inch) we aim for before POD submission. */
const TARGET_DPI = 300;

/** Resolution we re-encode the print master at when no targetDpi is provided. */
const PRINT_DPI = 300;

/** Hard cap on the longest edge when the item has no known print size (px). */
const MAX_EDGE = 8000;

/** JPEG quality for the re-encoded print master. */
const JPEG_QUALITY = 92;

/** fal.ai upscaler model used for true enlargement. */
const UPSCALE_MODEL = 'fal-ai/seedvr/upscale/image';

/** Maximum upscale factor we expose (seedvr accepts 1–10). */
const MAX_UPSCALE_FACTOR = 8;

/** Bleed margin added on each side (millimetres). */
const BLEED_MM = 3;

/**
 * Conservative output ceiling (~30 mebipixels, px / 1024²). seedvr can produce
 * very large outputs, so we keep this safety cap so the OUTPUT stays bounded
 * (output_px = source_px × factor²).
 */
const MAX_UPSCALE_OUTPUT_PX = 30 * 1024 * 1024;

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
  /** Detected dominant colour of the source image border — used as bleed default. */
  bleedColor: string;
  recommendedUpscale: 0 | 2 | 4;
  alreadyEnhanced: boolean;
  /** True when a raw AI-upscaled base exists — "Guardar" will re-apply adjustments from it. */
  hasUpscaledBase: boolean;
}

@Injectable()
export class ImageEnhancementService {
  private readonly logger = new Logger(ImageEnhancementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly falService: FalService,
    private readonly configService: ConfigService,
    private readonly expensesService: ExpensesService,
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
    const bleedColor = original
      ? await this.detectBorderColor(original.url)
      : '#ffffff';

    return {
      isPod: item.fulfillmentMethod === 'pod',
      sourceUrl: original?.url ?? null,
      sourcePx,
      printInches,
      sourceDpi,
      printImageUrl: item.printImageUrl ?? null,
      bleedColor,
      recommendedUpscale: this.recommendUpscale(sourceDpi),
      alreadyEnhanced:
        Boolean(item.printImageUrl) &&
        item.printImageUrl !== item.printSourceUrl,
      hasUpscaledBase: Boolean(item.printUpscaledUrl),
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
   * Build a non-committed preview returned inline as a data URI.
   * With previewUpscale=true the fal.ai upscale runs so the preview is fully
   * accurate (slower). Without it only colour/sharpness adjustments apply.
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

    const printInches = this.resolvePrintInches(item);
    const mock = this.configService.get<boolean>('ai.mock');
    const willUpscale =
      Boolean(options.previewUpscale) ||
      Boolean(options.upscale) ||
      Boolean(options.targetDpi);

    let bytes: Buffer;
    if (options.previewUpscale && !mock) {
      const factor = await this.resolveUpscaleFactor(
        options,
        original,
        printInches,
      );
      if (factor > 0) {
        const result = await this.falService.generate({
          model: UPSCALE_MODEL,
          prompt: '',
          params: {
            image_url: original.url,
            upscale_mode: 'factor',
            upscale_factor: factor,
          },
        });
        bytes = result.imageBuffer;
        this.logger.log(`Preview upscale x${factor} (req ${result.requestId})`);
      } else {
        bytes = await this.download(original.url);
      }
    } else {
      if (options.previewUpscale && mock) {
        this.logger.warn('MOCK_AI=true — skipping fal upscale in preview');
      }
      bytes = await this.download(original.url);
    }

    // Previews are capped at 900 px (1200 after an upscale preview).
    // Bleed is intentionally skipped in previews — it is shown live via CSS.
    const capEdge = options.previewUpscale ? 1200 : 900;
    const previewBuffer = await this.buildPrintImage(
      bytes,
      printInches,
      options,
      capEdge,
    );
    const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg';
    const previewUrl = `data:${mimeType};base64,${previewBuffer.toString('base64')}`;
    return { previewUrl, willUpscale };
  }

  /**
   * Run the enhancement pipeline and persist the result.
   *
   * Two paths depending on whether `options.upscaleFactor` (or `upscale` /
   * `targetDpi`) is set:
   *
   * • Upscale path — runs fal.ai, saves a raw high-res BASE (printUpscaledUrl)
   *   so future "adjust-only" saves can re-apply colour/bleed without re-running
   *   the AI. Then applies adjustments on top and saves the master.
   *
   * • Adjust-only path — partitions from the raw upscaled base when one exists,
   *   otherwise from the original source. Never calls fal.ai.
   *
   * The original source art (printSourceUrl / generation / Shopify image) is
   * NEVER deleted or overwritten.
   */
  async applyEnhance(
    orderId: string,
    itemId: string,
    options: EnhanceDto,
    adminUserId?: string,
  ): Promise<{ printImageUrl: string }> {
    const item = await this.loadItem(orderId, itemId);
    const printInches = this.resolvePrintInches(item);
    const ext = options.format === 'png' ? 'png' : 'jpg';
    const masterKey = `orders/${orderId}/items/${itemId}/print/${uuidv4()}.${ext}`;

    const wantsUpscale = Boolean(
      options.upscaleFactor || options.upscale || options.targetDpi,
    );
    const mock = this.configService.get<boolean>('ai.mock');

    let baseBytes: Buffer;
    let newUpscaledUrl: string | null = null;
    let newUpscaledKey: string | null = null;
    let oldUpscaledKey: string | null = null;

    if (wantsUpscale) {
      // ── Upscale path ────────────────────────────────────────────────────
      const original = this.resolveOriginal(item);
      if (!original) {
        throw new BadRequestException(
          'Item has no source image — upload or link an image first',
        );
      }

      const factor = await this.resolveUpscaleFactor(
        options,
        original,
        printInches,
      );

      if (factor > 0 && !mock) {
        const sourcePx = await this.getSourcePixels(original);
        const result = await this.falService.generate({
          model: UPSCALE_MODEL,
          prompt: '',
          params: {
            image_url: original.url,
            upscale_mode: 'factor',
            upscale_factor: factor,
          },
        });
        baseBytes = result.imageBuffer;
        this.logger.log(`Upscaled item x${factor} (req ${result.requestId})`);

        const loadedItem = item as typeof item & {
          orderId: string;
          generationId: string | null;
          order?: { userId?: string | null };
        };
        const orderWithUser = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { userId: true },
        });
        this.expensesService
          .recordUpscaleCost({
            orderId,
            orderItemId: itemId,
            userId: orderWithUser?.userId ?? undefined,
            generationId: loadedItem.generationId ?? undefined,
            model: UPSCALE_MODEL,
            factor,
            sourcePx,
            requestId: result.requestId,
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to record upscale cost for item ${itemId}: ${(err as Error).message}`,
            );
          });
      } else {
        if (factor > 0 && mock) {
          this.logger.warn(
            'MOCK_AI=true — skipping fal upscale, adjustments only',
          );
        }
        baseBytes = await this.download(original.url);
      }

      // Save a clean, unadjusted base at print resolution (JPEG). Always JPEG —
      // the raw upscale at print size can be tens of MB as PNG, exceeding the
      // storage provider's per-file limit. JPEG keeps it bounded while staying a
      // faithful high-res reference for later adjust-only saves.
      const baseKey = `orders/${orderId}/items/${itemId}/print/base/${uuidv4()}.jpg`;
      const baseBuffer = await this.buildPrintImage(baseBytes, printInches, {
        format: 'jpeg',
      });
      newUpscaledUrl = await this.storageService.upload(
        baseKey,
        baseBuffer,
        'image/jpeg',
      );
      newUpscaledKey = baseKey;
      oldUpscaledKey = item.printUpscaledStorageKey ?? null;
    } else {
      // ── Adjust-only path ─────────────────────────────────────────────────
      // Prefer the saved high-res base; fall back to original source.
      if (item.printUpscaledUrl) {
        baseBytes = await this.download(item.printUpscaledUrl);
      } else {
        const original = this.resolveOriginal(item);
        if (!original) {
          throw new BadRequestException(
            'Item has no source image — upload or link an image first',
          );
        }
        baseBytes = await this.download(original.url);
      }
    }

    // Build the print master (colour/bleed adjustments applied on the base).
    const outputBuffer = await this.buildPrintImage(
      baseBytes,
      printInches,
      options,
    );
    const contentType = options.format === 'png' ? 'image/png' : 'image/jpeg';
    const printImageUrl = await this.storageService.upload(
      masterKey,
      outputBuffer,
      contentType,
    );
    this.logger.log(
      `Enhanced item → ${masterKey} (${outputBuffer.byteLength} bytes)`,
    );

    // Delete old master (never the source, never the upscaled base we just created).
    const safeKeys = new Set(
      [item.printSourceStorageKey, newUpscaledKey].filter(Boolean),
    );
    if (item.printImageStorageKey && !safeKeys.has(item.printImageStorageKey)) {
      await this.storageService
        .delete(item.printImageStorageKey)
        .catch(() => null);
    }

    // Delete old upscaled base when we just created a new one.
    if (
      oldUpscaledKey &&
      oldUpscaledKey !== item.printSourceStorageKey &&
      oldUpscaledKey !== newUpscaledKey
    ) {
      await this.storageService.delete(oldUpscaledKey).catch(() => null);
    }

    const dbData: Record<string, unknown> = {
      printImageUrl,
      printImageStorageKey: masterKey,
    };
    if (newUpscaledKey !== null) {
      dbData.printUpscaledUrl = newUpscaledUrl;
      dbData.printUpscaledStorageKey = newUpscaledKey;
    }

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: dbData,
    });

    await this.recordEvent(
      orderId,
      itemId,
      'print_image_enhanced',
      adminUserId,
      {
        options: options as unknown as Record<string, unknown>,
        printImageUrl,
      },
    );

    return { printImageUrl };
  }

  /**
   * Drop the enhanced print image. Restores the manual-upload source art when
   * present; otherwise clears it to fall back to the generation/Shopify image.
   */
  async revertEnhance(
    orderId: string,
    itemId: string,
    adminUserId?: string,
  ): Promise<{ printImageUrl: string | null }> {
    const item = await this.loadItem(orderId, itemId);

    // Delete print master (never the source).
    if (
      item.printImageStorageKey &&
      item.printImageStorageKey !== item.printSourceStorageKey
    ) {
      await this.storageService
        .delete(item.printImageStorageKey)
        .catch(() => null);
    }

    // Delete upscaled base (never the source).
    if (
      item.printUpscaledStorageKey &&
      item.printUpscaledStorageKey !== item.printSourceStorageKey
    ) {
      await this.storageService
        .delete(item.printUpscaledStorageKey)
        .catch(() => null);
    }

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        printImageUrl: item.printSourceUrl,
        printImageStorageKey: item.printSourceStorageKey,
        printUpscaledUrl: null,
        printUpscaledStorageKey: null,
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

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Determine the fal.ai upscale factor.
   * targetDpi takes priority over the legacy upscale field. The factor is capped
   * both at MAX_UPSCALE_FACTOR× and at the 30 MP OUTPUT ceiling (output = source ×
   * factor²); returns 0 when no upscale is needed or the source is already too large.
   */
  private async resolveUpscaleFactor(
    options: EnhanceDto,
    original: { url: string; storageKey: string | null },
    printInches: { width: number; height: number } | null,
  ): Promise<number> {
    const sourcePx = await this.getSourcePixels(original);

    // Desired factor before any safety cap.
    let desired: number;
    if (options.upscaleFactor) {
      desired = options.upscaleFactor;
    } else if (options.targetDpi) {
      const sourceDpi = this.dpiFor(sourcePx, printInches);
      desired =
        sourceDpi === null || sourceDpi <= 0
          ? 2 // unknown resolution — safe default
          : Math.ceil(options.targetDpi / sourceDpi);
    } else {
      desired = options.upscale ?? 0;
    }

    if (desired <= 1) return 0;
    desired = Math.min(desired, MAX_UPSCALE_FACTOR);

    // Cap by fal.ai's output megapixel ceiling: output_px = source_px × factor².
    if (sourcePx) {
      const srcArea = sourcePx.width * sourcePx.height;
      const maxFactor = Math.sqrt(MAX_UPSCALE_OUTPUT_PX / srcArea);
      if (maxFactor < 1.1) {
        this.logger.warn(
          `Skipping upscale: source ${sourcePx.width}×${sourcePx.height} ` +
            `too large for fal.ai (max factor ${maxFactor.toFixed(2)}).`,
        );
        return 0;
      }
      desired = Math.min(desired, maxFactor);
    }

    // seedvr accepts fractional factors — keep a clean float passed through as-is.
    return Math.round(desired * 100) / 100;
  }

  /**
   * Resolve the source pixel dimensions. Tries the Cloudinary probe first, then
   * falls back to downloading + reading sharp metadata (works for any URL).
   */
  private async getSourcePixels(original: {
    url: string;
    storageKey: string | null;
  }): Promise<{ width: number; height: number } | null> {
    if (original.storageKey) {
      const probed = await this.probeDimensions(original.storageKey);
      if (probed) return probed;
    }
    try {
      const bytes = await this.download(original.url);
      const meta = await sharp(bytes).metadata();
      if (meta.width && meta.height) {
        return { width: meta.width, height: meta.height };
      }
    } catch (err) {
      this.logger.warn(
        `getSourcePixels download failed: ${(err as Error).message}`,
      );
    }
    return null;
  }

  /**
   * Re-encode a buffer to a print-ready image, applying the sharp adjustments.
   * - Caps resolution to the print size at targetDpi/PRINT_DPI (or MAX_EDGE),
   *   never enlarges.
   * - Applies bleed extension unless `capEdge` is set (preview mode).
   * - Outputs JPEG or PNG per options.format.
   */
  private async buildPrintImage(
    buffer: Buffer,
    printInches: { width: number; height: number } | null,
    options: EnhanceDto,
    capEdge?: number,
  ): Promise<Buffer> {
    // Cap output at PRINT_DPI (or targetDpi) at the print size. The AI upscale is
    // sized to reach this DPI; capping here keeps both the stored base and the
    // master within the storage provider's per-file size limit. `withoutEnlargement`
    // leaves lower-res sources untouched (no fake upscaling).
    const effectiveDpi = options.targetDpi ?? PRINT_DPI;

    let resizeOpts: sharp.ResizeOptions;
    if (options.fitToFormat && printInches && !capEdge) {
      resizeOpts = await this.coverResizeToFormat(
        buffer,
        printInches,
        effectiveDpi,
      );
    } else {
      const maxWidth =
        capEdge ??
        (printInches ? Math.round(printInches.width * effectiveDpi) : MAX_EDGE);
      const maxHeight =
        capEdge ??
        (printInches
          ? Math.round(printInches.height * effectiveDpi)
          : MAX_EDGE);
      resizeOpts = {
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      };
    }

    let pipe = sharp(buffer).resize(resizeOpts);

    if (options.improve) pipe = pipe.normalise();

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

    // Bleed extension — only on actual saves, not on previews (capEdge is undefined).
    if (options.bleed && printInches && !capEdge) {
      const bleedPx = Math.round((BLEED_MM / 25.4) * effectiveDpi);
      const bg = this.hexToRgb(options.bleedColor ?? '#ffffff');
      pipe = pipe.extend({
        top: bleedPx,
        bottom: bleedPx,
        left: bleedPx,
        right: bleedPx,
        background: bg,
      });
    }

    if (options.format === 'png') {
      return pipe.png().toBuffer();
    }
    return pipe.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  }

  /**
   * Cover-crop options that match the print aspect ratio exactly, centered,
   * sized to the given DPI but never enlarged beyond the source resolution.
   */
  private async coverResizeToFormat(
    buffer: Buffer,
    printInches: { width: number; height: number },
    dpi = PRINT_DPI,
  ): Promise<sharp.ResizeOptions> {
    const targetW = Math.round(printInches.width * dpi);
    const targetH = Math.round(printInches.height * dpi);

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

  /**
   * Detect the dominant colour of the source image (proxy for background colour).
   * Used as the default bleed fill. Falls back to #ffffff on any error.
   */
  private async detectBorderColor(url: string): Promise<string> {
    try {
      const bytes = await this.download(url);
      const stats = await sharp(bytes)
        .resize(64, 64, { fit: 'fill' })
        .removeAlpha()
        .toColorspace('srgb')
        .stats();
      // Use dominant colour when available (sharp ≥ 0.32), else fall back to mean.
      const d = (stats as any).dominant as
        | { r: number; g: number; b: number }
        | undefined;
      if (d) {
        return this.rgbToHex(d.r, d.g, d.b);
      }
      const [r, g, b] = stats.channels.map((c) => Math.round(c.mean));
      return this.rgbToHex(r, g, b);
    } catch {
      return '#ffffff';
    }
  }

  /** Convert 0-255 RGB channels to a 6-digit hex colour string. */
  private rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((v) =>
          Math.max(0, Math.min(255, Math.round(v)))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }

  /** Parse a #rrggbb hex string to an RGBA object (alpha=1 for solid fill). */
  private hexToRgb(hex: string): {
    r: number;
    g: number;
    b: number;
    alpha: number;
  } {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      alpha: 1,
    };
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
   * NEVER the already-enhanced `printImageUrl` (which is the OUTPUT).
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
    variantTitle?: string | null;
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
    // Fallback: parse the inch dimensions embedded in the variant title, e.g.
    // "30x40 cm / 12x16″ / No Frame". Since production became manual, podConfig
    // is no longer populated, so the title is the remaining source of truth for
    // the print size (and thus the cut/bleed/safe-zone guides).
    return this.parseInchesFromTitle(item.variantTitle ?? null);
  }

  /**
   * Extract print dimensions in inches from a variant title. Matches a
   * "<w>x<h>" pair immediately followed by an inch mark (″ or "), e.g. the
   * "12x16″" inside "30x40 cm / 12x16″ / No Frame".
   */
  private parseInchesFromTitle(
    title: string | null,
  ): { width: number; height: number } | null {
    if (!title) return null;
    const m = title.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:″|")/);
    if (!m) return null;
    const width = parseFloat(m[1]);
    const height = parseFloat(m[2]);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }
    return { width, height };
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
    if (sourceDpi === null) return 2;
    if (sourceDpi >= TARGET_DPI) return 0;
    const factor = Math.ceil(TARGET_DPI / sourceDpi);
    return factor <= 1 ? 0 : factor <= 2 ? 2 : 4;
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
