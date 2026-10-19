import { Router } from 'express'
import {
  getImageOrbitGalleryPhoto,
  getImageOrbitGalleryPhotos,
} from '../controllers/imageOrbitGalleryController.js'

const imageOrbitGalleryRoutes = Router()

imageOrbitGalleryRoutes.get('/photos', getImageOrbitGalleryPhotos)
imageOrbitGalleryRoutes.get('/photo/:fileName', getImageOrbitGalleryPhoto)

export default imageOrbitGalleryRoutes
