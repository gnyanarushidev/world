import { parseThumbnailWidth } from '../utils/thumbnail.js'
import {
  downloadImageOrbitGalleryPhoto,
  listImageOrbitGalleryPhotos,
} from '../models/imageOrbitGalleryModel.js'

export async function getImageOrbitGalleryPhotos(_request, response) {
  try {
    const { photos, nextFileName } = await listImageOrbitGalleryPhotos()
    response.json({ photos, nextFileName })
  } catch (error) {
    console.error('Unable to list image orbit gallery photos:', error)
    response.status(500).json({ error: 'Unable to load image orbit gallery photos' })
  }
}

export async function getImageOrbitGalleryPhoto(request, response) {
  try {
    const fileName = decodeURIComponent(request.params.fileName)
    const { contentType, body } = await downloadImageOrbitGalleryPhoto(
      fileName,
      parseThumbnailWidth(request.query.w)
    )

    response.setHeader('Content-Type', contentType)
    response.setHeader('Cache-Control', 'public, max-age=604800')

    if (typeof body.pipe === 'function') {
      body.pipe(response)
    } else {
      response.send(body)
    }
  } catch (error) {
    console.error('Unable to download image orbit gallery photo:', error)
    response.status(error.message === 'Photo not found' ? 404 : 500).json({
      error: error.message === 'Photo not found' ? 'Photo not found' : 'Unable to load image orbit gallery photo',
    })
  }
}
