/**
 * Texture variant pool + helpers — all in one place to avoid circular
 * import issues between TapesTable.tsx and hooks/.
 *
 * Uses function declarations (not arrow-const) so the initializer is
 * evaluated eagerly at module-parse time. esbuild minifier hoists function
 * bodies to the top of the scope, making this safe from TDZ reordering bugs
 * that caused "Cannot access 'X' before initialization" at runtime.
 */
export const TEXTURE_VARIANTS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
];

export function randomTextureVariant(): string {
  return TEXTURE_VARIANTS[Math.floor(Math.random() * TEXTURE_VARIANTS.length)];
}

export function nextTextureVariant(current: string): string {
  const idx = TEXTURE_VARIANTS.indexOf(current as typeof TEXTURE_VARIANTS[number]);
  return TEXTURE_VARIANTS[(idx + 1) % TEXTURE_VARIANTS.length];
}
