const requiredVariables = [
  'B2_KEY_ID',
  'B2_APPLICATION_KEY',
  'B2_BUCKET_NAME',
]

export function getStorageConfig() {
  const missingVariables = requiredVariables.filter((name) => !process.env[name])
  if (missingVariables.length > 0) {
    throw new Error(`Missing Backblaze configuration: ${missingVariables.join(', ')}`)
  }

  const configuredPrefix = process.env.B2_PHOTOS_PREFIX || 'worldwithme'

  return {
    bucket: process.env.B2_BUCKET_NAME,
    prefix: configuredPrefix.endsWith('/') ? configuredPrefix : `${configuredPrefix}/`,
    keyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APPLICATION_KEY,
  }
}
