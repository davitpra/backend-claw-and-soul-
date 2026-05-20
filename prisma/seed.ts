import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // NOTE: Formats, products and Shopify variants are managed by the Shopify sync
  // service, not by this seed. Do not add them here. Product types are now a
  // string column on ProductReference, synced from Shopify on upsert.

  // ============================================
  // STYLES
  // ============================================
  console.log('🎨 Creating styles...');

  const stylesData = [
    {
      name: 'watercolor_portrait',
      displayName: 'Acuarela',
      description:
        'Retrato artístico en acuarela con colores suaves y transparentes. Ideal para capturar la personalidad de tu mascota con un toque artesanal.',
      category: 'classic',
      sortOrder: 1,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'watercolor',
        cfg_scale: 7,
        steps: 30,
        prompt_prefix: 'beautiful watercolor painting of a pet, soft colors, artistic, detailed fur texture,',
        negative_prompt: 'ugly, blurry, low quality, distorted',
      },
    },
    {
      name: 'neon_glow',
      displayName: 'Neón Brillante',
      description:
        'Estética neón vibrante con fondo oscuro y detalles luminosos. Un retrato cyberpunk único que hará destacar a tu mascota.',
      category: 'modern',
      sortOrder: 5,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'neon',
        cfg_scale: 9,
        steps: 35,
        prompt_prefix: 'neon glow portrait of a pet, dark background, vibrant neon lights, cyberpunk aesthetic, glowing,',
        negative_prompt: 'bright background, dull colors, low quality, blurry',
      },
    },
    {
      name: 'flat_modern_illustration',
      displayName: 'Flat Modern Illustration',
      description:
        'A clean digital style using flat colors, simple geometric shapes, minimal shadows, and stylized figures. Bold, limited palettes with no gradients or realistic textures. ',
      category: 'elegant',
      sortOrder: 12,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'pop-art',
        cfg_scale: 9,
        steps: 35,
        prompt_prefix: 'pop art portrait of a pet, Andy Warhol style, bold colors, flat shading, iconic, graphic design,',
        negative_prompt: 'realistic, subtle, blurry, ugly, low quality',
      },
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
        description: styleData.description,
        category: styleData.category,
        sortOrder: styleData.sortOrder,
        parameters: styleData.parameters,
        isActive: true,
      },
    });
    createdStyles[styleData.name] = style;
  }

  console.log(`  ✓ ${Object.keys(createdStyles).length} styles upserted`);

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
