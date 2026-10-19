// ---------------------------------------------------------------------------
// Local filesystem model for spiral gallery photos.
// Reads image files directly from backend/src/assets/withme/.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import { getAssetDir } from '../config/storage.js'

const imageExtensionPattern = /\.(avif|gif|jpe?g|png|webp|svg)$/i

export async function listSpiralGalleryPhotos() {
  const dir = getAssetDir('spiral')
  const files = fs.readdirSync(dir).filter((file) => imageExtensionPattern.test(file))

  return {
    photos: files.map((fileName) => ({
      key: fileName,
      url: `/api/spiral-gallery/photo/${encodeURIComponent(fileName)}`,
      size: fs.statSync(path.join(dir, fileName)).size,
      lastModified: fs.statSync(path.join(dir, fileName)).mtime.toISOString(),
    })),
    nextFileName: null,
  }
}

export async function downloadSpiralGalleryPhoto(fileName) {
  const dir = getAssetDir('spiral')
  const filePath = path.resolve(path.join(dir, fileName))
  const dirResolved = path.resolve(dir)

  // Security: prevent path traversal
  if (!filePath.startsWith(dirResolved)) {
    throw new Error('Invalid spiral gallery photo key')
  }

  if (!fs.existsSync(filePath)) {
    throw new Error('Photo not found')
  }

  const ext = path.extname(fileName).toLowerCase()
  let contentType = 'application/octet-stream'
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
  else if (ext === '.png') contentType = 'image/png'
  else if (ext === '.svg') contentType = 'image/svg+xml'
  else if (ext === '.gif') contentType = 'image/gif'
  else if (ext === '.webp') contentType = 'image/webp'
  else if (ext === '.avif') contentType = 'image/avif'

  return {
    contentType,
    body: fs.createReadStream(filePath),
  }
}
