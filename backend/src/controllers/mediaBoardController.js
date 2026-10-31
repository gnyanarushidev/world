import {
  listMediaBoardItems,
  resolveMediaBoardVideo,
} from '../models/mediaBoardModel.js'

export async function getMediaBoardItems(_request, response) {
  try {
    response.json(await listMediaBoardItems())
  } catch (error) {
    console.error('Unable to list media board items:', error)
    response.status(500).json({ error: 'Unable to load media board items' })
  }
}

export function getMediaBoardVideo(request, response) {
  let video
  try {
    video = resolveMediaBoardVideo(decodeURIComponent(request.params.fileName))
  } catch {
    response.status(404).json({ error: 'Video not found' })
    return
  }

  // sendFile answers Range requests, which video seeking and iOS playback need.
  response.setHeader('Content-Type', video.contentType)
  response.sendFile(video.filePath, { maxAge: '7d', headers: { 'Content-Type': video.contentType } }, (error) => {
    if (error && !response.headersSent) {
      console.error('Unable to stream media board video:', error)
      response.status(500).json({ error: 'Unable to load video' })
    }
  })
}
