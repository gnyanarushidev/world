// ---------------------------------------------------------------------------
// Local filesystem model for the media board: every photo and video from both
// asset folders. Photos reuse the existing gallery photo routes (so thumbnails
// stay shared); videos are streamed from the media board's own route.
// ---------------------------------------------------------------------------

import fs from 'fs'
import path from 'path'
import { getAssetDir } from '../config/storage.js'

const imageExtensionPattern = /\.(avif|gif|jpe?g|png|webp)$/i
const videoExtensionPattern = /\.(mp4|webm|mov|m4v)$/i

const PHOTO_ROUTES = {
  'image-orbit': '/api/image-orbit-gallery/photo',
  spiral: '/api/spiral-gallery/photo',
}

const VIDEO_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
}

function listFiles(gallery, pattern) {
  return fs.readdirSync(getAssetDir(gallery)).filter((file) => pattern.test(file)).sort()
}

export async function listMediaBoardItems() {
  const photos = Object.entries(PHOTO_ROUTES).flatMap(([gallery, route]) =>
    listFiles(gallery, imageExtensionPattern).map((fileName) => ({
      type: 'photo',
      key: `${gallery}/${fileName}`,
      url: `${route}/${encodeURIComponent(fileName)}`,
    }))
  )
  const videos = listFiles('image-orbit', videoExtensionPattern).map((fileName) => ({
    type: 'video',
    key: `image-orbit/${fileName}`,
    url: `/api/media-board/video/${encodeURIComponent(fileName)}`,
  }))

  // Spread the videos evenly through the photos instead of bunching them up.
  const items = []
  const gap = videos.length ? Math.ceil(photos.length / videos.length) : Infinity
  let nextVideo = 0
  photos.forEach((photo, index) => {
    items.push(photo)
    if ((index + 1) % gap === 0 && nextVideo < videos.length) items.push(videos[nextVideo++])
  })
  items.push(...videos.slice(nextVideo))

  return { items, photoCount: photos.length, videoCount: videos.length }
}

export function resolveMediaBoardVideo(fileName) {
  const dir = path.resolve(getAssetDir('image-orbit'))
  const filePath = path.resolve(dir, fileName)

  // Security: prevent path traversal
  if (path.dirname(filePath) !== dir) throw new Error('Invalid video key')

  const ext = path.extname(fileName).toLowerCase()
  if (!VIDEO_TYPES[ext] || !fs.existsSync(filePath)) throw new Error('Video not found')

  return { filePath, contentType: VIDEO_TYPES[ext] }
}
