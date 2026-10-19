// ---------------------------------------------------------------------------
// Local assets configuration.
//
// Images are served directly from backend/src/assets/<folder>/, not from
// Backblaze cloud storage. No credentials required.
// ---------------------------------------------------------------------------

const GALLERY_DIRS = {
  spiral: 'withme',
  'image-orbit': 'chinnu',
}

export function getAssetDir(gallery = 'spiral') {
  const dir = GALLERY_DIRS[gallery]
  if (!dir) throw new Error(`Unknown gallery: ${gallery}`)
  return new URL(`../assets/${dir}/`, import.meta.url).pathname
}
