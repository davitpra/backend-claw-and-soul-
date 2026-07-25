import { Prisma } from '@prisma/client';

// Proyección de `Style` para las rutas `@Public()` (`/styles`, `/styles/:id`,
// `/styles/category/:c`, `/compat/styles`). Deja fuera la configuración del
// pipeline —`promptTemplate`, `templateVars`, `strategyKey`, `visionConfigId`,
// `imageGenConfigId`— que es el prompt engineering del negocio y solo se sirve
// bajo `@Roles('admin')` (`StylesService.findOneForAdmin`).
//
// `templateVarOptions` sí se queda: es el contrato del formulario de opciones
// del storefront. `pbnConfig` también, lo consume el estudio PBN.
export const PUBLIC_STYLE_SELECT = {
  id: true,
  name: true,
  displayName: true,
  category: true,
  difficulty: true,
  styleReferenceUrl: true,
  isActive: true,
  templateVarOptions: true,
  pbnConfig: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StyleSelect;

// `isPrimary`/`orderIndex` son necesarios para `derivePreviewUrl` y el orden de
// la galería del estilo; `storageKey` es interno y no sale.
export const PUBLIC_STYLE_IMAGE_SELECT = {
  id: true,
  imageUrl: true,
  altImage: true,
  orderIndex: true,
  isPrimary: true,
} satisfies Prisma.StyleImageSelect;
