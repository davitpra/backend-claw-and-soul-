export interface PodCatalogChoice {
  value: string;   // UI key — unique within the group
  label: string;
  codes: string[]; // Pictorem additional codes this choice contributes (in canonical order)
}

export interface PodCatalogOptionGroup {
  key: string;
  label: string;
  control: 'select' | 'checkbox';
  choices: PodCatalogChoice[];
  default: string; // value of the default/unset choice
}

export interface PodCatalogType {
  code: string;
  label: string;
  optionGroups: PodCatalogOptionGroup[];
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

// Validated against Pictorem validatepreorder/ API.
// Paper: only `frame|plexiglass` or empty are valid (colored frames give Error::5900).
const PAPER_OPTION_GROUPS: PodCatalogOptionGroup[] = [
  {
    key: 'frame',
    label: 'Marco',
    control: 'checkbox',
    choices: [
      { value: 'off', label: 'Sin marco', codes: [] },
      { value: 'on', label: 'Con marco (incluye plexiglás)', codes: ['frame', 'plexiglass'] },
    ],
    default: 'off',
  },
];

// Canvas: valid clean options are mirrorimage and c15|mirrorimage|regular.
// Canonical order (from preordersanitize): wrap → border → frame_type.
const CANVAS_OPTION_GROUPS: PodCatalogOptionGroup[] = [
  {
    key: 'border',
    label: 'Borde / wrap',
    control: 'select',
    choices: [
      { value: 'none', label: 'Sin opciones', codes: [] },
      { value: 'mirrorimage', label: 'Mirror image', codes: ['mirrorimage'] },
      { value: 'c15_mirror_regular', label: 'Wrap 1.5" + mirror image', codes: ['c15', 'mirrorimage', 'regular'] },
    ],
    default: 'none',
  },
];

// Rigid materials (metal, acrylic, wood, panel, aluminum, glass):
// No meaningful additional options — all codes give Error::5900 except none/empty.
const RIGID_OPTION_GROUPS: PodCatalogOptionGroup[] = [];

export const PICTOREM_CATALOG: PodCatalog = {
  materials: [
    {
      code: 'canvas',
      label: 'Canvas',
      sizes: COMMON_SIZES,
      types: [
        { code: 'stretched', label: 'Stretched (estirado)', optionGroups: CANVAS_OPTION_GROUPS },
        { code: 'roll', label: 'Roll (rollo)', optionGroups: CANVAS_OPTION_GROUPS },
        { code: 'gallery', label: 'Gallery wrap', optionGroups: CANVAS_OPTION_GROUPS },
        { code: 'print', label: 'Canvas print', optionGroups: CANVAS_OPTION_GROUPS },
        { code: 'classic', label: 'Classic', optionGroups: CANVAS_OPTION_GROUPS },
      ],
    },
    {
      code: 'paper',
      label: 'Papel',
      sizes: COMMON_SIZES,
      types: [
        { code: 'poster', label: 'Poster', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'photo', label: 'Foto', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'fineart', label: 'Fine Art', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'lustre', label: 'Lustre', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'gloss', label: 'Brillo (gloss)', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'matte', label: 'Mate', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'satin', label: 'Satinado', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'metallic', label: 'Metálico', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'hd', label: 'HD', optionGroups: PAPER_OPTION_GROUPS },
        { code: 'al', label: 'AL', optionGroups: PAPER_OPTION_GROUPS },
      ],
    },
    {
      code: 'metal',
      label: 'Metal',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Aluminum', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'hd', label: 'HD Metal', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'print', label: 'Metal print', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'matte', label: 'Mate', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'gloss', label: 'Brillante', optionGroups: RIGID_OPTION_GROUPS },
      ],
    },
    {
      code: 'acrylic',
      label: 'Acrílico',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Acrylic', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'hd', label: 'HD Acrylic', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'print', label: 'Acrylic print', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'matte', label: 'Mate', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'gloss', label: 'Brillante', optionGroups: RIGID_OPTION_GROUPS },
      ],
    },
    {
      code: 'wood',
      label: 'Madera',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Wood print', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'hd', label: 'HD Wood', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'print', label: 'Wood print', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'matte', label: 'Mate', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'gloss', label: 'Brillante', optionGroups: RIGID_OPTION_GROUPS },
      ],
    },
    {
      code: 'panel',
      label: 'Panel',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Panel', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'hd', label: 'HD Panel', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'print', label: 'Panel print', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'matte', label: 'Mate', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'gloss', label: 'Brillante', optionGroups: RIGID_OPTION_GROUPS },
      ],
    },
    {
      code: 'aluminum',
      label: 'Aluminio',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Aluminum', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'hd', label: 'HD', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'print', label: 'Print', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'matte', label: 'Mate', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'gloss', label: 'Brillante', optionGroups: RIGID_OPTION_GROUPS },
      ],
    },
    {
      code: 'glass',
      label: 'Vidrio',
      sizes: COMMON_SIZES,
      types: [
        { code: 'al', label: 'Glass', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'hd', label: 'HD Glass', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'print', label: 'Glass print', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'matte', label: 'Mate', optionGroups: RIGID_OPTION_GROUPS },
        { code: 'gloss', label: 'Brillante', optionGroups: RIGID_OPTION_GROUPS },
      ],
    },
  ],
};
