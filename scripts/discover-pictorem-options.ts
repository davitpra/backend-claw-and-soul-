import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const API_KEY = process.env.PICTOREM_API_KEY ?? '';
const BASE_URL =
  process.env.PICTOREM_API_URL ?? 'https://www.pictorem.com/artflow/0.1';

async function validate(code: string): Promise<{ ok: boolean; sanitized?: string; errors?: string[] }> {
  const form = new FormData();
  form.append('preordercode', code);
  const res = await fetch(`${BASE_URL}/validatepreorder/`, {
    method: 'POST',
    headers: { artFlowKey: API_KEY },
    body: form,
  });
  const json = (await res.json()) as Record<string, unknown>;
  const data = (json.data ?? json) as Record<string, unknown>;
  return {
    ok: json.status === true || data.status === true,
    sanitized: data.preordersanitize as string | undefined,
    errors: data.errorlist as string[] | undefined,
  };
}

async function probe(label: string, codes: string[]) {
  console.log(`\n=== ${label} ===`);
  for (const code of codes) {
    const r = await validate(code);
    if (r.ok) {
      const extra = r.errors?.length ? ` ⚠ ${r.errors.join(', ')}` : '';
      console.log(`  ✓ ${code}${extra}`);
      if (r.sanitized && r.sanitized !== code) console.log(`    → sanitized: ${r.sanitized}`);
    } else {
      // only log failures when probing small targeted sets
    }
  }
}

async function probeAll(label: string, codes: string[]) {
  console.log(`\n=== ${label} ===`);
  for (const code of codes) {
    const r = await validate(code);
    const mark = r.ok ? '✓' : '✗';
    const extra = r.ok && r.errors?.length ? ` ⚠ ${r.errors.join('; ')}` : '';
    console.log(`  ${mark} ${code}${extra}`);
    if (r.ok && r.sanitized && r.sanitized !== code) console.log(`    → ${r.sanitized}`);
  }
}

