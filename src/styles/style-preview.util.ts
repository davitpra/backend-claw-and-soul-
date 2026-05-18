export function derivePreviewUrl(
  images: { imageUrl: string; isPrimary: boolean }[],
): string | null {
  return (
    images.find((i) => i.isPrimary)?.imageUrl ?? images[0]?.imageUrl ?? null
  );
}
