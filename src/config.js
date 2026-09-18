export const REQUIRED_ENV = [
  'DMF_MESSAGE_ID',
  'DMF_SENDER_PARTY_ID',
  'DMF_SENDER_NAME',
  'DMF_RELEASE_TITLE',
  'DMF_ARTIST_NAME',
  'DMF_ISRC',
  'DMF_UPC',
  'DMF_DURATION',
  'DMF_OWNER_NAME',
  'DMF_OWNER_SHARE'
]

export function getRuntimeConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').toLowerCase()
  const missing = REQUIRED_ENV.filter((key) => !String(env[key] || '').trim())

  if (nodeEnv === 'production' && missing.length > 0) {
    throw new Error(`Production config missing required values: ${missing.join(', ')}`)
  }

  return {
    nodeEnv,
    missing,
    release: {
      messageId: env.DMF_MESSAGE_ID,
      senderPartyId: env.DMF_SENDER_PARTY_ID,
      senderName: env.DMF_SENDER_NAME,
      title: env.DMF_RELEASE_TITLE,
      artist: env.DMF_ARTIST_NAME,
      isrc: env.DMF_ISRC,
      upc: env.DMF_UPC,
      duration: env.DMF_DURATION,
      owners: [{ name: env.DMF_OWNER_NAME, share: Number(env.DMF_OWNER_SHARE || 0) }]
    }
  }
}
