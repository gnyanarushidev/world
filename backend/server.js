import dotenv from 'dotenv'
import app from './src/app.js'
import { getAssetDir } from './src/config/storage.js'
import { warmThumbnails } from './src/utils/thumbnail.js'

dotenv.config({ path: new URL('./.env', import.meta.url) })

const port = Number(process.env.PORT ?? 3001)

app.listen(port, () => {
  console.log(`World backend listening on http://localhost:${port}`)

  // Widths must match what the frontend requests (see THUMBNAIL_WIDTH / THUMB_WIDTH).
  void Promise.all([
    warmThumbnails(getAssetDir('image-orbit'), 512),
    warmThumbnails(getAssetDir('spiral'), 1024),
  ]).then(([orbit, spiral]) => console.log(`Thumbnails ready (${orbit} orbit, ${spiral} spiral)`))
})