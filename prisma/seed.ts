import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ============================================
  // FORMATS
  // ============================================
  console.log('📐 Creating formats...');

  const formatSquare = await prisma.format.upsert({
    where: { name: 'square_1x1' },
    update: {},
    create: {
      name: 'square_1x1',
      displayName: 'Cuadrado (1:1)',
      aspectRatio: '1:1',
      width: 1024,
      height: 1024,
      shopifyVariantOption: 'Square',
      isActive: true,
    },
  });

  const formatPortrait45 = await prisma.format.upsert({
    where: { name: 'portrait_4x5' },
    update: {},
    create: {
      name: 'portrait_4x5',
      displayName: 'Retrato (4:5)',
      aspectRatio: '4:5',
      width: 800,
      height: 1000,
      shopifyVariantOption: 'Portrait 4x5',
      isActive: true,
    },
  });

  const formatPortrait23 = await prisma.format.upsert({
    where: { name: 'portrait_2x3' },
    update: {},
    create: {
      name: 'portrait_2x3',
      displayName: 'Póster (2:3)',
      aspectRatio: '2:3',
      width: 800,
      height: 1200,
      shopifyVariantOption: 'Poster 2x3',
      isActive: true,
    },
  });

  const formatLandscape = await prisma.format.upsert({
    where: { name: 'landscape_16x9' },
    update: {},
    create: {
      name: 'landscape_16x9',
      displayName: 'Panorámico (16:9)',
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      shopifyVariantOption: 'Landscape',
      isActive: true,
    },
  });

  const formats = { formatSquare, formatPortrait45, formatPortrait23, formatLandscape };
  console.log(`  ✓ ${Object.keys(formats).length} formats created`);

  // ============================================
  // PRODUCT REFERENCES
  // ============================================
  console.log('🛍️  Creating product references...');

  const productCanvas = await prisma.productReference.upsert({
    where: { shopifyProductId: 'gid://shopify/Product/1001' },
    update: {},
    create: {
      shopifyProductId: 'gid://shopify/Product/1001',
      shopifyHandle: 'canvas-print-pet-art',
      name: 'canvas_print',
      displayName: 'Lienzo Impreso',
      description:
        'Impresión de alta calidad en lienzo estirado sobre bastidor de madera. Ideal para decorar el hogar con el retrato de tu mascota.',
      isActive: true,
    },
  });

  const productPoster = await prisma.productReference.upsert({
    where: { shopifyProductId: 'gid://shopify/Product/1002' },
    update: {},
    create: {
      shopifyProductId: 'gid://shopify/Product/1002',
      shopifyHandle: 'fine-art-poster-pet',
      name: 'fine_art_poster',
      displayName: 'Póster Fine Art',
      description:
        'Impresión en papel fotográfico premium de 250g. Acabado mate con colores vibrantes y duraderos.',
      isActive: true,
    },
  });

  const productPhoneCase = await prisma.productReference.upsert({
    where: { shopifyProductId: 'gid://shopify/Product/1003' },
    update: {},
    create: {
      shopifyProductId: 'gid://shopify/Product/1003',
      shopifyHandle: 'phone-case-pet-art',
      name: 'phone_case',
      displayName: 'Funda de Móvil',
      description:
        'Funda rígida personalizada con el arte de tu mascota. Disponible para los modelos más populares de iPhone y Samsung.',
      isActive: true,
    },
  });

  const productGreetingCard = await prisma.productReference.upsert({
    where: { shopifyProductId: 'gid://shopify/Product/1004' },
    update: {},
    create: {
      shopifyProductId: 'gid://shopify/Product/1004',
      shopifyHandle: 'greeting-card-pet-art',
      name: 'greeting_card',
      displayName: 'Tarjeta de Felicitación',
      description:
        'Tarjeta de felicitación de doble cara en cartulina premium. Perfecta para regalar en cumpleaños, navidad o cualquier ocasión especial.',
      isActive: true,
    },
  });

  const productMug = await prisma.productReference.upsert({
    where: { shopifyProductId: 'gid://shopify/Product/1005' },
    update: {},
    create: {
      shopifyProductId: 'gid://shopify/Product/1005',
      shopifyHandle: 'ceramic-mug-pet-art',
      name: 'ceramic_mug',
      displayName: 'Taza de Cerámica',
      description:
        'Taza de cerámica de 330ml con el arte de tu mascota. Apta para lavavajillas y microondas. Un regalo único para los amantes de las mascotas.',
      isActive: true,
    },
  });

  const products = { productCanvas, productPoster, productPhoneCase, productGreetingCard, productMug };
  console.log(`  ✓ ${Object.keys(products).length} products created`);

  // ============================================
  // STYLES
  // ============================================
  console.log('🎨 Creating styles...');

  const stylesData = [
    // --- CLÁSICO ---
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
      name: 'oil_painting',
      displayName: 'Óleo sobre lienzo',
      description:
        'Retrato clásico al óleo con rica textura y profundidad de color. Convierte a tu mascota en una obra de arte digna de galería.',
      category: 'classic',
      isPremium: false,
      sortOrder: 2,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'oil-painting',
        cfg_scale: 8,
        steps: 40,
        prompt_prefix: 'oil painting portrait of a pet, rich texture, classical art style, detailed brushstrokes,',
        negative_prompt: 'ugly, blurry, low quality, modern, digital',
      },
    },
    {
      name: 'pencil_sketch',
      displayName: 'Boceto a Lápiz',
      description:
        'Elegante retrato en blanco y negro al estilo del dibujo a lápiz. Minimalista y sofisticado, perfecto para cualquier decoración.',
      category: 'classic',
      isPremium: false,
      sortOrder: 3,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'sketch',
        cfg_scale: 7,
        steps: 25,
        prompt_prefix: 'pencil sketch portrait of a pet, detailed, black and white, artistic drawing,',
        negative_prompt: 'color, low quality, blurry, distorted',
      },
    },
    // --- MODERNO ---
    {
      name: 'digital_art',
      displayName: 'Arte Digital',
      description:
        'Retrato digital vibrante con colores intensos y acabado profesional. El estilo perfecto para la era moderna.',
      category: 'modern',
      isPremium: false,
      sortOrder: 4,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'digital-art',
        cfg_scale: 7,
        steps: 30,
        prompt_prefix: 'digital art portrait of a pet, vibrant colors, professional illustration, sharp details,',
        negative_prompt: 'ugly, blurry, low quality, amateur',
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
      name: 'impressionism',
      displayName: 'Impresionismo',
      description:
        'Inspirado en los maestros impresionistas como Monet y Renoir. Pinceladas visibles y luz natural que dan vida a tu mascota.',
      category: 'modern',
      isPremium: false,
      sortOrder: 6,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'impressionist',
        cfg_scale: 7,
        steps: 35,
        prompt_prefix: 'impressionist painting of a pet, visible brushstrokes, soft light, Monet style, colorful,',
        negative_prompt: 'sharp edges, photorealistic, ugly, blurry',
      },
    },
    // --- DIVERTIDO ---
    {
      name: 'cartoon',
      displayName: 'Dibujo Animado',
      description:
        'Convierte a tu mascota en un adorable personaje de dibujos animados. Perfecto para los amantes del estilo kawaii y colorido.',
      category: 'fun',
      isPremium: false,
      sortOrder: 7,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'cartoon',
        cfg_scale: 8,
        steps: 30,
        prompt_prefix: 'cartoon character portrait of a pet, cute, colorful, fun, animated style,',
        negative_prompt: 'realistic, dark, scary, ugly, low quality',
      },
    },
    {
      name: 'chibi_kawaii',
      displayName: 'Chibi Kawaii',
      description:
        'Estilo japonés chibi con proporciones exageradas y expresiones adorables. ¡Tu mascota nunca ha sido tan tierna!',
      category: 'fun',
      isPremium: false,
      sortOrder: 8,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'anime',
        cfg_scale: 8,
        steps: 30,
        prompt_prefix: 'chibi kawaii portrait of a pet, big eyes, adorable, Japanese anime style, cute proportions,',
        negative_prompt: 'realistic, dark, scary, ugly, low quality, adult',
      },
    },
    {
      name: 'comic_book',
      displayName: 'Cómic',
      description:
        'Tu mascota como superhéroe en un cómic de acción. Colores planos, líneas gruesas y efectos de impacto para una imagen épica.',
      category: 'fun',
      isPremium: true,
      sortOrder: 9,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'comic-book',
        cfg_scale: 9,
        steps: 35,
        prompt_prefix: 'comic book style portrait of a pet, bold outlines, flat colors, halftone dots, superhero style,',
        negative_prompt: 'realistic, blurry, low quality, subtle colors',
      },
    },
    // --- ELEGANTE ---
    {
      name: 'royal_portrait',
      displayName: 'Retrato Real',
      description:
        'Retrato nobiliario al estilo del siglo XVIII. Tu mascota como rey o reina con vestiduras lujosas y fondo majestuoso.',
      category: 'elegant',
      isPremium: true,
      sortOrder: 10,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'baroque',
        cfg_scale: 9,
        steps: 40,
        prompt_prefix: 'royal portrait of a pet wearing royal clothing, baroque style, golden frame, regal, luxurious,',
        negative_prompt: 'modern, casual, ugly, blurry, low quality',
      },
    },
    {
      name: 'vintage_photo',
      displayName: 'Foto Vintage',
      description:
        'Estética retro con tonos sepia, bordes envejecidos y la nostalgia de las fotografías antiguas. Atemporal y encantador.',
      category: 'elegant',
      isPremium: false,
      sortOrder: 11,
      parameters: {
        model: 'stable-diffusion-xl',
        style_preset: 'vintage',
        cfg_scale: 7,
        steps: 30,
        prompt_prefix: 'vintage photograph of a pet, sepia tones, aged photo, retro style, nostalgic,',
        negative_prompt: 'colorful, modern, digital, blurry, ugly',
      },
    },
    {
      name: 'pop_art',
      displayName: 'Pop Art',
      description:
        'Inspirado en Andy Warhol y el movimiento pop art. Colores audaces, repetición y una estética icónica que convertirá a tu mascota en una obra de arte pop.',
      category: 'elegant',
      isPremium: true,
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

  console.log(`  ✓ ${Object.keys(createdStyles).length} styles created`);

  // ============================================
  // STYLE IMAGES
  // ============================================
  console.log('🖼️  Creating style images...');

  const styleImagesData = [
    // watercolor_portrait
    { styleName: 'watercolor_portrait', images: [
      { caption: 'Ejemplo acuarela - Perro Golden', orderIndex: 0, isPrimary: true },
      { caption: 'Ejemplo acuarela - Gato persa', orderIndex: 1, isPrimary: false },
      { caption: 'Ejemplo acuarela - Conejo', orderIndex: 2, isPrimary: false },
    ]},
    // oil_painting
    { styleName: 'oil_painting', images: [
      { caption: 'Óleo clásico - Labrador', orderIndex: 0, isPrimary: true },
      { caption: 'Óleo clásico - Gato atigrado', orderIndex: 1, isPrimary: false },
    ]},
    // pencil_sketch
    { styleName: 'pencil_sketch', images: [
      { caption: 'Boceto lápiz - Border Collie', orderIndex: 0, isPrimary: true },
      { caption: 'Boceto lápiz - Gatito', orderIndex: 1, isPrimary: false },
    ]},
    // digital_art
    { styleName: 'digital_art', images: [
      { caption: 'Arte digital - Husky', orderIndex: 0, isPrimary: true },
      { caption: 'Arte digital - Maine Coon', orderIndex: 1, isPrimary: false },
      { caption: 'Arte digital - Pájaro loro', orderIndex: 2, isPrimary: false },
    ]},
    // neon_glow
    { styleName: 'neon_glow', images: [
      { caption: 'Neón - Doberman', orderIndex: 0, isPrimary: true },
      { caption: 'Neón - Gato negro', orderIndex: 1, isPrimary: false },
    ]},
    // impressionism
    { styleName: 'impressionism', images: [
      { caption: 'Impresionismo - Spaniel', orderIndex: 0, isPrimary: true },
      { caption: 'Impresionismo - Gato naranja', orderIndex: 1, isPrimary: false },
    ]},
    // cartoon
    { styleName: 'cartoon', images: [
      { caption: 'Cartoon - Poodle', orderIndex: 0, isPrimary: true },
      { caption: 'Cartoon - Siamés', orderIndex: 1, isPrimary: false },
      { caption: 'Cartoon - Conejo enano', orderIndex: 2, isPrimary: false },
    ]},
    // chibi_kawaii
    { styleName: 'chibi_kawaii', images: [
      { caption: 'Chibi - Shiba Inu', orderIndex: 0, isPrimary: true },
      { caption: 'Chibi - Scottish Fold', orderIndex: 1, isPrimary: false },
    ]},
    // comic_book
    { styleName: 'comic_book', images: [
      { caption: 'Cómic - Bulldog superhéroe', orderIndex: 0, isPrimary: true },
      { caption: 'Cómic - Gato ninja', orderIndex: 1, isPrimary: false },
    ]},
    // royal_portrait
    { styleName: 'royal_portrait', images: [
      { caption: 'Real - Dálmata con corona', orderIndex: 0, isPrimary: true },
      { caption: 'Real - Gato persa con trono', orderIndex: 1, isPrimary: false },
    ]},
    // vintage_photo
    { styleName: 'vintage_photo', images: [
      { caption: 'Vintage - Beagle sepia', orderIndex: 0, isPrimary: true },
      { caption: 'Vintage - Gato vintage', orderIndex: 1, isPrimary: false },
    ]},
    // pop_art
    { styleName: 'pop_art', images: [
      { caption: 'Pop Art - Chihuahua Warhol', orderIndex: 0, isPrimary: true },
      { caption: 'Pop Art - Gato multicolor', orderIndex: 1, isPrimary: false },
    ]},
  ];

  let totalImages = 0;
  for (const { styleName, images } of styleImagesData) {
    const style = createdStyles[styleName];
    if (!style) continue;

    for (const img of images) {
      const slug = `${styleName}_${img.orderIndex}`;
      // Check if already exists to avoid duplicates
      const existing = await prisma.styleImage.findFirst({
        where: { styleId: style.id, orderIndex: img.orderIndex },
      });
      if (!existing) {
        await prisma.styleImage.create({
          data: {
            styleId: style.id,
            imageUrl: `https://cdn.clawandsoul.com/styles/${styleName}/${slug}.jpg`,
            storageKey: `styles/${styleName}/${slug}.jpg`,
            caption: img.caption,
            orderIndex: img.orderIndex,
            isPrimary: img.isPrimary,
          },
        });
        totalImages++;
      }
    }
  }

  console.log(`  ✓ ${totalImages} style images created`);

  // ============================================
  // COMPATIBILITY MATRIX
  // ============================================
  console.log('🔗 Creating compatibility matrix...');

  /**
   * Lógica de compatibilidad:
   * - Canvas print: cuadrado y retrato 4:5 (ideal para decoración)
   * - Fine art poster: retrato 2:3 y panorámico (ideal para pósters)
   * - Phone case: cuadrado (se recorta en el dispositivo) y retrato 4:5
   * - Greeting card: cuadrado y retrato 4:5
   * - Ceramic mug: cuadrado (se aplica en la taza)
   *
   * Estilos premium (neon_glow, comic_book, royal_portrait, pop_art) solo compatible
   * con canvas y poster (productos más "premium")
   */

  type CompatEntry = {
    styleName: string;
    formatName: string;
    productName: string;
    constraints?: Record<string, any>;
  };

  const compatEntries: CompatEntry[] = [];

  const allStyleNames = Object.keys(createdStyles);
  const premiumStyles = ['neon_glow', 'comic_book', 'royal_portrait', 'pop_art'];
  const freeStyles = allStyleNames.filter((s) => !premiumStyles.includes(s));

  // Estilos gratuitos: compatible con todos los productos y formatos
  for (const styleName of freeStyles) {
    // Canvas: cuadrado y retrato 4:5
    compatEntries.push({ styleName, formatName: 'square_1x1', productName: 'canvas_print' });
    compatEntries.push({ styleName, formatName: 'portrait_4x5', productName: 'canvas_print' });
    // Poster: retrato 2:3 y panorámico
    compatEntries.push({ styleName, formatName: 'portrait_2x3', productName: 'fine_art_poster' });
    compatEntries.push({ styleName, formatName: 'landscape_16x9', productName: 'fine_art_poster' });
    // Phone case: cuadrado y retrato 4:5
    compatEntries.push({ styleName, formatName: 'square_1x1', productName: 'phone_case' });
    compatEntries.push({ styleName, formatName: 'portrait_4x5', productName: 'phone_case' });
    // Greeting card: cuadrado
    compatEntries.push({ styleName, formatName: 'square_1x1', productName: 'greeting_card' });
    compatEntries.push({ styleName, formatName: 'portrait_4x5', productName: 'greeting_card' });
    // Ceramic mug: cuadrado
    compatEntries.push({ styleName, formatName: 'square_1x1', productName: 'ceramic_mug' });
  }

  // Estilos premium: solo canvas y poster
  for (const styleName of premiumStyles) {
    // Canvas: cuadrado y retrato 4:5
    compatEntries.push({ styleName, formatName: 'square_1x1', productName: 'canvas_print', constraints: { premium_only: true } });
    compatEntries.push({ styleName, formatName: 'portrait_4x5', productName: 'canvas_print', constraints: { premium_only: true } });
    // Poster: retrato 2:3 y panorámico
    compatEntries.push({ styleName, formatName: 'portrait_2x3', productName: 'fine_art_poster', constraints: { premium_only: true } });
    compatEntries.push({ styleName, formatName: 'landscape_16x9', productName: 'fine_art_poster', constraints: { premium_only: true } });
  }

  const formatMap: Record<string, any> = {
    square_1x1: formatSquare,
    portrait_4x5: formatPortrait45,
    portrait_2x3: formatPortrait23,
    landscape_16x9: formatLandscape,
  };

  const productMap: Record<string, any> = {
    canvas_print: productCanvas,
    fine_art_poster: productPoster,
    phone_case: productPhoneCase,
    greeting_card: productGreetingCard,
    ceramic_mug: productMug,
  };

  let compatCount = 0;
  for (const entry of compatEntries) {
    const style = createdStyles[entry.styleName];
    const format = formatMap[entry.formatName];
    const product = productMap[entry.productName];
    if (!style || !format || !product) continue;

    try {
      await prisma.styleFormatProductCompat.upsert({
        where: {
          styleId_formatId_productRefId: {
            styleId: style.id,
            formatId: format.id,
            productRefId: product.id,
          },
        },
        update: {},
        create: {
          styleId: style.id,
          formatId: format.id,
          productRefId: product.id,
          constraints: entry.constraints ?? null,
          isActive: true,
        },
      });
      compatCount++;
    } catch (e) {
      // Skip duplicates silently
    }
  }

  console.log(`  ✓ ${compatCount} compatibility entries created`);

  console.log('\n✅ Seeding completed successfully!');
  console.log(`   - Formats: ${Object.keys(formats).length}`);
  console.log(`   - Products: ${Object.keys(products).length}`);
  console.log(`   - Styles: ${Object.keys(createdStyles).length}`);
  console.log(`   - Style images: ${totalImages}`);
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