async function main() {
  // Canvas additional options
  const canvasWraps = ['c15', 'c175', 'c2', 'c3'];
  const canvasFrames = ['regular', 'floater', 'gallery', 'none', 'noframe'];
  const canvasBorder = ['mirrorimage', 'stretchedge', 'blackborder', 'whiteborder'];

  const canvasCodes = [
    ...canvasWraps.map(w => `1|canvas|stretched|horizontal|16|20|${w}`),
    ...canvasFrames.map(f => `1|canvas|stretched|horizontal|16|20|c15|${f}`),
    ...canvasBorder.map(b => `1|canvas|stretched|horizontal|16|20|${b}`),
    '1|canvas|stretched|horizontal|16|20|c15|regular|mirrorimage',
    '1|canvas|stretched|horizontal|16|20|c15|floater|mirrorimage',
  ];
  await probe('CANVAS additional options', canvasCodes);

  // Paper/poster additional: framing options
  const paperFrames = [
    'frame', 'noframe', 'none', 'regular',
    'blackframe', 'whiteframe', 'brownframe', 'naturalframe',
    'plexiglass', 'noplexiglass',
    'wire', 'nowire', 'hanger', 'nohanger',
    'mat', 'nomat',
  ];
  await probe('PAPER|POSTER framing (12x18)', paperFrames.map(f => `1|paper|poster|vertical|12|18|${f}`));

  // Paper multi-option combos
  const paperCombos = [
    '1|paper|poster|vertical|12|18|frame|plexiglass',
    '1|paper|poster|vertical|12|18|frame|plexiglass|wire',
    '1|paper|poster|vertical|12|18|noframe',
    '1|paper|poster|vertical|12|18|blackframe|plexiglass|wire',
    '1|paper|poster|vertical|12|18|blackframe|plexiglass|nowire',
    '1|paper|poster|vertical|12|18|whiteframe|plexiglass|wire',
    '1|paper|poster|vertical|12|18|whiteframe|noplexiglass|wire',
  ];
  await probe('PAPER|POSTER combos', paperCombos);

  // Metal options
  const metalOpts = ['al', 'hd', 'matte', 'gloss', 'none', 'noframe', 'frame'];
  await probe('METAL|AL additional', metalOpts.map(o => `1|metal|al|horizontal|12|16|${o}`));

  // Acrylic options
  await probe('ACRYLIC|AL additional', ['none', 'noframe', 'frame', 'regular'].map(o => `1|acrylic|al|horizontal|12|16|${o}`));

  // Paper types: test colored frames per type
  const paperTypes = ['photo', 'fineart', 'lustre', 'gloss', 'matte', 'satin', 'metallic', 'hd'];
  const coloredFrameCombos = [
    'frame', 'frame|plexiglass', 'frame|plexiglass|wire',
    'blackframe', 'blackframe|plexiglass', 'blackframe|plexiglass|wire',
    'whiteframe', 'whiteframe|plexiglass', 'whiteframe|plexiglass|wire',
    'brownframe', 'brownframe|plexiglass', 'brownframe|plexiglass|wire',
    'naturalframe', 'naturalframe|plexiglass', 'naturalframe|plexiglass|wire',
  ];
  for (const t of paperTypes) {
    await probe(`PAPER|${t.toUpperCase()} frame options`, coloredFrameCombos.map(f => `1|paper|${t}|vertical|12|18|${f}`));
  }

  // Canvas: test bordercolorhex requirement
  await probe('CANVAS with bordercolorhex', [
    '1|canvas|stretched|horizontal|16|20|c15|regular|mirrorimage|bordercolorhex|000000',
    '1|canvas|stretched|horizontal|16|20|bordercolorhex|000000|c15|regular',
    '1|canvas|stretched|horizontal|16|20|c15|regular|bordercolorhex|000000',
    '1|canvas|stretched|horizontal|16|20|mirrorimage|bordercolorhex|000000',
    '1|canvas|stretched|horizontal|16|20|bordercolor|c15|regular',
  ]);

  // Canvas framing: probe whether floater/gallery framing is reachable via API
  await probeAll('CANVAS framing — type variants', [
    '1|canvas|floater|horizontal|16|20',
    '1|canvas|gallery|horizontal|16|20',
    '1|canvas|framed|horizontal|16|20',
    '1|canvas|frame|horizontal|16|20',
    '1|canvas|floatframe|horizontal|16|20',
    '1|canvas|floaterframe|horizontal|16|20',
  ]);
  await probeAll('CANVAS framing — additional codes', [
    '1|canvas|stretched|horizontal|16|20|frame',
    '1|canvas|stretched|horizontal|16|20|framed',
    '1|canvas|stretched|horizontal|16|20|floaterframe',
    '1|canvas|stretched|horizontal|16|20|c15|floaterframe',
    '1|canvas|stretched|horizontal|16|20|c15|floater|black',
    '1|canvas|stretched|horizontal|16|20|c15|floater|blackframe',
    '1|canvas|stretched|horizontal|16|20|c15|floater|white',
    '1|canvas|stretched|horizontal|16|20|c15|floater|natural',
    '1|canvas|stretched|horizontal|16|20|c15|floater|walnut',
    '1|canvas|stretched|horizontal|16|20|floater|black',
    '1|canvas|stretched|horizontal|16|20|floater|blackframe',
    '1|canvas|stretched|horizontal|16|20|c15|gallery|black',
    '1|canvas|stretched|horizontal|16|20|c2|floater|black',
    '1|canvas|stretched|horizontal|16|20|c15|floater|black|bordercolorhex|000000',
  ]);

  // Full canvas sizes for catalog
  await probeAll('CANVAS|STRETCHED full size list', [
    [4,6],[5,7],[6,8],[6,9],[8,8],[8,10],[8,12],[10,10],[10,8],
    [11,14],[12,12],[12,16],[12,18],[14,11],[16,12],[16,16],[16,20],
    [18,18],[18,24],[20,16],[20,20],[20,24],[20,30],[24,20],[24,24],
    [24,30],[24,36],[30,24],[30,40],[36,24],[36,48],[40,30],[48,36],
  ].map(([w,h]) => `1|canvas|stretched|horizontal|${w}|${h}`));

  // Full paper/poster sizes
  await probeAll('PAPER|POSTER full size list', [
    [4,6],[5,7],[6,8],[6,9],[8,8],[8,10],[8,12],[10,10],[10,8],
    [11,14],[12,12],[12,16],[12,18],[14,11],[16,12],[16,16],[16,20],
    [18,18],[18,24],[20,16],[20,20],[20,24],[20,30],[24,20],[24,24],
    [24,30],[24,36],[30,40],[36,48],
  ].map(([w,h]) => `1|paper|poster|vertical|${w}|${h}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
