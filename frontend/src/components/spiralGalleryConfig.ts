// ---------------------------------------------------------------------------
// Spiral gallery configuration & image source.
//
// The spiral geometry is independent of the image source, so the Picsum URLs
// below can be swapped for real images later without touching the geometry.
// ---------------------------------------------------------------------------

export interface SpiralGalleryConfig {
  imageCount: number
  radius: number
  imagesPerTurn: number
  verticalSpacing: number
  baseCardHeight: number
  heightVariance: number
  rotationSpeed: number
  scrollRotationForce: number
  rotationSmoothing: number
  maxRotationSpeed: number
  squeezeIntensity: number
  squeezeWidth: number
  pointerParallax: number
  breathingAmount: number
  cameraElevation: number
  cameraLookAtY: number
  cameraDistance: number
}

export const DEFAULT_CONFIG: SpiralGalleryConfig = {
  imageCount: 36,
  radius: 7,
  imagesPerTurn: 7,
  verticalSpacing: 0.72,
  baseCardHeight: 2.45,
  heightVariance: 0.45,
  rotationSpeed: 0.06,
  scrollRotationForce: 0.5,
  rotationSmoothing: 0.1,
  maxRotationSpeed: 12,
  squeezeIntensity: 0.5,
  squeezeWidth: 7.5,
  pointerParallax: 0.42,
  breathingAmount: 0.025,
  cameraElevation: 0,
  cameraLookAtY: 0,
  cameraDistance: 12,
}

// Distinct Picsum seeds give distinct photographs while keeping URLs stable.
// Geometry does not depend on this list; swap in real URLs whenever ready.
export const spiralImageUrls = (count: number): string[] =>
  Array.from({ length: count }, (_, i) =>
    `https://picsum.photos/seed/spiral-${i + 1}/800/1000`
  )
