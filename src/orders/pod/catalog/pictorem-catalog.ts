export interface PodCatalogOption {
  code: string;
  label: string;
  additional: string[];
}

export interface PodCatalogType {
  code: string;
  label: string;
  options: PodCatalogOption[];
}

export interface PodCatalogSize {
  width: number;
  height: number;
  label: string;
}

export interface PodCatalogMaterial {
  code: string;
  label: string;
  types: PodCatalogType[];
  sizes: PodCatalogSize[];
}

export interface PodCatalog {
  materials: PodCatalogMaterial[];
}

const COMMON_SIZES: PodCatalogSize[] = [
  { width: 4, height: 6, label: '4" × 6"' },
  { width: 5, height: 7, label: '5" × 7"' },
  { width: 6, height: 8, label: '6" × 8"' },
  { width: 8, height: 8, label: '8" × 8"' },
  { width: 8, height: 10, label: '8" × 10"' },
  { width: 8, height: 12, label: '8" × 12"' },
  { width: 11, height: 14, label: '11" × 14"' },
  { width: 12, height: 16, label: '12" × 16"' },
  { width: 12, height: 18, label: '12" × 18"' },
  { width: 16, height: 20, label: '16" × 20"' },
  { width: 18, height: 24, label: '18" × 24"' },
  { width: 20, height: 24, label: '20" × 24"' },
  { width: 20, height: 30, label: '20" × 30"' },
  { width: 24, height: 30, label: '24" × 30"' },
  { width: 24, height: 36, label: '24" × 36"' },
  { width: 30, height: 40, label: '30" × 40"' },
  { width: 36, height: 48, label: '36" × 48"' },
];

const CANVAS_OPTIONS: PodCatalogOption[] = [
  { code: 'none', label: 'Sin opciones', additional: [] },
  { code: 'mirrorimage', label: 'Mirror image (reflejo en bordes)', additional: ['mirrorimage'] },
  { code: 'c15_regular_mirror', label: 'Wrap 1.5" + mirror image', additional: ['c15', 'regular', 'mirrorimage'] },
];

const PAPER_OPTIONS: PodCatalogOption[] = [
  { code: 'none', label: 'Sin marco', additional: [] },
  { code: 'frame_plexi', label: 'Marco + plexiglás', additional: ['frame', 'plexiglass'] },
];

const RIGID_OPTIONS: PodCatalogOption[] = [
  { code: 'none', label: 'Sin opciones', additional: [] },
];

export const PICTOREM_CATALOG: PodCatalog = {
  materials: [
    {
      code: 'canvas',
      label: 'Canvas',
      sizes: COMMON_SIZES,
      types: [
        { code: 'stretched', label: 'Stretched (estirado)', options: CANVAS_OPTIONS },
        { code: 'roll', label: 'Roll (rollo)', options: CANVAS_OPTIONS },
        { code: 'gallery', label: 'Gallery wrap', options: CANVAS_OPTIONS },
        { code: 'print', label: 'Canvas print', options: CANVAS_OPTIONS },
        { code: 'classic', label: 'Classic', options: CANVAS_OPTIONS },
      ],
    },
    {
      code: 'paper',
      label: 'Papel',
      sizes: COMMON_SIZES,
      types: [
        { code: 'poster', label: 'Poster', options: PAPER_OPTIONS },
        { code: 'photo', label: 'Foto', options: PAPER_OPTIONS },
        { code: 'fineart', label: 'Fine Art', options: PAPER_OPTIONS },
        { code: 'lustre', label: 'Lustre', options: PAPER_OPTIONS },
        { code: 'gloss', label: 'Brillo (gloss)', options: PAPER_OPTIONS },
        { code: 'matte', label: 'Mate', options: PAPER_OPTIONS },
        { code: 'satin', label: 'Satinado', options: PAPER_OPTIONS },
        { code: 'metallic', label: 'Metálico', options: PAPER_OPTIONS },
        { code: 'hd', label: 'HD', options: PAPER_OPTIONS },
        { code: 'al', label: 'AL', options: PAPER_OPTIONS },
      ],
    },
    {
      code: 'metal',
      label: 'Metal',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Aluminum', options: RIGID_OPTIONS },
        { code: 'hd', label: 'HD Metal', options: RIGID_OPTIONS },
        { code: 'print', label: 'Metal print', options: RIGID_OPTIONS },
        { code: 'matte', label: 'Mate', options: RIGID_OPTIONS },
        { code: 'gloss', label: 'Brillante', options: RIGID_OPTIONS },
      ],
    },
    {
      code: 'acrylic',
      label: 'Acrílico',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Acrylic', options: RIGID_OPTIONS },
        { code: 'hd', label: 'HD Acrylic', options: RIGID_OPTIONS },
        { code: 'print', label: 'Acrylic print', options: RIGID_OPTIONS },
        { code: 'matte', label: 'Mate', options: RIGID_OPTIONS },
        { code: 'gloss', label: 'Brillante', options: RIGID_OPTIONS },
      ],
    },
    {
      code: 'wood',
      label: 'Madera',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Wood print', options: RIGID_OPTIONS },
        { code: 'hd', label: 'HD Wood', options: RIGID_OPTIONS },
        { code: 'print', label: 'Wood print', options: RIGID_OPTIONS },
        { code: 'matte', label: 'Mate', options: RIGID_OPTIONS },
        { code: 'gloss', label: 'Brillante', options: RIGID_OPTIONS },
      ],
    },
    {
      code: 'panel',
      label: 'Panel',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Panel', options: RIGID_OPTIONS },
        { code: 'hd', label: 'HD Panel', options: RIGID_OPTIONS },
        { code: 'print', label: 'Panel print', options: RIGID_OPTIONS },
        { code: 'matte', label: 'Mate', options: RIGID_OPTIONS },
        { code: 'gloss', label: 'Brillante', options: RIGID_OPTIONS },
      ],
    },
    {
      code: 'aluminum',
      label: 'Aluminio',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Aluminum', options: RIGID_OPTIONS },
        { code: 'hd', label: 'HD', options: RIGID_OPTIONS },
        { code: 'print', label: 'Print', options: RIGID_OPTIONS },
        { code: 'matte', label: 'Mate', options: RIGID_OPTIONS },
        { code: 'gloss', label: 'Brillante', options: RIGID_OPTIONS },
      ],
    },
    {
      code: 'glass',
      label: 'Vidrio',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Glass', options: RIGID_OPTIONS },
        { code: 'hd', label: 'HD Glass', options: RIGID_OPTIONS },
        { code: 'print', label: 'Glass print', options: RIGID_OPTIONS },
        { code: 'matte', label: 'Mate', options: RIGID_OPTIONS },
        { code: 'gloss', label: 'Brillante', options: RIGID_OPTIONS },
      ],
    },
  ],
};
