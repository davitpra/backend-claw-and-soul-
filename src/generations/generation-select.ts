import { Prisma } from '@prisma/client';

// Proyecciones de `Generation` para las respuestas que salen del backend.
//
// Son whitelists (`select`), no un helper que borre campos: si mañana el schema
// gana una columna sensible, no se filtra sola. Nunca deben incluir el prompt
// engineering ni el detalle del pipeline —`prompt`, `negativePrompt`,
// `finalPrompt`, `promptSnapshot`, `visionAnalysis`, `provider`, `metadata`,
// `falRequestId`, `resultStorageKey`, `processingTimeSeconds`, `isAdminTest`—
// que son IP del negocio y solo se exponen bajo `@Roles('admin')` (ver
// `StylesService.getImageGeneration`).

// Detalle y listado del dueño autenticado (`/generations`).
export const USER_GENERATION_SELECT = {
  id: true,
  status: true,
  type: true,
  resultUrl: true,
  thumbnailUrl: true,
  errorMessage: true,
  isPublic: true,
  isFavorite: true,
  createdAt: true,
  completedAt: true,
  petId: true,
  styleId: true,
  formatId: true,
  productRefId: true,
  pet: { select: { id: true, name: true, species: true, breed: true } },
  style: { select: { id: true, displayName: true, category: true } },
  // Producto para el que se generó la obra. `template`/`artKind` son los dos ejes
  // con los que el storefront nombra el producto de cara al cliente y ya salen
  // públicos por `/products/:handle/variants`: exponerlos aquí no filtra nada.
  productRef: {
    select: {
      id: true,
      displayName: true,
      template: true,
      artKind: true,
    },
  },
} satisfies Prisma.GenerationSelect;

// Galería pública (`/gallery`), servida sin autenticación. Además del prompt
// omite `userId`: correlacionar obras con cuentas tampoco es información que
// deba salir a un visitante anónimo.
export const PUBLIC_GENERATION_SELECT = {
  id: true,
  status: true,
  type: true,
  resultUrl: true,
  thumbnailUrl: true,
  createdAt: true,
  pet: { select: { name: true, species: true, breed: true } },
  style: { select: { id: true, name: true, category: true } },
} satisfies Prisma.GenerationSelect;
