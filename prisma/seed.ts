import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_VISION_MAX_TOKENS,
  DEFAULT_VISION_SYSTEM_PROMPT,
} from '../src/vision-configs/vision-configs.constants';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // NOTE: This seed creates the base format catalog (sizes/aspect-ratios).
  // ProductFormatVariants and ProductReferences are still managed by the Shopify
  // sync service. Product types are a string column on ProductReference, synced
  // from Shopify on upsert.

  // ============================================
  // STYLES
  // ============================================
  console.log('🎨 Creating styles...');

  // Seed a default ImageGenConfig and VisionConfig used by all seed styles
  const defaultImageGenConfig = await prisma.imageGenConfig.upsert({
    where: { name: 'flux-dev-default' },
    update: {},
    create: {
      name: 'flux-dev-default',
      description: 'Default Fal.ai Flux Dev configuration',
      model: 'fal-ai/flux/dev',
      parameters: { num_inference_steps: 28 },
    },
  });

  const defaultVisionConfig = await prisma.visionConfig.upsert({
    where: { name: 'gemini-flash-default' },
    update: {},
    create: {
      name: 'gemini-flash-default',
      description: 'Default Gemini Flash vision configuration',
      visionModel: 'google/gemini-2.5-flash',
      visionTemperature: 0.7,
      systemPrompt: DEFAULT_VISION_SYSTEM_PROMPT,
      maxTokens: DEFAULT_VISION_MAX_TOKENS,
    },
  });

  console.log('  ✓ Default VisionConfig and ImageGenConfig created');

  const stylesData = [
    {
      name: 'watercolor_portrait',
      displayName: 'Acuarela',
      category: 'classic',
    },
    {
      name: 'neon_glow',
      displayName: 'Neón Brillante',
      category: 'modern',
    },
    {
      name: 'flat_modern_illustration',
      displayName: 'Flat Modern Illustration',
      category: 'elegant',
    },
  ];

  const createdStyles: Record<string, any> = {};

  for (const styleData of stylesData) {
    const style = await prisma.style.upsert({
      where: { name: styleData.name },
      update: {},
      create: {
        name: styleData.name,
        displayName: styleData.displayName,
        category: styleData.category,
        isActive: true,
        strategyKey: 'style-driven-prompt',
        promptTemplate: DEFAULT_PROMPT_TEMPLATE,
        visionConfigId: defaultVisionConfig.id,
        imageGenConfigId: defaultImageGenConfig.id,
      },
    });
    createdStyles[styleData.name] = style;
  }

  console.log(`  ✓ ${Object.keys(createdStyles).length} styles upserted`);

  // ============================================
  // FORMATS
  // ============================================
  // Base catalog of print sizes. The Shopify sync matches incoming variant
  // option1 values against shopifyVariantOption (case-insensitive, spaces
  // stripped) to create ProductFormatVariants. width/height are informational
  // pixel dimensions (~1MP per aspect ratio); Fal.ai receives only aspectRatio.
  console.log('📐 Creating formats...');

  const formatsData = [
    { name: 'portrait_8x10',  displayName: '8x10 Retrato',   aspectRatio: '4:5', width: 1024, height: 1280, shopifyVariantOption: '8x10'  },
    { name: 'portrait_12x16', displayName: '12x16 Retrato',  aspectRatio: '3:4', width: 1024, height: 1365, shopifyVariantOption: '12x16' },
    { name: 'portrait_16x20', displayName: '16x20 Retrato',  aspectRatio: '4:5', width: 1024, height: 1280, shopifyVariantOption: '16x20' },
    { name: 'portrait_18x24', displayName: '18x24 Retrato',  aspectRatio: '3:4', width: 1024, height: 1365, shopifyVariantOption: '18x24' },
    { name: 'portrait_20x30', displayName: '20x30 Retrato',  aspectRatio: '2:3', width: 1024, height: 1536, shopifyVariantOption: '20x30' },
    { name: 'portrait_24x32', displayName: '24x32 Retrato',  aspectRatio: '3:4', width: 1024, height: 1365, shopifyVariantOption: '24x32' },
    { name: 'portrait_24x36', displayName: '24x36 Retrato',  aspectRatio: '2:3', width: 1024, height: 1536, shopifyVariantOption: '24x36' },
    { name: 'museum_20x25',   displayName: '20x25 Museo',    aspectRatio: '4:5', width: 1024, height: 1280, shopifyVariantOption: '20x25' },
    { name: 'museum_30x45',   displayName: '30x45 Museo',    aspectRatio: '2:3', width: 1024, height: 1536, shopifyVariantOption: '30x45' },
    { name: 'museum_40x50',   displayName: '40x50 Museo',    aspectRatio: '4:5', width: 1024, height: 1280, shopifyVariantOption: '40x50' },
  ];

  for (const fmt of formatsData) {
    await prisma.format.upsert({
      where: { name: fmt.name },
      update: {},
      create: { ...fmt, isActive: true },
    });
  }

  console.log(`  ✓ ${formatsData.length} formats upserted`);

  // ============================================
  // PRODUCT FORMAT VARIANT CONSTRAINTS
  // ============================================
  // Sets per-(product, format) generation overrides on existing variants created
  // by the Shopify sync. Safe to re-run: updateMany is idempotent.
  //
  // cropMode  → framing hint for the AI prompt ('head-shoulders' | 'portrait' | 'full-body')
  // maxPets   → max number of pets allowed in the composition
  // bleedMm   → extra canvas wrap bleed required for print (canvas products only)
  console.log('🖼️  Seeding product format variant constraints...');

  const variantConstraints: {
    productHandle: string;
    formatName: string;
    constraints: Record<string, unknown>;
  }[] = [
    // ── Photo Paper Poster ──────────────────────────────────────────
    { productHandle: 'photo-paper-poster', formatName: 'portrait_8x10',
      constraints: { cropMode: 'head-shoulders', maxPets: 1 } },
    { productHandle: 'photo-paper-poster', formatName: 'portrait_12x16',
      constraints: { cropMode: 'head-shoulders', maxPets: 1 } },
    { productHandle: 'photo-paper-poster', formatName: 'portrait_16x20',
      constraints: { cropMode: 'portrait', maxPets: 1 } },
    { productHandle: 'photo-paper-poster', formatName: 'portrait_18x24',
      constraints: { cropMode: 'portrait', maxPets: 1 } },
    { productHandle: 'photo-paper-poster', formatName: 'portrait_20x30',
      constraints: { cropMode: 'full-body', maxPets: 2 } },
    { productHandle: 'photo-paper-poster', formatName: 'portrait_24x36',
      constraints: { cropMode: 'full-body', maxPets: 2 } },

    // ── Framed Poster ───────────────────────────────────────────────
    { productHandle: 'framed-poster', formatName: 'portrait_12x16',
      constraints: { cropMode: 'head-shoulders', maxPets: 1 } },
    { productHandle: 'framed-poster', formatName: 'portrait_16x20',
      constraints: { cropMode: 'portrait', maxPets: 1 } },
    { productHandle: 'framed-poster', formatName: 'portrait_24x36',
      constraints: { cropMode: 'full-body', maxPets: 2 } },

    // ── Museum-Quality Wooden Framed Poster ─────────────────────────
    { productHandle: 'museum-quality-matte-paper-wooden-framed-poster', formatName: 'museum_20x25',
      constraints: { cropMode: 'portrait', maxPets: 1 } },
    { productHandle: 'museum-quality-matte-paper-wooden-framed-poster', formatName: 'museum_30x45',
      constraints: { cropMode: 'full-body', maxPets: 2 } },
    { productHandle: 'museum-quality-matte-paper-wooden-framed-poster', formatName: 'museum_40x50',
      constraints: { cropMode: 'portrait', maxPets: 1 } },

    // ── Framed Canvas (bleedMm for canvas wrap edges) ───────────────
    { productHandle: 'framed-canvas', formatName: 'portrait_16x20',
      constraints: { cropMode: 'portrait', maxPets: 1, bleedMm: 25 } },
    { productHandle: 'framed-canvas', formatName: 'portrait_18x24',
      constraints: { cropMode: 'portrait', maxPets: 1, bleedMm: 25 } },
    { productHandle: 'framed-canvas', formatName: 'portrait_24x32',
      constraints: { cropMode: 'full-body', maxPets: 1, bleedMm: 25 } },
  ];

  let constraintsUpdated = 0;
  let constraintsSkipped = 0;

  for (const entry of variantConstraints) {
    const product = await prisma.productReference.findFirst({
      where: { shopifyHandle: entry.productHandle },
    });
    const format = await prisma.format.findFirst({
      where: { name: entry.formatName },
    });

    if (!product || !format) {
      console.warn(
        `  ⚠ Skipping constraints for ${entry.productHandle}/${entry.formatName}: product or format not found`,
      );
      constraintsSkipped++;
      continue;
    }

    const result = await prisma.productFormatVariant.updateMany({
      where: { productRefId: product.id, formatId: format.id },
      data: { constraints: entry.constraints as Prisma.InputJsonValue },
    });

    if (result.count === 0) {
      console.warn(
        `  ⚠ No variant found for ${entry.productHandle}/${entry.formatName}`,
      );
      constraintsSkipped++;
    } else {
      constraintsUpdated++;
    }
  }

  console.log(`  ✓ ${constraintsUpdated} variant constraints updated (${constraintsSkipped} skipped)`);

  console.log('\n✅ Seeding completed successfully!');
  console.log(`   - Styles: ${Object.keys(createdStyles).length}`);
  console.log(`   - Formats: ${formatsData.length}`);
  console.log(`   - Variant constraints: ${constraintsUpdated} updated`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
