import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // NOTE: Formats, products and Shopify variants are managed by the Shopify sync
  // service, not by this seed. Do not add them here.

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
      isPremium: false,
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
      isPremium: true,
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
      isPremium: false,
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
        isPremium: styleData.isPremium,
        sortOrder: styleData.sortOrder,
        parameters: styleData.parameters,
        isActive: true,
      },
    });
    createdStyles[styleData.name] = style;
  }

  console.log(`  ✓ ${Object.keys(createdStyles).length} styles upserted`);

  // ============================================
  // COMPATIBILITY MATRIX
  // ============================================
  console.log('🔗 Creating compatibility matrix...');

  // Derived dynamically from active styles and real ProductFormatVariants so
  // this stays in sync when Shopify sync adds/removes products or formats.
  const activeStyles = await prisma.style.findMany({ where: { isActive: true } });
  const activeVariants = await prisma.productFormatVariant.findMany({
    where: { isActive: true },
    select: { formatId: true, productRefId: true },
  });

  // Deduplicate (formatId, productRefId) pairs
  const uniquePairs = Array.from(
    new Map(activeVariants.map((v) => [`${v.formatId}:${v.productRefId}`, v])).values(),
  );

  let compatCount = 0;
  for (const style of activeStyles) {
    for (const { formatId, productRefId } of uniquePairs) {
      await prisma.styleFormatProductCompat.upsert({
        where: {
          styleId_formatId_productRefId: {
            styleId: style.id,
            formatId,
            productRefId,
          },
        },
        update: {},
        create: {
          styleId: style.id,
          formatId,
          productRefId,
          constraints: Prisma.JsonNull,
          isActive: true,
        },
      });
      compatCount++;
    }
  }

  console.log(`  ✓ ${compatCount} compatibility entries upserted`);

  console.log('\n✅ Seeding completed successfully!');
  console.log(`   - Styles: ${Object.keys(createdStyles).length}`);
  console.log(`   - Compat entries: ${compatCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
