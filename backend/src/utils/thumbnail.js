// ---------------------------------------------------------------------------
// On-demand resized copies of gallery photos. The originals are multi-megabyte
// camera files; the galleries only need a few hundred pixels per card, so we
// serve a small WebP and cache it on disk so each photo is resized only once.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import os from 'os'

// Prefer a cache next to the app; fall back to the OS temp folder on hosts where
// the app directory is read-only.
const CACHE_DIR_CANDIDATES = [
  new URL('../../.cache/thumbs/', import.meta.url).pathname,
  path.join(os.tmpdir(), 'world-thumbs'),
]
let cacheDir = null

function resolveCacheDir() {
  if (cacheDir) return cacheDir
  for (const candidate of CACHE_DIR_CANDIDATES) {
    try {
      fs.mkdirSync(candidate, { recursive: true })
      fs.accessSync(candidate, fs.constants.W_OK)
      cacheDir = candidate
      return cacheDir
    } catch {
      // try the next location
    }
  }
  throw new Error('No writable thumbnail cache directory')
}

// Loaded on first use so a platform where sharp's native binary is missing
// only loses thumbnails instead of stopping the whole server from starting.
let sharpPromise = null
function loadSharp() {
  sharpPromise ??= import('sharp').then((module) => module.default)
  return sharpPromise
}
const MIN_WIDTH = 64
const MAX_WIDTH = 2048
const inFlight = new Map()

export function parseThumbnailWidth(value) {
  const width = Math.round(Number(value))
  if (!Number.isFinite(width) || width <= 0) return null
  return Math.min(Math.max(width, MIN_WIDTH), MAX_WIDTH)
}

export async function getThumbnailPath(filePath, width) {
  const directory = resolveCacheDir()
  const { mtimeMs } = fs.statSync(filePath)
  const key = `${path.basename(filePath)}-${Math.round(mtimeMs)}-${width}`.replace(/[^\w.-]/g, '_')
  const cachedPath = path.join(directory, `${key}.webp`)
  if (fs.existsSync(cachedPath)) return cachedPath

  let pending = inFlight.get(cachedPath)
  if (!pending) {
    pending = (async () => {
      const sharp = await loadSharp()
      const tmpPath = `${cachedPath}.${process.pid}.tmp`
      await sharp(filePath, { failOn: 'none' })
        .rotate() // apply EXIF orientation, then drop the tag
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(tmpPath)
      fs.renameSync(tmpPath, cachedPath)
      return cachedPath
    })().finally(() => inFlight.delete(cachedPath))
    inFlight.set(cachedPath, pending)
  }
  return pending
}

// Resize every photo in a folder ahead of time so the first visitor never
// waits on sharp. Runs in the background with a small concurrency limit.
export async function warmThumbnails(dir, width, concurrency = 3) {
  const files = fs
    .readdirSync(dir)
    .filter((file) => /\.(jpe?g|png|webp|avif)$/i.test(file))
    .map((file) => path.join(dir, file))
  let next = 0
  let failures = 0
  const worker = async () => {
    // Give up early if resizing is unavailable here (e.g. no sharp binary).
    while (next < files.length && failures < 3) {
      const filePath = files[next++]
      try {
        await getThumbnailPath(filePath, width)
      } catch (error) {
        failures++
        console.error(`Could not pre-resize ${path.basename(filePath)}:`, error.message)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return files.length
}
