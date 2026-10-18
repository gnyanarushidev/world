import { getStorageConfig } from '../config/storage.js'

const imageExtensionPattern = /\.(avif|gif|jpe?g|png|webp)$/i
const authorizationUrl = 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account'

async function authorizeAccount(keyId, applicationKey) {
  const credentials = Buffer.from(`${keyId}:${applicationKey}`).toString('base64')
  const response = await fetch(authorizationUrl, {
    headers: { Authorization: `Basic ${credentials}` },
  })

  if (!response.ok) {
    throw new Error(`Backblaze authorization failed with status ${response.status}`)
  }

  return response.json()
}

async function findBucket(apiUrl, authorizationToken, accountId, bucketName) {
  const response = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
    method: 'POST',
    headers: {
      Authorization: authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId, bucketName }),
  })

  if (!response.ok) {
    throw new Error(`Backblaze bucket lookup failed with status ${response.status}`)
  }

  const data = await response.json()
  const bucket = data.buckets?.find((item) => item.bucketName === bucketName)
  if (!bucket) throw new Error(`Backblaze bucket not found: ${bucketName}`)
  return bucket
}

async function listAllFiles(apiUrl, authorizationToken, bucketId, prefix) {
  const files = []
  let startFileName

  do {
    const response = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: {
        Authorization: authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucketId,
        prefix,
        maxFileCount: 1000,
        startFileName,
      }),
    })

    if (!response.ok) {
      throw new Error(`Backblaze file listing failed with status ${response.status}`)
    }

    const data = await response.json()
    files.push(...(data.files ?? []))
    startFileName = data.nextFileName
  } while (startFileName)

  return files
}

export async function listSpiralGalleryPhotos() {
  const { bucket: bucketName, prefix, keyId, applicationKey } = getStorageConfig()
  const authorization = await authorizeAccount(keyId, applicationKey)
  const bucket = await findBucket(
    authorization.apiUrl,
    authorization.authorizationToken,
    authorization.accountId,
    bucketName,
  )
  const files = await listAllFiles(
    authorization.apiUrl,
    authorization.authorizationToken,
    bucket.bucketId,
    prefix,
  )

  return files
    .filter((file) => imageExtensionPattern.test(file.fileName))
    .map((file) => ({
      key: file.fileName,
      url: `/api/spiral-gallery/photo?key=${encodeURIComponent(file.fileName)}`,
      size: file.contentLength,
      lastModified: file.uploadTimestamp
        ? new Date(file.uploadTimestamp).toISOString()
        : null,
    }))
}

export async function downloadSpiralGalleryPhoto(fileName) {
  const { bucket: bucketName, prefix, keyId, applicationKey } = getStorageConfig()
  if (!fileName || !fileName.startsWith(prefix) || !imageExtensionPattern.test(fileName)) {
    throw new Error('Invalid spiral gallery photo key')
  }

  const authorization = await authorizeAccount(keyId, applicationKey)
  const downloadUrl = `${authorization.downloadUrl}/file/${bucketName}/${fileName
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const response = await fetch(downloadUrl, {
    headers: { Authorization: authorization.authorizationToken },
  })

  if (!response.ok) {
    throw new Error(`Backblaze photo download failed with status ${response.status}`)
  }

  return {
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    body: Buffer.from(await response.arrayBuffer()),
  }
}
