import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const API_KEY = process.env.PICTOREM_API_KEY ?? '';
const BASE_URL =
  process.env.PICTOREM_API_URL ?? 'https://www.pictorem.com/artflow/0.1';

async function post(endpoint: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: { artFlowKey: API_KEY },
    body: form,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function main() {
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`API Key  : ${API_KEY ? API_KEY.slice(0, 8) + '…' : '(missing)'}\n`);

  // 1. Catalog discovery endpoints
  const catalogEndpoints = [
    'getpreorder/',
    'getproducts/',
    'getproductlist/',
    'getcatalog/',
    'getmaterials/',
    'getpreordercode/',
    'getpricelist/',
    'getprices/',
    'products/',
    'catalog/',
  ];

  console.log('=== CATALOG ENDPOINT DISCOVERY ===');
  for (const ep of catalogEndpoints) {
    const r = await post(ep);
    const preview =
      typeof r.data === 'string'
        ? r.data.slice(0, 200)
        : JSON.stringify(r.data).slice(0, 200);
    console.log(`[${r.status}] ${ep} → ${preview}`);
  }

  // 2. Validate known-good code
  console.log('\n=== VALIDATE KNOWN-GOOD CODE ===');
  const knownGood = '1|canvas|stretched|horizontal|10|8';
  const v1 = await post('validatepreorder/', { preordercode: knownGood });
  console.log(`canvas/stretched/10x8 → ${JSON.stringify(v1.data)}`);

  // 3. Probe paper/poster combinations to find valid sizes
  console.log('\n=== PROBE paper|poster sizes ===');
  const paperSizes = [
    [8, 10], [8, 12], [10, 8], [11, 14], [12, 16], [12, 18],
    [16, 20], [18, 24], [20, 24], [20, 30], [24, 30], [24, 36],
  ];
  for (const [w, h] of paperSizes) {
    const code = `1|paper|poster|vertical|${w}|${h}`;
    const r = await post('validatepreorder/', { preordercode: code });
    const ok = (r.data as Record<string, unknown>)?.status === true;
    console.log(`  ${ok ? '✓' : '✗'} ${code}`);
  }

  // 4. Probe paper types
  console.log('\n=== PROBE paper types (12x18) ===');
  const paperTypes = [
    'poster', 'photo', 'fine art', 'fineart', 'lustre', 'gloss',
    'matte', 'satin', 'metallic', 'hd', 'al', 'alw',
  ];
  for (const t of paperTypes) {
    const code = `1|paper|${t}|vertical|12|18`;
    const r = await post('validatepreorder/', { preordercode: code });
    const ok = (r.data as Record<string, unknown>)?.status === true;
    console.log(`  ${ok ? '✓' : '✗'} paper|${t}|12x18`);
  }

  // 5. Probe canvas types
  console.log('\n=== PROBE canvas types (16x20) ===');
  const canvasTypes = [
    'stretched', 'roll', 'gallery', 'print', 'classic',
  ];
  for (const t of canvasTypes) {
    const code = `1|canvas|${t}|horizontal|16|20`;
    const r = await post('validatepreorder/', { preordercode: code });
    const ok = (r.data as Record<string, unknown>)?.status === true;
    console.log(`  ${ok ? '✓' : '✗'} canvas|${t}|16x20`);
  }

  // 6. Probe valid canvas/stretched sizes
  console.log('\n=== PROBE canvas|stretched sizes ===');
  for (const [w, h] of paperSizes) {
    const code = `1|canvas|stretched|horizontal|${w}|${h}`;
    const r = await post('validatepreorder/', { preordercode: code });
    const ok = (r.data as Record<string, unknown>)?.status === true;
    console.log(`  ${ok ? '✓' : '✗'} canvas|stretched|${w}x${h}`);
  }

  // 7. Probe other materials
  console.log('\n=== PROBE materials (12x16 horizontal) ===');
  const materials = ['metal', 'wood', 'panel', 'acrylic', 'aluminum', 'glass'];
  for (const m of materials) {
    for (const t of ['al', 'hd', 'print', 'matte', 'gloss']) {
      const code = `1|${m}|${t}|horizontal|12|16`;
      const r = await post('validatepreorder/', { preordercode: code });
      const ok = (r.data as Record<string, unknown>)?.status === true;
      if (ok) console.log(`  ✓ ${m}|${t}|12x16`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
